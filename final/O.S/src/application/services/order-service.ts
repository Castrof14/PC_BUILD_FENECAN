import type { Order } from '../../domain/index.js';
import type { Clock, OrderEventPublisher, OrderIdGenerator, OrderRepository } from '../ports/index.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { CreateOrder, type CreateOrderInput } from '../use-cases/create-order.js';
import { GetOrder } from '../use-cases/get-order.js';
import { ListOrders, type ListOrdersInput } from '../use-cases/list-orders.js';
import {
  UpdateOrderStatus,
  type StatusChange,
  type UpdateOrderStatusInput,
} from '../use-cases/update-order-status.js';

export interface OrderServiceDeps {
  repository: OrderRepository;
  idGenerator: OrderIdGenerator;
  clock: Clock;
  events: OrderEventPublisher;
}

/**
 * Ponto de entrada do backend da O.S. Qualquer camada externa (API oficial,
 * integracao, tela do operador) usa somente esta classe.
 *
 * Nao conhece banco nem API: recebe as implementacoes por injecao
 * (ver `src/config/container.ts`).
 */
export class OrderService {
  private readonly createOrder: CreateOrder;
  private readonly getOrder: GetOrder;
  private readonly listOrders: ListOrders;
  private readonly updateOrderStatus: UpdateOrderStatus;

  constructor(deps: OrderServiceDeps) {
    // Uma unica trava compartilhada: criacao e mudanca de status da mesma O.S. nao se atropelam.
    const lock = new KeyedLock();
    this.createOrder = new CreateOrder({ ...deps, lock });
    this.getOrder = new GetOrder(deps);
    this.listOrders = new ListOrders(deps);
    this.updateOrderStatus = new UpdateOrderStatus({ ...deps, lock });
  }

  create(input: CreateOrderInput): Promise<Order> {
    return this.createOrder.execute(input);
  }

  get(id: unknown): Promise<Order> {
    return this.getOrder.execute(id);
  }

  list(input?: ListOrdersInput): Promise<Order[]> {
    return this.listOrders.execute(input);
  }

  updateStatus(input: UpdateOrderStatusInput): Promise<StatusChange> {
    return this.updateOrderStatus.execute(input);
  }
}
