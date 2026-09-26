import type { Order, OrderStatus } from '../types/order.js';
import { OrderEventBus, eventForStatus, type OrderEventMap } from './order-events.js';

const STATUS_PRIORITY: Readonly<Record<OrderStatus, number>> = {
  PENDING: 0,
  ACCEPTED: 1,
  BUILDING: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function timeOf(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortOrders(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => {
    const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (byStatus !== 0) {
      return byStatus;
    }
    const byTime = timeOf(b.createdAt) - timeOf(a.createdAt);
    if (byTime !== 0) {
      return byTime;
    }
    return a.id.localeCompare(b.id);
  });
}

export class OrderStore {
  private orders: Order[] = [];
  private readonly seenIds = new Set<string>();
  private readonly newIds = new Set<string>();
  private initialized = false;
  private lastUpdatedAt: string | null = null;

  constructor(private readonly events: OrderEventBus = new OrderEventBus()) {}

  replaceAll(orders: Order[]): void {
    const incomingIds = new Set(orders.map((order) => order.id));

    if (!this.initialized) {
      for (const order of orders) {
        this.seenIds.add(order.id);
      }
      this.initialized = true;
    } else {
      for (const order of orders) {
        if (!this.seenIds.has(order.id)) {
          this.newIds.add(order.id);
          this.events.emit('order.received', { order });
        }
      }
    }

    for (const id of this.seenIds) {
      if (!incomingIds.has(id)) {
        this.seenIds.delete(id);
      }
    }
    for (const id of this.newIds) {
      if (!incomingIds.has(id)) {
        this.newIds.delete(id);
      }
    }

    this.orders = sortOrders(orders);
    this.lastUpdatedAt = new Date().toISOString();
  }

  upsert(order: Order): void {
    const index = this.orders.findIndex((item) => item.id === order.id);
    if (index === -1) {
      this.orders = sortOrders([...this.orders, order]);
    } else {
      const next = [...this.orders];
      next[index] = order;
      this.orders = sortOrders(next);
    }
  }

  find(id: string): Order | null {
    return this.orders.find((order) => order.id === id) ?? null;
  }

  get list(): Order[] {
    return this.orders;
  }

  get newOrderIds(): string[] {
    return [...this.newIds];
  }

  isNew(id: string): boolean {
    return this.newIds.has(id);
  }

  get updatedAt(): string | null {
    return this.lastUpdatedAt;
  }

  markSeen(id: string): void {
    this.seenIds.add(id);
    this.newIds.delete(id);
  }

  markAllSeen(): void {
    for (const order of this.orders) {
      this.seenIds.add(order.id);
    }
    this.newIds.clear();
  }

  notifyStatusChanged(payload: OrderEventMap['order.status-changed']): void {
    this.events.emit('order.status-changed', payload);
    const eventName = eventForStatus(payload.to);
    if (eventName !== null) {
      this.events.emit(eventName, { order: payload.order });
    }
  }

  get eventBus(): OrderEventBus {
    return this.events;
  }
}
