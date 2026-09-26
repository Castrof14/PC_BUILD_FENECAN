import type { OrderFilter, OrderRepository } from '../../../application/ports/index.js';
import type { Order } from '../../../domain/index.js';

function copy(order: Order): Order {
  return Object.freeze({ ...order, components: Object.freeze({ ...order.components }) });
}

function byCreation(a: Order, b: Order): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Armazenamento TEMPORARIO em memoria. Os dados somem quando o processo
 * termina. Serve para desenvolver e testar sem o banco oficial.
 */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, copy(order));
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async findAll(filter: OrderFilter = {}): Promise<Order[]> {
    const { status } = filter;
    const accepted = status === undefined ? null : new Set(typeof status === 'string' ? [status] : status);
    return [...this.orders.values()]
      .filter((order) => accepted === null || accepted.has(order.status))
      .sort(byCreation);
  }

  async exists(id: string): Promise<boolean> {
    return this.orders.has(id);
  }
}
