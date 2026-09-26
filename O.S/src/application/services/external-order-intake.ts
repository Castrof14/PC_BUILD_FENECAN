import { DomainError, OrderValidationError } from '../../domain/index.js';
import { ApplicationError, OrderAlreadyExistsError } from '../errors.js';
import type {
  ExternalOrderMapper,
  ExternalOrderProvider,
  ReceiveOutcome,
} from '../ports/index.js';
import type { OrderService } from './order-service.js';

export interface ExternalOrderIntakeDeps {
  service: OrderService;
  provider: ExternalOrderProvider;
  mapper: ExternalOrderMapper;
}

/**
 * Liga uma origem externa de pedidos ao OrderService:
 *
 *   ExternalOrderProvider -> ExternalOrderMapper -> OrderService.create
 *
 * Trocar a origem (mock -> API oficial) nao muda esta classe.
 */
export class ExternalOrderIntake {
  private running = false;

  constructor(private readonly deps: ExternalOrderIntakeDeps) {}

  get providerName(): string {
    return this.deps.provider.name;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    await this.deps.provider.start((payload) => this.receive(payload));
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    await this.deps.provider.stop();
  }

  /** Processa um payload externo. Tambem pode ser chamado diretamente. */
  async receive(payload: unknown): Promise<ReceiveOutcome> {
    try {
      const incoming = this.deps.mapper.toIncomingOrder(payload);
      const order = await this.deps.service.create(incoming);
      return { status: 'accepted', order };
    } catch (error) {
      if (error instanceof OrderAlreadyExistsError) {
        return { status: 'duplicate', order: await this.deps.service.get(error.orderId) };
      }
      if (error instanceof DomainError || error instanceof ApplicationError) {
        return {
          status: 'rejected',
          code: error.code,
          message: error.message,
          issues: error instanceof OrderValidationError ? error.issues : [],
        };
      }
      throw error;
    }
  }
}
