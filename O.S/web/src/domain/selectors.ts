import type { Order, OrderStatus, StatusFilter } from '../types';
import { STATUS_ORDER } from './order-status';

export type StatusCounts = Record<OrderStatus, number>;

export function emptyStatusCounts(): StatusCounts {
  return STATUS_ORDER.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {} as StatusCounts);
}

export function countByStatus(orders: Order[]): StatusCounts {
  const counts = emptyStatusCounts();

  for (const order of orders) {
    counts[order.status] += 1;
  }

  return counts;
}

export function filterOrders(orders: Order[], filter: StatusFilter, query: string): Order[] {
  const needle = query.trim().toLowerCase();

  return orders.filter((order) => {
    if (filter !== 'ALL' && order.status !== filter) {
      return false;
    }
    if (needle === '') {
      return true;
    }
    return (
      order.id.toLowerCase().includes(needle) || order.customer.toLowerCase().includes(needle)
    );
  });
}
