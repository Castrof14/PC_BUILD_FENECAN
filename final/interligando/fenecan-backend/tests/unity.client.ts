import { WebSocket } from "ws";

/**
 * Cliente WebSocket que representa a Unity.
 *
 * A base vem do módulo WebSocket original (`websocket/tests/unitySimulator.ts`
 * + `websocket/src/unity/unityWebSocket.ts`): o simulador já falava
 * `unity.status` ao conectar, e esse nome foi mantido no protocolo.
 *
 * Serve à verificação automatizada (`tests/integration.test.ts`) e ao
 * simulador manual (`npm run unity:sim`). Não é código de produção: a
 * Unity real implementa o mesmo protocolo em C#.
 */

/** Abre a conexão com o backend. Equivalente ao `connectToBackend` original. */
export function connectToBackend(
  url = process.env.BACKEND_URL ?? "ws://localhost:3000/ws",
): WebSocket {
  return new WebSocket(url);
}

export interface ReceivedMessage {
  type: string;
  [key: string]: unknown;
}

export interface TestUnityClientOptions {
  url?: string;
  deviceId?: string;
  /** Declara `unity.status: ready` assim que conectar (padrão: true). */
  announceReady?: boolean;
}

/**
 * Unity de teste: conecta, registra tudo que chega e permite responder
 * como a Unity real responderia.
 */
export class TestUnityClient {
  private readonly socket: WebSocket;
  private readonly received: ReceivedMessage[] = [];
  private readonly waiters: {
    match: (message: ReceivedMessage) => boolean;
    resolve: (message: ReceivedMessage) => void;
  }[] = [];
  /** Posição da última mensagem consumida por `next()`. */
  private cursor = 0;

  constructor(private readonly options: TestUnityClientOptions = {}) {
    const url = new URL(options.url ?? process.env.BACKEND_URL ?? "ws://localhost:3000/ws");

    if (options.deviceId) {
      url.searchParams.set("deviceId", options.deviceId);
    }

    this.socket = new WebSocket(url);

    // Registrado já no construtor para não perder a primeira mensagem
    // (`connected`), que o backend envia logo após o handshake.
    this.socket.on("message", (raw) => {
      let message: ReceivedMessage;

      try {
        message = JSON.parse(raw.toString()) as ReceivedMessage;
      } catch {
        return;
      }

      this.received.push(message);

      for (const waiter of [...this.waiters]) {
        if (waiter.match(message)) {
          waiter.resolve(message);
        }
      }
    });
  }

  /** Espera a conexão abrir. */
  async open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });

    if (this.options.announceReady !== false) {
      this.send({
        type: "unity.status",
        status: "ready",
        deviceId: this.options.deviceId ?? "unity-test",
      });
    }
  }

  send(payload: unknown): void {
    this.socket.send(JSON.stringify(payload));
  }

  /** Envia bytes crus, para testar JSON inválido. */
  sendRaw(payload: string): void {
    this.socket.send(payload);
  }

  /** Mensagens recebidas até agora. */
  messages(): ReceivedMessage[] {
    return [...this.received];
  }

  /** Todas as builds recebidas em `BUILD_START`, na ordem. */
  startedBuilds(): { id: string; build: Record<string, string> }[] {
    return this.received
      .filter((message) => message.type === "BUILD_START")
      .map((message) => ({
        id: String(message.buildId),
        build: message.build as Record<string, string>,
      }));
  }

  /** Espera uma mensagem que case com o filtro. */
  async waitFor(
    match: (message: ReceivedMessage) => boolean,
    timeoutMs = 4000,
  ): Promise<ReceivedMessage> {
    const already = this.received.find(match);

    if (already) {
      return already;
    }

    return new Promise<ReceivedMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.resolve === resolve);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }

        reject(
          new Error(
            `timeout esperando mensagem do backend. recebidas: ${JSON.stringify(this.received)}`,
          ),
        );
      }, timeoutMs);

      this.waiters.push({
        match,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  waitForType(type: string, timeoutMs = 4000): Promise<ReceivedMessage> {
    return this.waitFor((message) => message.type === type, timeoutMs);
  }

  /**
   * Próxima mensagem **ainda não consumida** (avança um cursor).
   *
   * Diferente de `waitFor`, que relê o histórico, este é o que um consumidor
   * em laço deve usar: cada mensagem é entregue uma única vez, então
   * `BUILD_START` repetido não vira laço infinito.
   */
  async next(
    match: (message: ReceivedMessage) => boolean = () => true,
    timeoutMs = 30_000,
  ): Promise<ReceivedMessage> {
    const find = (): ReceivedMessage | undefined => {
      for (let index = this.cursor; index < this.received.length; index += 1) {
        const message = this.received[index];

        if (message && match(message)) {
          this.cursor = index + 1;
          return message;
        }
      }

      return undefined;
    };

    const found = find();

    if (found) {
      return found;
    }

    return new Promise<ReceivedMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.resolve === resolve);

        if (index >= 0) {
          this.waiters.splice(index, 1);
        }

        reject(new Error("timeout esperando mensagem nova do backend"));
      }, timeoutMs);

      this.waiters.push({
        match,
        resolve: (message) => {
          clearTimeout(timer);
          // Avança o cursor também aqui: senão a próxima chamada a
          // `next()` releria a mesma mensagem.
          const index = this.received.indexOf(message);
          this.cursor = index >= 0 ? index + 1 : this.cursor;
          resolve(message);
        },
      });
    });
  }

  /** Confirma o início da montagem, como a Unity real faz. */
  confirmStarted(buildId: string): void {
    this.send({ type: "BUILD_STARTED", buildId });
  }

  /** Confirma o término da montagem. */
  confirmCompleted(buildId: string): void {
    this.send({ type: "BUILD_COMPLETED", buildId });
  }

  /** Confirma falha na montagem. */
  confirmError(buildId: string, message = "falha simulada"): void {
    this.send({ type: "BUILD_ERROR", buildId, message });
  }

  async close(): Promise<void> {
    if (
      this.socket.readyState === WebSocket.CLOSED ||
      this.socket.readyState === WebSocket.CLOSING
    ) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.close();
    });
  }
}

/** Cliente já conectado, com o caminho de autenticação/deviceId aplicado. */
export async function connectUnity(
  options: TestUnityClientOptions = {},
): Promise<TestUnityClient> {
  const client = new TestUnityClient(options);
  await client.open();

  return client;
}
