import { OrderValidationError, type ValidationIssue } from '../errors.js';
import { validateComponents, validateOrderId } from '../rules/order-validation.js';
import { assertTransition } from '../rules/status-transitions.js';
import type { Order, OrderStatus } from '../types/order.js';

/**
 * Operacoes da entidade O.S.
 *
 * Uma O.S. e um objeto simples e imutavel: cada operacao devolve uma nova O.S.
 * Isso facilita salvar em qualquer armazenamento (memoria, banco) e enviar como
 * JSON sem conversao. O horario vem de fora (`now`) para manter o dominio
 * deterministico e testavel.
 */

export interface CreateOrderInput {
  id: unknown;
  components: unknown;
}

function freezeOrder(order: Order): Order {
  return Object.freeze({ ...order, components: Object.freeze({ ...order.components }) });
}

/** Cria uma nova O.S. valida, sempre com status PENDING. */
export function createOrder(input: CreateOrderInput, now: Date): Order {
  const id = validateOrderId(input.id);
  const components = validateComponents(input.components);

  const issues: ValidationIssue[] = [];
  if (!id.ok) issues.push(...id.issues);
  if (!components.ok) issues.push(...components.issues);
  if (!id.ok || !components.ok) {
    throw new OrderValidationError(issues);
  }

  const timestamp = now.toISOString();
  return freezeOrder({
    id: id.value,
    status: 'PENDING',
    components: components.value,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

/** Muda o status respeitando o fluxo permitido. Lanca `InvalidStatusTransitionError`. */
export function changeOrderStatus(order: Order, to: OrderStatus, now: Date): Order {
  assertTransition(order.id, order.status, to);
  return freezeOrder({ ...order, status: to, updatedAt: now.toISOString() });
}
