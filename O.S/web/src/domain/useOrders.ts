import { useState } from 'react';
import { MOCK_ORDERS } from '../data/mock-orders';
import type { Order, OrderStatus, StatusFilter } from '../types';
import { applyTransition } from './order-actions';
import { countByStatus, filterOrders, type StatusCounts } from './selectors';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'ACCEPTED',
  ACCEPTED: 'BUILDING',
  BUILDING: 'COMPLETED',
};

export interface OrdersState {
  orders: Order[];
  counts: StatusCounts;
  visible: Order[];
  filter: StatusFilter;
  query: string;
  lastError: string | null;
  setFilter: (filter: StatusFilter) => void;
  setQuery: (query: string) => void;
  advance: (id: string) => void;
  cancel: (id: string) => void;
  reset: () => void;
}

export function useOrders(): OrdersState {
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);

  function transition(id: string, resolve: (order: Order) => OrderStatus | null): void {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) {
          return order;
        }
        const to = resolve(order);
        if (to === null) {
          return order;
        }
        const outcome = applyTransition(order, to);
        if (outcome.kind === 'rejected') {
          setLastError(outcome.reason);
          return order;
        }
        setLastError(null);
        return outcome.order;
      }),
    );
  }

  const advance = (id: string): void =>
    transition(id, (order) => NEXT[order.status] ?? null);

  const cancel = (id: string): void => transition(id, () => 'CANCELLED');

  return {
    orders,
    counts: countByStatus(orders),
    visible: filterOrders(orders, filter, query),
    filter,
    query,
    lastError,
    setFilter,
    setQuery,
    advance,
    cancel,
    reset: () => {
      setOrders(MOCK_ORDERS);
      setFilter('ALL');
      setQuery('');
      setLastError(null);
    },
  };
}
