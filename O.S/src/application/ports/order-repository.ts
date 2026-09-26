import type { Order, OrderStatus } from '../../domain/index.js';

export interface OrderFilter {
  /** Um status ou uma lista de status aceitos. Ausente = todos. */
  status?: OrderStatus | readonly OrderStatus[];
}

/**
 * Contrato de armazenamento das O.S.
 *
 * A logica de negocio depende somente desta interface, nunca de uma
 * implementacao concreta. Hoje: `InMemoryOrderRepository`. Futuro:
 * `DatabaseOrderRepository`, ligado em `src/config/container.ts`.
 *
 * Todos os metodos sao assincronos para que um banco real encaixe sem mudar
 * quem chama. Toda implementacao deve passar em
 * `test/contracts/order-repository.contract.ts`.
 */
export interface OrderRepository {
  /** Insere ou substitui a O.S. com o mesmo `id`. */
  save(order: Order): Promise<void>;

  /** Devolve a O.S. ou `null` se nao existir. */
  findById(id: string): Promise<Order | null>;

  /** Lista as O.S. da mais antiga para a mais nova (`createdAt`, depois `id`). */
  findAll(filter?: OrderFilter): Promise<Order[]>;

  exists(id: string): Promise<boolean>;
}
