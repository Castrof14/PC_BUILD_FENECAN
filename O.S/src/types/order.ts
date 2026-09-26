export const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'BUILDING', 'COMPLETED', 'CANCELLED'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const COMPONENT_KEYS = [
  'cpu',
  'gpu',
  'ram',
  'storage',
  'motherboard',
  'psu',
  'case',
] as const;

export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export interface Components {
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  motherboard: string;
  psu: string;
  case: string;
}

export interface Order {
  id: string;
  status: OrderStatus;
  components: Components;
  createdAt?: string;
  updatedAt?: string;
  customerName?: string;
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceito',
  BUILDING: 'Em montagem',
  COMPLETED: 'Concluido',
  CANCELLED: 'Cancelado',
};

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  ram: 'RAM',
  storage: 'Storage',
  motherboard: 'Motherboard',
  psu: 'PSU',
  case: 'Case',
};

export const STATUS_ALIASES: Readonly<Record<string, OrderStatus>> = {
  pending: 'PENDING',
  novo: 'PENDING',
  new: 'PENDING',
  aguardando: 'PENDING',
  waiting: 'PENDING',
  queued: 'PENDING',
  accepted: 'ACCEPTED',
  accept: 'ACCEPTED',
  accepted_order: 'ACCEPTED',
  aceito: 'ACCEPTED',
  building: 'BUILDING',
  build: 'BUILDING',
  in_progress: 'BUILDING',
  'in progress': 'BUILDING',
  em_montagem: 'BUILDING',
  montagem: 'BUILDING',
  completed: 'COMPLETED',
  complete: 'COMPLETED',
  completed_order: 'COMPLETED',
  done: 'COMPLETED',
  finished: 'COMPLETED',
  concluido: 'COMPLETED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  cancel: 'CANCELLED',
  cancelado: 'CANCELLED',
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function toOrderStatus(value: unknown): OrderStatus | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (isOrderStatus(trimmed)) {
    return trimmed;
  }
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return STATUS_ALIASES[key] ?? STATUS_ALIASES[trimmed.toLowerCase()] ?? null;
}

export function emptyComponents(): Components {
  return { cpu: '', gpu: '', ram: '', storage: '', motherboard: '', psu: '', case: '' };
}
