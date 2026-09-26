import type { Order, OrderStatus } from '../types/order.js';
import { orderToBuildSpec, type SimulatorBridge } from './types.js';

export class NoopSimulatorBridge implements SimulatorBridge {
  readonly name = 'noop';

  isAvailable(): boolean {
    return false;
  }

  onOrderAccepted(order: Order): void {
    this.log(`pedido ${order.id} aceito - integracao com o simulador nao configurada`);
  }

  onBuildStarted(order: Order): void {
    this.log(`montagem do pedido ${order.id} solicitada - nada a fazer ainda`);
  }

  onBuildCompleted(order: Order): void {
    this.log(`montagem do pedido ${order.id} finalizada`);
  }

  onOrderCancelled(order: Order): void {
    this.log(`pedido ${order.id} cancelado`);
  }

  async loadBuildSpec(order: Order): Promise<void> {
    this.log(`spec do pedido ${order.id}: ${JSON.stringify(orderToBuildSpec(order))}`);
  }

  async reportStatus(orderId: string, status: OrderStatus): Promise<void> {
    this.log(`status ${orderId} -> ${status} (integracao nao configurada)`);
  }

  dispose(): void {
    return;
  }

  private log(message: string): void {
    console.log(`[ponte-simulador:${this.name}] ${message}`);
  }
}
