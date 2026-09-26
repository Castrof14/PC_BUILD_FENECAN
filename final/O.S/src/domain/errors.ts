import type { OrderStatus } from './types/order.js';

export type DomainErrorCode = 'ORDER_VALIDATION_ERROR' | 'INVALID_STATUS_TRANSITION';

/**
 * Erro de regra de negocio. Cada erro tem um `code` estavel para que camadas
 * externas (API, UI, logs) possam trata-lo sem depender da mensagem.
 */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export interface ValidationIssue {
  /** Caminho do campo com problema, ex.: `components.gpu`. */
  readonly field: string;
  readonly message: string;
}

export class OrderValidationError extends DomainError {
  readonly code = 'ORDER_VALIDATION_ERROR';

  constructor(readonly issues: readonly ValidationIssue[]) {
    super(`Dados da O.S. invalidos: ${issues.map((i) => `${i.field} (${i.message})`).join('; ')}`);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(
    readonly orderId: string,
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly allowed: readonly OrderStatus[],
  ) {
    const options = allowed.length > 0 ? allowed.join(', ') : 'nenhum (status final)';
    super(`O.S. ${orderId}: transicao ${from} -> ${to} nao permitida. Permitido: ${options}.`);
  }
}
