export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'BUILDING' | 'COMPLETED' | 'CANCELLED';

export type StatusFilter = 'ALL' | OrderStatus;

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
  customer: string;
  requestedAt: string;
}

export interface OrderFilter {
  query: string;
  status: StatusFilter;
}
