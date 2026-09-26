import type { Components, Order, OrderStatus } from '../types';

/**
 * Cliente da API local da O.S. (src/infrastructure/http/os-http-server.ts).
 *
 * O endereco vem de VITE_OS_API_URL no O.S/.env. As O.S. chegam do site
 * pelo fenecan-backend; esta tela so le e muda o status.
 */
export const OS_API_URL = (import.meta.env.VITE_OS_API_URL ?? 'http://127.0.0.1:4100').replace(/\/+$/, '');

/** O.S. como devolvida pela API (formato do dominio da O.S.). */
interface ApiOrder {
  id: string;
  status: OrderStatus;
  components: Components;
  createdAt: string;
  updatedAt: string;
}

interface ApiError {
  error?: string;
  message?: string;
}

/** O site nao pede o nome do visitante: a O.S. so tem o id da build. */
const VISITOR_LABEL = 'Visitante';

function toOrder(order: ApiOrder): Order {
  return {
    id: order.id,
    status: order.status,
    components: order.components,
    customer: VISITOR_LABEL,
    requestedAt: order.createdAt,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${OS_API_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error(`O.S. fora do ar (${OS_API_URL}). Rode "npm run os:start" em O.S/.`);
  }
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(body.message ?? `A O.S. respondeu ${response.status}.`);
  }
  return body;
}

export async function fetchOrders(): Promise<Order[]> {
  return (await request<ApiOrder[]>('/orders')).map(toOrder);
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const order = await request<ApiOrder>(`/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return toOrder(order);
}
