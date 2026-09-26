import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { UnityGateway } from "../services/queue.service.js";
import type {
  Build,
  UnityBuildPayload,
  UnityConnectionState,
  UnityEvent,
  UnityInboundMessage,
  UnityStatus,
} from "../types/build.js";

/** Logger no formato do pino (o mesmo do Fastify), para não acoplar os módulos. */
export interface HubLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
  debug?(payload: unknown, message?: string): void;
}

interface UnityClient {
  socket: WebSocket;
  clientId: string;
  deviceId: string | null;
  status: UnityStatus;
}

export interface UnityWebSocketOptions {
  /** Caminho do upgrade, ex.: `/ws`. */
  path: string;
  logger: HubLogger;
}

/**
 * Conexão com a Unity.
 *
 * Nasce do módulo WebSocket original (`websocket/src/server.ts`), que
 * subia um `WebSocketServer` em porta separada e reenviava toda mensagem
 * recebida para todos os clientes. Aqui ele roda no mesmo processo do
 * Fastify (mesmo HTTP, upgrade em `/ws`) e o repasse indiscriminado foi
 * removido: nesse formato a Unity receberia de volta os próprios
 * `BUILD_STARTED`/`BUILD_COMPLETED` e o protocolo não fecharia.
 *
 * O hub não conhece banco nem fila: ele só sabe se há Unity conectada,
 * se ela está `ready` e como enviar uma build. Quem decide o que fazer
 * com os eventos da Unity é o `QueueService`, via `onEvent`.
 */
export class UnityWebSocketHub implements UnityGateway {
  private readonly server: WebSocketServer;
  private readonly clients = new Map<WebSocket, UnityClient>();
  private readonly handlers: ((event: UnityEvent) => void)[] = [];

  /** Cliente que recebe as builds. Só um por vez — evita build dupla. */
  private active: UnityClient | null = null;

  /** Verdadeiro durante o encerramento: para de aceitar e de emitir eventos. */
  private closing = false;

  constructor(private readonly options: UnityWebSocketOptions) {
    this.server = new WebSocketServer({ noServer: true });
    this.server.on("connection", (socket, request) => this.onConnection(socket, request));
  }

  /**
   * Liga o WebSocket ao servidor HTTP do Fastify, mantendo o processo único.
   * Requisições de upgrade fora do caminho configurado são recusadas.
   *
   * Quando outro canal divide o mesmo HTTP (ex.: o da O.S.), quem monta o
   * app roteia os upgrades e chama `handleUpgrade` diretamente.
   */
  attach(httpServer: Server): void {
    httpServer.on("upgrade", (request, socket, head) => {
      if (!this.handleUpgrade(request, socket, head)) {
        socket.destroy();
      }
    });
  }

  /** Aceita o upgrade se for no caminho da Unity. Devolve `false` se não for. */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");

    if (pathname !== this.options.path) {
      return false;
    }

    this.server.handleUpgrade(request, socket, head, (socketConnection) => {
      this.server.emit("connection", socketConnection, request);
    });

    return true;
  }

  /** Registra quem quer saber dos eventos da Unity (o QueueService). */
  onEvent(handler: (event: UnityEvent) => void): void {
    this.handlers.push(handler);
  }

  /**
   * Entrega um evento aos interessados.
   *
   * Durante o encerramento os eventos são descartados de propósito: o
   * pool do MySQL já foi fechado e a fila não deve tocar no banco com a
   * aplicação morrendo (nem registrar erro por isso).
   */
  private emit(event: UnityEvent): void {
    if (this.closing) {
      return;
    }

    for (const handler of this.handlers) {
      handler(event);
    }
  }

  private onConnection(socket: WebSocket, request: { url?: string }): void {
    if (this.closing) {
      socket.close(1001, "Servidor encerrando");
      return;
    }

    const { searchParams } = new URL(request.url ?? "/", "http://localhost");
    const client: UnityClient = {
      socket,
      clientId: searchParams.get("clientId") ?? randomUUID(),
      deviceId: searchParams.get("deviceId"),
      // Sem `unity.status` declarado, a Unity é considerada livre: assim
      // uma Unity que não manda o aviso ainda consegue receber builds.
      status: "ready",
    };

    this.clients.set(socket, client);

    // Mantido do módulo original: primeiro contato do servidor com o cliente.
    this.send(client, {
      type: "connected",
      clientId: client.clientId,
      message: "WebSocket connection established",
    });

    this.options.logger.info(
      { clientId: client.clientId, deviceId: client.deviceId },
      "Unity conectada",
    );

    this.promoteActiveClient();
    this.emit({ type: "unity.connected", deviceId: client.deviceId });

    socket.on("message", (raw) => this.onMessage(client, raw.toString()));
    socket.on("close", () => this.onDisconnection(client, "closed"));
    socket.on("error", (error) => {
      this.options.logger.warn(
        { clientId: client.clientId, err: error },
        "erro no WebSocket da Unity",
      );
      this.onDisconnection(client, "error");
    });
  }

  private onDisconnection(client: UnityClient, reason: string): void {
    if (!this.clients.delete(client.socket)) {
      return; // já removida por outro evento (close + error no mesmo socket)
    }

    // Só a Unity que estava com a build deixa uma montagem órfã. Se a que
    // caiu era outra (que só estava conectada), a build continua com quem
    // a recebeu — devolvê-la para a fila faria a mesma build ser reenviada
    // e montada duas vezes.
    const wasActive = this.active === client;

    this.promoteActiveClient();

    this.options.logger.info(
      { clientId: client.clientId, reason, wasActive },
      "Unity desconectada",
    );

    this.emit({ type: "unity.disconnected", deviceId: client.deviceId, wasActive });
  }

  private onMessage(client: UnityClient, raw: string): void {
    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      // Mesma mensagem de erro do módulo WebSocket original.
      this.send(client, { type: "error", message: "Messages must be valid JSON." });
      return;
    }

    const message = payload as Partial<UnityInboundMessage> | null;

    if (message === null || typeof message !== "object" || typeof message.type !== "string") {
      this.send(client, { type: "error", message: "Message must have a string 'type'." });
      return;
    }

    switch (message.type) {
      case "unity.status":
      case "UNITY_STATUS": {
        const status = message.status;

        if (status !== "ready" && status !== "busy") {
          this.send(client, {
            type: "error",
            message: "unity.status must be 'ready' or 'busy'.",
          });
          return;
        }

        client.status = status;
        client.deviceId = message.deviceId ?? client.deviceId;

        this.options.logger.info(
          { clientId: client.clientId, status },
          "Unity atualizou o status",
        );

        this.promoteActiveClient();
        this.emit({
          type: "unity.status",
          deviceId: client.deviceId,
          status,
        });
        return;
      }

      case "BUILD_STARTED":
      case "BUILD_COMPLETED":
      case "BUILD_ERROR": {
        if (typeof message.buildId !== "string" || message.buildId.length === 0) {
          this.send(client, {
            type: "error",
            message: `${message.type} requires a 'buildId'.`,
          });
          return;
        }

        // Uma mensagem por caso: o `UnityEvent` é uma união discriminada.
        if (message.type === "BUILD_ERROR") {
          this.emit({
            type: "BUILD_ERROR",
            buildId: message.buildId,
            message: message.message ?? "erro informado pela Unity",
          });
          return;
        }

        this.emit({ type: message.type, buildId: message.buildId });
        return;
      }

      default:
        this.send(client, {
          type: "error",
          message: `Unknown message type: ${message.type}`,
        });
    }
  }

  private send(client: UnityClient, payload: unknown): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(payload));
    }
  }

  /**
   * Define qual Unity recebe as builds.
   *
   * Só uma é ativa por vez (a primeira conectada e `ready`), para que
   * duas Uuities não toquem a mesma build.
   */
  private promoteActiveClient(): void {
    if (this.active && this.clients.has(this.active.socket)) {
      if (this.active.status === "ready") {
        return;
      }

      // A ativa declarou `busy`: libera a vez para outra Unity.
      this.active = null;
    } else {
      this.active = null;
    }

    for (const client of this.clients.values()) {
      if (client.status === "ready") {
        this.active = client;
        return;
      }
    }

    this.active = null;
  }

  isConnected(): boolean {
    return this.clients.size > 0;
  }

  isReady(): boolean {
    return this.active !== null;
  }

  state(): UnityConnectionState {
    return {
      connected: this.isConnected(),
      ready: this.isReady(),
      deviceId: this.active?.deviceId ?? null,
    };
  }

  /**
   * Envia a configuração da build para a Unity (evento `BUILD_START`).
   *
   * Os IDs dos componentes vão exatamente como vieram do celular, sem
   * normalização: é a Unity quem reconhece `ryzen-5-5600`, `16gb` etc.
   * O campo `id` da build é o `buildId` público (`BUILD-001`).
   */
  sendBuildStart(build: Build): void {
    const client = this.active;

    if (!client) {
      throw new Error("Nenhuma Unity conectada para receber a build");
    }

    const payload: UnityBuildPayload = {
      id: build.buildId,
      cpu: build.cpu,
      gpu: build.gpu,
      ram: build.ram,
      storage: build.storage,
      motherboard: build.motherboard,
      psu: build.psu,
      case: build.case,
    };

    this.options.logger.info(
      { buildId: build.buildId, clientId: client.clientId },
      "build enviada para a Unity",
    );

    this.send(client, {
      type: "BUILD_START",
      buildId: build.buildId,
      sentAt: new Date().toISOString(),
      build: payload,
    });
  }

  /** Encerra as conexões e o servidor de WebSocket. */
  async close(): Promise<void> {
    // Nenhum evento durante o encerramento: a fila pode estar fechando o
    // MySQL ao mesmo tempo e não deve receber nada.
    this.handlers.length = 0;

    for (const client of this.clients.values()) {
      // `terminate` encerra na hora; `close` handshake podia deixar o
      // servidor esperando um cliente teimoso.
      client.socket.terminate();
    }

    this.clients.clear();
    this.active = null;

    await new Promise<void>((resolve) => {
      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      this.server.close(() => done());
      setTimeout(done, 1000);
    });
  }
}
