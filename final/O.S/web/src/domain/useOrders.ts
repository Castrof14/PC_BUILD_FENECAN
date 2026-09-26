import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOrders, updateOrderStatus } from '../data/os-api';
import type { Order, OrderStatus, StatusFilter } from '../types';
import { applyTransition } from './order-actions';
import { countByStatus, filterOrders, type StatusCounts } from './selectors';

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'ACCEPTED',
  ACCEPTED: 'BUILDING',
  BUILDING: 'COMPLETED',
};

/** Intervalo da atualizacao automatica da lista, em ms. */
const POLL_INTERVAL_MS = 2000;

export interface OrdersState {
  orders: Order[];
  counts: StatusCounts;
  visible: Order[];
  filter: StatusFilter;
  query: string;
  lastError: string | null;
  /** O.S. que chegaram depois da primeira carga e ainda nao foram tocadas. */
  newIds: ReadonlySet<string>;
  /** Horario (HH:MM) da ultima sincronizacao bem-sucedida. */
  lastSync: string;
  setFilter: (filter: StatusFilter) => void;
  setQuery: (query: string) => void;
  advance: (id: string) => void;
  cancel: (id: string) => void;
  reset: () => void;
}

function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Pedidos vindos da API local da O.S., atualizados a cada POLL_INTERVAL_MS. */
export function useOrders(): OrdersState {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [query, setQuery] = useState('');
  const [lastError, setLastError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const [lastSync, setLastSync] = useState('--:--');
  const known = useRef<Set<string> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchOrders();
      // Na primeira carga nada e "novo"; depois, marca o que chegou do site.
      if (known.current !== null) {
        const seen = known.current;
        const arrived = next.filter((order) => !seen.has(order.id)).map((order) => order.id);
        if (arrived.length > 0) {
          setNewIds((current) => new Set([...current, ...arrived]));
        }
      }
      known.current = new Set(next.map((order) => order.id));
      setOrders(next);
      setLastSync(clock(new Date()));
      setLastError((current) => (current !== null && current.startsWith('O.S. fora do ar') ? null : current));
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  function markSeen(id: string): void {
    setNewIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function transition(id: string, to: OrderStatus | null): void {
    const order = orders.find((item) => item.id === id);
    if (order === undefined || to === null) {
      return;
    }
    // Validacao local so para dar resposta imediata; quem decide e a O.S.
    const outcome = applyTransition(order, to);
    if (outcome.kind === 'rejected') {
      setLastError(outcome.reason);
      return;
    }
    markSeen(id);
    updateOrderStatus(id, to)
      .then((updated) => {
        setLastError(null);
        setOrders((current) => current.map((item) => (item.id === id ? updated : item)));
      })
      .catch((error: unknown) => setLastError(error instanceof Error ? error.message : String(error)));
  }

  const advance = (id: string): void => {
    const order = orders.find((item) => item.id === id);
    transition(id, order === undefined ? null : (NEXT[order.status] ?? null));
  };

  const cancel = (id: string): void => transition(id, 'CANCELLED');

  return {
    orders,
    counts: countByStatus(orders),
    visible: filterOrders(orders, filter, query),
    filter,
    query,
    lastError,
    newIds,
    lastSync,
    setFilter,
    setQuery,
    advance,
    cancel,
    reset: () => {
      setFilter('ALL');
      setQuery('');
      setLastError(null);
      void refresh();
    },
  };
}
