import {
  OrderValidationError,
  changeOrderStatus,
  validateOrderId,
  validateStatus,
  type Order,
  type OrderStatus,
} from '../../domain/index.js';
import { OrderNotFoundError } from '../errors.js';
import type { Clock, OrderEventPublisher, OrderRepository } from '../ports/index.js';
import type { KeyedLock } from '../shared/keyed-lock.js';

export interface UpdateOrderStatusInput {
  id: unknown;
  status: unknown;
}

export interface StatusChange {
  order: Order;
  from: OrderStatus;
  to: OrderStatus;
}

export interface UpdateOrderStatusDeps {
  repository: OrderRepository;
  clock: Clock;
  events: OrderEventPublisher;
  lock: KeyedLock;
}

export class UpdateOrderStatus {
  constructor(private readonly deps: UpdateOrderStatusDeps) {}

  /**
   * Lanca `OrderValidationError`, `OrderNotFoundError` ou
   * `InvalidStatusTransitionError`. Nesses casos nada e salvo.
   */
  async execute(input: UpdateOrderStatusInput): Promise<StatusChange> {
    const id = validateOrderId(input.id);
    const status = validateStatus(input.status);
    if (!id.ok || !status.ok) {
      throw new OrderValidationError([...(id.ok ? [] : id.issues), ...(status.ok ? [] : status.issues)]);
    }

    const change = await this.deps.lock.run(id.value, async () => {
      const current = await this.deps.repository.findById(id.value);
      if (current === null) {
        throw new OrderNotFoundError(id.value);
      }
      const order = changeOrderStatus(current, status.value, this.deps.clock.now());
      await this.deps.repository.save(order);
      return { order, from: current.status, to: order.status };
    });

    this.deps.events.publish({ type: 'order.status-changed', ...change, occurredAt: change.order.updatedAt });
    return change;
  }
}
