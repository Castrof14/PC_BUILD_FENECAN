import { NoopSimulatorBridge } from './noop-bridge.js';

export { NoopSimulatorBridge };
export { connectBridge } from './connect.js';
export * from './types.js';

import type { SimulatorBridge } from './types.js';

export function createSimulatorBridge(): SimulatorBridge {
  return new NoopSimulatorBridge();
}
