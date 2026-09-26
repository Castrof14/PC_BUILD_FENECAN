import {
  OrderValidationError,
  validateStatus,
  type Order,
  type OrderStatus,
  type ValidationIssue,
} from '../../domain/index.js';
import type { OrderRepository } from '../ports/index.js';

export interface ListOrdersInput {
  /** Um status ou lista de status. Ausente = todos. */
  status?: unknown;
}

export interface ListOrdersDeps {
  repository: OrderRepository;
}

export class ListOrders {
  constructor(private readonly deps: ListOrdersDeps) {}

  async execute(input: ListOrdersInput = {}): Promise<Order[]> {
    if (input.status === undefined) {
      return this.deps.repository.findAll();
    }
    return this.deps.repository.findAll({ status: parseStatuses(input.status) });
  }
}

function parseStatuses(value: unknown): OrderStatus[] {
  const values = Array.isArray(value) ? value : [value];
  const statuses: OrderStatus[] = [];
  const issues: ValidationIssue[] = [];
  values.forEach((item, index) => {
    const result = validateStatus(item, Array.isArray(value) ? `status[${index}]` : 'status');
    if (result.ok) {
      statuses.push(result.value);
    } else {
      issues.push(...result.issues);
    }
  });
  if (issues.length > 0) {
    throw new OrderValidationError(issues);
  }
  return statuses;
}
