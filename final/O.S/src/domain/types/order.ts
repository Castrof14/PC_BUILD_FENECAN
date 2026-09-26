/**
 * Tipos centrais da Ordem de Servico (O.S.).
 *
 * Esta camada nao conhece banco, API, HTTP nem interface. Tudo que muda a
 * estrutura de uma O.S. comeca aqui.
 */

export const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'BUILDING', 'COMPLETED', 'CANCELLED'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Lista unica dos componentes de uma montagem. A validacao e o tipo
 * `Components` sao derivados daqui: para adicionar um componente (ex.: cooler),
 * basta incluir a chave nesta lista.
 */
export const COMPONENT_KEYS = ['cpu', 'gpu', 'ram', 'storage', 'motherboard', 'psu', 'case'] as const;

export type ComponentKey = (typeof COMPONENT_KEYS)[number];

/** Cada componente e o ID padronizado compartilhado por site, backend, banco e Unity. */
export type Components = Readonly<Record<ComponentKey, string>>;

export interface Order {
  readonly id: string;
  readonly status: OrderStatus;
  readonly components: Components;
  /** ISO 8601 */
  readonly createdAt: string;
  /** ISO 8601 */
  readonly updatedAt: string;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isComponentKey(value: unknown): value is ComponentKey {
  return typeof value === 'string' && (COMPONENT_KEYS as readonly string[]).includes(value);
}
