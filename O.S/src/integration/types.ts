import type { Order, OrderStatus } from '../types/order.js';

export function orderToBuildSpec(order: Order): Record<string, string> {
  return {
    id: order.id,
    cpu: order.components.cpu,
    gpu: order.components.gpu,
    ram: order.components.ram,
    storage: order.components.storage,
    motherboard: order.components.motherboard,
    psu: order.components.psu,
    case: order.components.case,
  };
}

export type BuildOutcome = 'COMPLETED' | 'CANCELLED' | 'FAILED';

/**
 * Ponto unico de ligacao entre o sistema operador e o PC Building Simulator.
 *
 * Hoje so existe a implementacao nula (NoopSimulatorBridge). Quando o mod
 * existir (BepInEx, MelonLoader, WebSocket, watcher de arquivos, ...), crie uma
 * classe que implemente SimulatorBridge, troque a fabricacao em
 * src/integration/index.ts e nada mais no sistema precisa mudar.
 *
 * Os metodos sao disparados pelo sistema operador, nunca pela UI.
 */
export interface SimulatorBridge {
  readonly name: string;
  isAvailable(): boolean;
  onOrderAccepted(order: Order): void;
  onBuildStarted(order: Order): void;
  onBuildCompleted(order: Order): void;
  onOrderCancelled(order: Order): void;
  loadBuildSpec(order: Order): Promise<void>;
  reportStatus(orderId: string, status: OrderStatus): Promise<void>;
  dispose(): void;
}
