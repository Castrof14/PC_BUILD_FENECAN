import type { Order, OrderStatus } from '../types/order.js';

export interface OrderEventMap {
  'order.received': { order: Order };
  'order.status-changed': { order: Order; from: OrderStatus; to: OrderStatus };
  'order.accepted': { order: Order };
  'order.build-started': { order: Order };
  'order.completed': { order: Order };
  'order.cancelled': { order: Order };
}

export type OrderEventName = keyof OrderEventMap;

type Listener<T> = (payload: T) => void;

const STATUS_EVENT: Readonly<Record<OrderStatus, OrderEventName | null>> = {
  PENDING: null,
  ACCEPTED: 'order.accepted',
  BUILDING: 'order.build-started',
  COMPLETED: 'order.completed',
  CANCELLED: 'order.cancelled',
};

export function eventForStatus(status: OrderStatus): OrderEventName | null {
  return STATUS_EVENT[status];
}

export class OrderEventBus {
  private readonly listeners = new Map<OrderEventName, Set<Listener<never>>>();

  on<E extends OrderEventName>(event: E, listener: Listener<OrderEventMap[E]>): void {
    const set = this.listeners.get(event) ?? new Set<Listener<never>>();
    set.add(listener);
    this.listeners.set(event, set);
  }

  off<E extends OrderEventName>(event: E, listener: Listener<OrderEventMap[E]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<E extends OrderEventName>(event: E, payload: OrderEventMap[E]): void {
    const set = this.listeners.get(event);
    if (set === undefined) {
      return;
    }
    for (const listener of set) {
      (listener as Listener<OrderEventMap[E]>)(payload);
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
