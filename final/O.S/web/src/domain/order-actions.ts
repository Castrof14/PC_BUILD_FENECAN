import type { Order, OrderStatus } from '../types';
import { STATUS_LABEL } from './order-status';

export type ActionOutcome =
  | { kind: 'advanced'; order: Order; to: OrderStatus }
  | { kind: 'cancelled'; order: Order }
  | { kind: 'rejected'; reason: string };

// Mesma regra do backend da O.S. (src/domain/rules/status-transitions.ts).
const CANCELLABLE: OrderStatus[] = ['PENDING'];

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'ACCEPTED',
  ACCEPTED: 'BUILDING',
  BUILDING: 'COMPLETED',
};

export function applyTransition(order: Order, to: OrderStatus): ActionOutcome {
  if (to === 'CANCELLED') {
    if (!CANCELLABLE.includes(order.status)) {
      return { kind: 'rejected', reason: `Pedido ${order.id} não pode mais ser cancelado.` };
    }
    return { kind: 'cancelled', order: { ...order, status: 'CANCELLED' } };
  }

  const expected = NEXT[order.status];

  if (expected === undefined) {
    return {
      kind: 'rejected',
      reason: `Pedido ${order.id} está ${STATUS_LABEL[order.status].toLowerCase()} e não avança mais.`,
    };
  }

  if (expected !== to) {
    return {
      kind: 'rejected',
      reason: `Ação inválida: ${order.id} espera o status ${expected}.`,
    };
  }

  return { kind: 'advanced', order: { ...order, status: to }, to };
}
