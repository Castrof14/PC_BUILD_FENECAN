import type { Order, OrderStatus } from '../types/order.js';
import { ApiError, requestJson, type HttpRequestOptions } from './http-client.js';
import { normalizeOrderList, normalizeSingleOrder } from './normalize.js';

export interface OrdersApiOptions {
  baseUrl: string;
  timeoutMs: number;
}

export class OrdersApi {
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OrdersApiOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
  }

  listOrders(signal?: AbortSignal): Promise<Order[]> {
    return this.request('/orders', { signal }).then(normalizeOrderList);
  }

  getOrder(id: string, signal?: AbortSignal): Promise<Order | null> {
    return this.request(`/orders/${encodeURIComponent(id)}`, { signal }).then(normalizeSingleOrder);
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    signal?: AbortSignal,
  ): Promise<Order | null> {
    const payload = await this.request(`/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: { status },
      signal,
    });
    return payload === undefined ? null : normalizeSingleOrder(payload);
  }

  private request(
    path: string,
    options: Partial<Omit<HttpRequestOptions, 'timeoutMs'>> = {},
  ): Promise<unknown> {
    return requestJson<unknown>(`${this.baseUrl}${path}`, {
      ...options,
      timeoutMs: this.timeoutMs,
    });
  }
}

export { ApiError };
