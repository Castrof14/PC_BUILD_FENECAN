import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { Build, OsOutboundMessage } from "../types/build.js";
import type { HubLogger } from "./unity.websocket.js";

export interface OsWebSocketOptions {
  /** Caminho do upgrade, ex.: `/ws/os`. */
  path: string;
  logger: HubLogger;
  /** Todas as builds atuais, enviadas a cada O.S. que conecta. */
  snapshot: () => Promise<Build[]>;
}

/**
 * Canal da O.S. (sistema do operador).
 *
 * Diferente do canal da Unity, este é só de saída: toda build criada ou
 * alterada é repassada para as O.S. conectadas. Ao conectar, a O.S.
 * recebe o retrato completo (`BUILDS_SNAPSHOT`), então nada se perde se
 * ela subir depois do backend ou cair e voltar.
 *
 * Fica separado do hub da Unity de propósito: uma O.S. conectada nunca
 * pode ser confundida com uma Unity e receber `BUILD_START`.
 */
export class OsWebSocketHub {
  private readonly server: WebSocketServer;
  private readonly clients = new Set<WebSocket>();

  constructor(private readonly options: OsWebSocketOptions) {
    this.server = new WebSocketServer({ noServer: true });
    this.server.on("connection", (socket) => void this.onConnection(socket));
  }

  /** Aceita o upgrade se for no caminho da O.S. Devolve `false` se não for. */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");

    if (pathname !== this.options.path) {
      return false;
    }

    this.server.handleUpgrade(request, socket, head, (connection) => {
      this.server.emit("connection", connection, request);
    });

    return true;
  }

  private async onConnection(socket: WebSocket): Promise<void> {
    this.clients.add(socket);
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));

    this.options.logger.info({ clients: this.clients.size }, "O.S. conectada");

    try {
      const builds = await this.options.snapshot();
      this.send(socket, { type: "BUILDS_SNAPSHOT", builds });
    } catch (error) {
      this.options.logger.error({ err: error }, "falha ao montar o retrato das builds para a O.S.");
    }
  }

  /** Build nova, recém-criada pelo site. */
  buildCreated(build: Build): void {
    this.broadcast({ type: "BUILD_CREATED", build });
  }

  /** Build que mudou de status na fila. */
  buildUpdated(build: Build): void {
    this.broadcast({ type: "BUILD_UPDATED", build });
  }

  private broadcast(message: OsOutboundMessage): void {
    for (const socket of this.clients) {
      this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: OsOutboundMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  async close(): Promise<void> {
    for (const socket of this.clients) {
      socket.terminate();
    }

    this.clients.clear();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      this.server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
