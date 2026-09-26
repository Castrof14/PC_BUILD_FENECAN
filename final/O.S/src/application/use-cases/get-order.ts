import { unwrap, validateOrderId, type Order } from '../../domain/index.js';
import { OrderNotFoundError } from '../errors.js';
import type { OrderRepository } from '../ports/index.js';

export interface GetOrderDeps {
  repository: OrderRepository;
}

export class GetOrder {
  constructor(private readonly deps: GetOrderDeps) {}

  /** Lanca `OrderNotFoundError` se a O.S. nao existir. */
  async execute(id: unknown): Promise<Order> {
    const orderId = unwrap(validateOrderId(id));
    const order = await this.deps.repository.findById(orderId);
    if (order === null) {
      throw new OrderNotFoundError(orderId);
    }
    return order;
  }
}
