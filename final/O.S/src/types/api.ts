import type { Order, OrderStatus } from './order.js';

export type ConnectionState = 'connected' | 'disconnected' | 'checking';

export interface ConnectionStatus {
  state: ConnectionState;
  apiBaseUrl: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface OrderListItem extends Order {
  isNew: boolean;
}

export interface OperatorState {
  connection: ConnectionStatus;
  orders: OrderListItem[];
  newOrderIds: string[];
  lastUpdatedAt: string | null;
  pollIntervalMs: number;
  serverTime: string;
  apiBaseUrl: string;
  soundEnabled: boolean;
}

export interface ChangeStatusRequest {
  status: OrderStatus;
}

export interface ChangeStatusResponse {
  ok: true;
  order: Order;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
}

export type OperatorApiResponse = ChangeStatusResponse | ApiErrorResponse | { ok: true };

export interface UpdateStatusBody {
  status: OrderStatus;
}
