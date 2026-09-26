import type {
  ExternalOrderHandler,
  ExternalOrderProvider,
  ReceiveOutcome,
} from '../../../../application/ports/index.js';

export interface FenecanOrderProviderOptions {
  /** WebSocket da O.S. no fenecan-backend, ex.: `ws://localhost:3000/ws/os`. */
  url: string;
  /** Espera antes de tentar reconectar. */
  reconnectDelayMs?: number;
  /** Mudancas de conexao, para o terminal/tela. */
  onConnectionChange?: (connected: boolean) => void;
  /** Resultado de cada build entregue a O.S. */
  onOutcome?: (outcome: ReceiveOutcome) => void;
  /** Falhas inesperadas (mensagem invalida, armazenamento fora do ar...). */
  onError?: (error: unknown) => void;
  /**
   * Build nova com o mesmo id de uma O.S. existente, mas outros componentes.
   * Acontece quando o fenecan-backend roda sem banco (BUILD_STORAGE=memory) e
   * reinicia: a numeracao volta para BUILD-001. A build NAO entra na O.S.
   */
  onIdCollision?: (buildId: string) => void;
}

const COMPONENT_FIELDS = ['cpu', 'gpu', 'ram', 'storage', 'motherboard', 'psu', 'case'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Origem de pedidos: o fenecan-backend (API + WebSocket em `interligando/`).
 *
 * O site faz `POST /build`; o backend avisa este provedor pelo WebSocket
 * `OS_WS_PATH` e cada build vira uma O.S. Mensagens usadas:
 *
 *   BUILDS_SNAPSHOT { builds: Build[] }  ao conectar (inclui as antigas)
 *   BUILD_CREATED   { build: Build }     a cada build nova
 *
 * Se o backend cair, o provedor tenta reconectar sozinho; ao voltar, o
 * retrato inicial repoe o que chegou nesse meio tempo (repetidas viram
 * `duplicate`, sem O.S. dupla).
 */
export class FenecanOrderProvider implements ExternalOrderProvider {
  readonly name = 'fenecan';
  private handler: ExternalOrderHandler | null = null;
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  /** Entrega em ordem: uma build so e processada depois da anterior. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: FenecanOrderProviderOptions) {}

  async start(handler: ExternalOrderHandler): Promise<void> {
    this.handler = handler;
    this.connect();
  }

  async stop(): Promise<void> {
    this.handler = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    await this.queue;
  }

  private connect(): void {
    if (this.handler === null) {
      return;
    }
    const socket = new WebSocket(this.options.url);
    this.socket = socket;

    socket.addEventListener('open', () => this.setConnected(true));
    socket.addEventListener('message', (event) => this.onMessage(String(event.data)));
    socket.addEventListener('close', () => {
      this.setConnected(false);
      this.scheduleReconnect();
    });
    // O `close` sempre vem depois do `error`: a reconexao fica so nele.
    socket.addEventListener('error', () => undefined);
  }

  private scheduleReconnect(): void {
    if (this.handler === null || this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs ?? 2000);
  }

  private setConnected(connected: boolean): void {
    if (this.connected !== connected) {
      this.connected = connected;
      this.options.onConnectionChange?.(connected);
    }
  }

  private onMessage(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      this.options.onError?.(error);
      return;
    }
    if (!isRecord(message)) {
      return;
    }

    if (message['type'] === 'BUILDS_SNAPSHOT' && Array.isArray(message['builds'])) {
      for (const build of message['builds']) {
        this.deliver(build);
      }
    } else if (message['type'] === 'BUILD_CREATED') {
      this.deliver(message['build']);
    }
    // BUILD_UPDATED: o fluxo de status da O.S. e do operador, nao da fila.
  }

  private deliver(payload: unknown): void {
    this.queue = this.queue.then(async () => {
      const handler = this.handler;
      if (handler === null) {
        return;
      }
      try {
        const outcome = await handler(payload);
        if (outcome.status === 'duplicate' && isRecord(payload) && isRecord(outcome.order.components)) {
          const existing = outcome.order.components;
          if (COMPONENT_FIELDS.some((key) => payload[key] !== existing[key])) {
            this.options.onIdCollision?.(outcome.order.id);
          }
        }
        this.options.onOutcome?.(outcome);
      } catch (error) {
        this.options.onError?.(error);
      }
    });
  }
}
