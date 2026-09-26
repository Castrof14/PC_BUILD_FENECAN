import { createOrder, unwrap, validateComponents, type Order } from '../../domain/index.js';
import { OrderAlreadyExistsError, OrderIdUnavailableError } from '../errors.js';
import type { Clock, OrderEventPublisher, OrderIdGenerator, OrderRepository } from '../ports/index.js';
import type { KeyedLock } from '../shared/keyed-lock.js';

export interface CreateOrderInput {
  /** ID vindo de fora (ex.: API oficial). Ausente (`undefined`/`null`) = gerar um novo. */
  id?: unknown;
  components: unknown;
}

export interface CreateOrderDeps {
  repository: OrderRepository;
  idGenerator: OrderIdGenerator;
  clock: Clock;
  events: OrderEventPublisher;
  lock: KeyedLock;
}

const MAX_ID_ATTEMPTS = 1000;

export class CreateOrder {
  constructor(private readonly deps: CreateOrderDeps) {}

  async execute(input: CreateOrderInput): Promise<Order> {
    const order =
      input.id === undefined || input.id === null
        ? await this.createWithGeneratedId(input.components)
        : await this.createWithGivenId(input.id, input.components);

    this.deps.events.publish({ type: 'order.created', order, occurredAt: order.createdAt });
    return order;
  }

  private async createWithGivenId(id: unknown, components: unknown): Promise<Order> {
    const order = createOrder({ id, components }, this.deps.clock.now());
    if (!(await this.insert(order))) {
      throw new OrderAlreadyExistsError(order.id);
    }
    return order;
  }

  private async createWithGeneratedId(rawComponents: unknown): Promise<Order> {
    // Valida antes de gerar, para nao consumir IDs com pedidos invalidos.
    const components = unwrap(validateComponents(rawComponents));
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const id = await this.deps.idGenerator.next();
      const order = createOrder({ id, components }, this.deps.clock.now());
      if (await this.insert(order)) {
        return order;
      }
    }
    throw new OrderIdUnavailableError(MAX_ID_ATTEMPTS);
  }

  /** Salva somente se o ID estiver livre. */
  private insert(order: Order): Promise<boolean> {
    return this.deps.lock.run(order.id, async () => {
      if (await this.deps.repository.exists(order.id)) {
        return false;
      }
      await this.deps.repository.save(order);
      return true;
    });
  }
}
