import type { Order } from '../types/order.js';
import type { OrderEventBus } from '../services/order-events.js';
import type { SimulatorBridge } from './types.js';

export function connectBridge(bridge: SimulatorBridge, events: OrderEventBus): () => void {
  const onAccepted = ({ order }: { order: Order }): void => bridge.onOrderAccepted(order);
  const onBuildStarted = ({ order }: { order: Order }): void => bridge.onBuildStarted(order);
  const onCompleted = ({ order }: { order: Order }): void => bridge.onBuildCompleted(order);
  const onCancelled = ({ order }: { order: Order }): void => bridge.onOrderCancelled(order);

  events.on('order.accepted', onAccepted);
  events.on('order.build-started', onBuildStarted);
  events.on('order.completed', onCompleted);
  events.on('order.cancelled', onCancelled);

  return () => {
    events.off('order.accepted', onAccepted);
    events.off('order.build-started', onBuildStarted);
    events.off('order.completed', onCompleted);
    events.off('order.cancelled', onCancelled);
  };
}
