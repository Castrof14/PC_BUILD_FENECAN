import { InvalidStatusTransitionError } from '../errors.js';
import type { OrderStatus } from '../types/order.js';

/**
 * Fluxo da O.S.:
 *
 *   PENDING -> ACCEPTED -> BUILDING -> COMPLETED
 *   PENDING -> CANCELLED
 *
 * COMPLETED e CANCELLED sao finais. Para mudar o fluxo, altere somente esta tabela.
 */
export const STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['BUILDING'],
  BUILDING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...STATUS_TRANSITIONS[from]];
}

export function isFinalStatus(status: OrderStatus): boolean {
  return STATUS_TRANSITIONS[status].length === 0;
}

export function assertTransition(orderId: string, from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionError(orderId, from, to, STATUS_TRANSITIONS[from]);
  }
}
