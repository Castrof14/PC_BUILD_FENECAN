import type { OrderStatus, StatusFilter } from '../types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceito',
  BUILDING: 'Em montagem',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  ALL: 'Todos',
  PENDING: 'Pendentes',
  ACCEPTED: 'Aceitos',
  BUILDING: 'Montando',
  COMPLETED: 'Concluídos',
  CANCELLED: 'Cancelados',
};

export const STATUS_SEQUENCE: OrderStatus[] = ['PENDING', 'ACCEPTED', 'BUILDING', 'COMPLETED'];

export const STATUS_ORDER: OrderStatus[] = [...STATUS_SEQUENCE, 'CANCELLED'];

export const FILTERS: StatusFilter[] = ['ALL', ...STATUS_ORDER];

export interface ActionDefinition {
  label: string;
  to: OrderStatus;
}

const PRIMARY_ACTION: Partial<Record<OrderStatus, ActionDefinition>> = {
  PENDING: { label: 'Aceitar pedido', to: 'ACCEPTED' },
  ACCEPTED: { label: 'Iniciar montagem', to: 'BUILDING' },
  BUILDING: { label: 'Concluir', to: 'COMPLETED' },
};

const CANCELLABLE: OrderStatus[] = ['PENDING', 'ACCEPTED', 'BUILDING'];

export function primaryActionFor(status: OrderStatus): ActionDefinition | null {
  return PRIMARY_ACTION[status] ?? null;
}

export function canCancel(status: OrderStatus): boolean {
  return CANCELLABLE.includes(status);
}
