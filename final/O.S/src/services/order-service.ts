import { ApiError } from '../api/http-client.js';
import type { OrdersApi } from '../api/orders-api.js';
import { isOrderStatus, type Order, type OrderStatus } from '../types/order.js';
import { ConnectionMonitor } from './connection-monitor.js';
import { OrderStore } from './order-store.js';
import { OrderEventBus } from './order-events.js';

export const STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['BUILDING', 'CANCELLED'],
  BUILDING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export class OrderServiceError extends Error {
  constructor(
    message: string,
    readonly orderId?: string,
  ) {
    super(message);
    this.name = 'OrderServiceError';
  }
}

export interface ChangeStatusResult {
  order: Order;
  from: OrderStatus;
  to: OrderStatus;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function availableTransitions(from: OrderStatus): OrderStatus[] {
  return [...STATUS_TRANSITIONS[from]];
}

export class OrderService {
  readonly events: OrderEventBus = new OrderEventBus();
  readonly store: OrderStore;
  readonly connection: ConnectionMonitor;
  private busyIds = new Set<string>();

  constructor(
    private readonly api: OrdersApi,
    store?: OrderStore,
    connection?: ConnectionMonitor,
  ) {
    this.store = store ?? new OrderStore(this.events);
    this.connection = connection ?? new ConnectionMonitor(api.baseUrl);
  }

  get baseUrl(): string {
    return this.api.baseUrl;
  }

  listOrders(signal?: AbortSignal): Promise<Order[]> {
    this.connection.markChecking();
    return this.api.listOrders(signal).then(
      (orders) => {
        this.connection.markSuccess();
        this.store.replaceAll(orders);
        return this.store.list;
      },
      (error: unknown) => {
        if (!(error instanceof ApiError) || !error.isAbort) {
          this.connection.markFailure(error);
        }
        throw error;
      },
    );
  }

  getOrder(id: string): Promise<Order | null> {
    return this.api.getOrder(id);
  }

  isBusy(id: string): boolean {
    return this.busyIds.has(id);
  }

  async changeStatus(id: string, to: OrderStatus): Promise<ChangeStatusResult> {
    if (!isOrderStatus(to)) {
      throw new OrderServiceError(`Status invalido: ${String(to)}`, id);
    }
    const current = this.store.find(id);
    if (current === null) {
      throw new OrderServiceError(`Pedido ${id} nao esta na lista. Atualize a tela.`, id);
    }
    if (current.status === to) {
      throw new OrderServiceError(`O pedido ${id} ja esta com status ${to}.`, id);
    }
    if (!canTransition(current.status, to)) {
      const allowed = availableTransitions(current.status).join(', ') || 'nenhum';
      throw new OrderServiceError(
        `Nao pode ir de ${current.status} para ${to}. Permitido: ${allowed}.`,
        id,
      );
    }
    this.busyIds.add(id);
    try {
      const updated = await this.api.updateStatus(id, to);
      const order = updated ?? { ...current, status: to, updatedAt: new Date().toISOString() };
      this.store.upsert(order);
      this.store.markSeen(id);
      const result: ChangeStatusResult = { order, from: current.status, to };
      this.store.notifyStatusChanged(result);
      return result;
    } catch (error) {
      if (error instanceof ApiError && (error.kind === 'network' || error.kind === 'timeout')) {
        this.connection.markFailure(error);
      }
      throw error instanceof ApiError
        ? new OrderServiceError(this.describeApiError(error, id), id)
        : error;
    } finally {
      this.busyIds.delete(id);
    }
  }

  private describeApiError(error: ApiError, id: string): string {
    switch (error.kind) {
      case 'network':
        return `Sem conexao com a API. O status do pedido ${id} nao foi alterado.`;
      case 'timeout':
        return `A API demorou demais. O status do pedido ${id} nao foi alterado.`;
      case 'parse':
        return `A API respondeu com formato invalido. O status do pedido ${id} nao foi alterado.`;
      case 'http':
        return `A API recusou a alteracao do pedido ${id} (${error.message}).`;
      default:
        return `Falha ao alterar o pedido ${id}: ${error.message}`;
    }
  }
}
