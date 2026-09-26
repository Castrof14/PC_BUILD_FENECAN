import { OrderValidationError, type ValidationIssue } from '../errors.js';
import {
  COMPONENT_KEYS,
  ORDER_STATUSES,
  isComponentKey,
  isOrderStatus,
  type ComponentKey,
  type Components,
  type OrderStatus,
} from '../types/order.js';

/** IDs padronizados de componentes: minusculas, numeros e hifens (ex.: `ryzen-5-5600`). */
const COMPONENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_ID_MAX_LENGTH = 100;

/** ID da O.S.: letras, numeros, `-` e `_` (ex.: `PED-001`). */
const ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const ORDER_ID_MAX_LENGTH = 64;

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateOrderId(value: unknown, field = 'id'): ValidationResult<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, issues: [{ field, message: 'obrigatorio (texto nao vazio)' }] };
  }
  const id = value.trim();
  if (id.length > ORDER_ID_MAX_LENGTH) {
    return { ok: false, issues: [{ field, message: `maximo de ${ORDER_ID_MAX_LENGTH} caracteres` }] };
  }
  if (!ORDER_ID_PATTERN.test(id)) {
    return { ok: false, issues: [{ field, message: 'use apenas letras, numeros, "-" e "_"' }] };
  }
  return { ok: true, value: id };
}

/**
 * Valida os componentes recebidos. Exige todas as chaves de `COMPONENT_KEYS`
 * e rejeita chaves desconhecidas (um erro de digitacao como `gpus` nao passa
 * em silencio).
 */
export function validateComponents(value: unknown, field = 'components'): ValidationResult<Components> {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ field, message: 'deve ser um objeto com os componentes' }] };
  }

  const issues: ValidationIssue[] = [];
  const components = {} as Record<ComponentKey, string>;

  for (const key of COMPONENT_KEYS) {
    const raw = value[key];
    const path = `${field}.${key}`;
    if (typeof raw !== 'string' || raw.trim() === '') {
      issues.push({ field: path, message: 'obrigatorio (texto nao vazio)' });
      continue;
    }
    const id = raw.trim();
    if (id.length > COMPONENT_ID_MAX_LENGTH) {
      issues.push({ field: path, message: `maximo de ${COMPONENT_ID_MAX_LENGTH} caracteres` });
    } else if (!COMPONENT_ID_PATTERN.test(id)) {
      issues.push({ field: path, message: `ID fora do padrao (ex.: "ryzen-5-5600"): "${id}"` });
    } else {
      components[key] = id;
    }
  }

  for (const key of Object.keys(value)) {
    if (!isComponentKey(key)) {
      issues.push({ field: `${field}.${key}`, message: 'componente desconhecido' });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: Object.freeze(components) };
}

export function validateStatus(value: unknown, field = 'status'): ValidationResult<OrderStatus> {
  if (!isOrderStatus(value)) {
    return {
      ok: false,
      issues: [{ field, message: `status invalido. Use: ${ORDER_STATUSES.join(', ')}` }],
    };
  }
  return { ok: true, value };
}

/** Devolve o valor validado ou lanca `OrderValidationError`. */
export function unwrap<T>(result: ValidationResult<T>): T {
  if (!result.ok) {
    throw new OrderValidationError(result.issues);
  }
  return result.value;
}
