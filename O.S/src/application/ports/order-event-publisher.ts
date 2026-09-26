import type { Order, OrderStatus } from '../../domain/index.js';

export type OrderEvent =
  | {
      readonly type: 'order.created';
      readonly order: Order;
      readonly occurredAt: string;
    }
  | {
      readonly type: 'order.status-changed';
      readonly order: Order;
      readonly from: OrderStatus;
      readonly to: OrderStatus;
      readonly occurredAt: string;
    };

export type OrderEventType = OrderEvent['type'];

/**
 * Avisa o mundo externo sobre mudancas nas O.S. (ex.: futuramente notificar a
 * API oficial, a Unity ou a tela do operador) sem que a logica de negocio
 * conheca esses destinos.
 *
 * Contrato: `publish` e chamado DEPOIS que a O.S. foi salva e NAO deve lancar
 * erro — uma falha de notificacao nao desfaz a operacao.
 */
export interface OrderEventPublisher {
  publish(event: OrderEvent): void;
}
