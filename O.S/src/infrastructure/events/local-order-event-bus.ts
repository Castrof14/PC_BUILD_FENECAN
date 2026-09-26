import type { OrderEvent, OrderEventPublisher } from '../../application/ports/index.js';

export type OrderEventListener = (event: OrderEvent) => void | Promise<void>;

export interface LocalOrderEventBusOptions {
  /** Chamado quando um ouvinte falha. Padrao: `console.error`. */
  onListenerError?: (error: unknown, event: OrderEvent) => void;
}

/**
 * Distribui eventos de O.S. para ouvintes dentro do mesmo processo.
 *
 * Adaptadores futuros (notificar a API oficial, Unity, tela) se inscrevem aqui
 * com `subscribe`. A falha de um ouvinte nunca afeta os outros nem a operacao
 * que gerou o evento.
 */
export class LocalOrderEventBus implements OrderEventPublisher {
  private readonly listeners = new Set<OrderEventListener>();
  private readonly onListenerError: (error: unknown, event: OrderEvent) => void;

  constructor(options: LocalOrderEventBusOptions = {}) {
    this.onListenerError =
      options.onListenerError ??
      ((error, event) => console.error(`[os-eventos] ouvinte falhou em ${event.type}:`, error));
  }

  subscribe(listener: OrderEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: OrderEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.onListenerError(error, event));
        }
      } catch (error) {
        this.onListenerError(error, event);
      }
    }
  }
}
