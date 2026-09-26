import {
  COMPONENT_KEYS,
  emptyComponents,
  toOrderStatus,
  type Components,
  type Order,
} from '../types/order.js';

const COMPONENT_CONTAINER_KEYS = ['components', 'parts', 'specs', 'build', 'itens'] as const;

const ORDER_CONTAINER_KEYS = ['orders', 'data', 'items', 'results', 'content', 'lista'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isRecord(value)) {
    const nested = value['name'] ?? value['label'] ?? value['id'] ?? value['slug'] ?? value['title'];
    return toText(nested);
  }
  if (Array.isArray(value)) {
    return value.map(toText).filter((item) => item !== '').join(' + ');
  }
  return '';
}

function toIsoString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asMillis = value > 1e12 ? value : value * 1000;
    const date = new Date(asMillis);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

export function normalizeComponents(raw: unknown): Components {
  const components = emptyComponents();
  if (!isRecord(raw)) {
    return components;
  }
  const index = new Map<string, string>();
  for (const key of Object.keys(raw)) {
    index.set(normalizeKey(key), key);
  }
  for (const key of COMPONENT_KEYS) {
    const sourceKey = index.get(normalizeKey(key));
    components[key] = sourceKey === undefined ? '' : toText(raw[sourceKey]);
  }
  return components;
}

function extractComponents(source: Record<string, unknown>): Components {
  for (const key of COMPONENT_CONTAINER_KEYS) {
    if (key in source) {
      const value = source[key];
      if (isRecord(value)) {
        return normalizeComponents(value);
      }
    }
  }
  return normalizeComponents(source);
}

function extractId(source: Record<string, unknown>): string | null {
  const raw = source['id'] ?? source['orderId'] ?? source['codigo'] ?? source['code'] ?? source['numero'];
  const id = toText(raw);
  return id === '' ? null : id;
}

export function normalizeOrder(raw: unknown): Order | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = extractId(raw);
  if (id === null) {
    return null;
  }
  const status = toOrderStatus(
    raw['status'] ?? raw['state'] ?? raw['situacao'] ?? raw['estado'] ?? 'PENDING',
  );
  const order: Order = {
    id,
    status: status ?? 'PENDING',
    components: extractComponents(raw),
  };
  const createdAt = toIsoString(raw['createdAt'] ?? raw['created_at'] ?? raw['dataCriacao'] ?? raw['data']);
  const updatedAt = toIsoString(raw['updatedAt'] ?? raw['updated_at'] ?? raw['dataAtualizacao']);
  const customerName = toText(raw['customerName'] ?? raw['customer_name'] ?? raw['cliente'] ?? raw['nome']);
  if (createdAt !== undefined) {
    order.createdAt = createdAt;
  }
  if (updatedAt !== undefined) {
    order.updatedAt = updatedAt;
  }
  if (customerName !== '') {
    order.customerName = customerName;
  }
  return order;
}

export function normalizeOrderList(payload: unknown): Order[] {
  let list: unknown[] | null = null;
  if (Array.isArray(payload)) {
    list = payload;
  } else if (isRecord(payload)) {
    for (const key of ORDER_CONTAINER_KEYS) {
      const value = payload[key];
      if (Array.isArray(value)) {
        list = value;
        break;
      }
    }
  }
  if (list === null) {
    return [];
  }
  return list.map((item) => normalizeOrder(item)).filter((item): item is Order => item !== null);
}

export function normalizeSingleOrder(payload: unknown): Order | null {
  return normalizeOrder(payload);
}
