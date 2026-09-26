import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrderEvent } from '../../src/application/index.js';
import { createOrder } from '../../src/domain/index.js';
import { LocalOrderEventBus } from '../../src/infrastructure/events/local-order-event-bus.js';

const order = createOrder(
  {
    id: 'PED-001',
    components: {
      cpu: 'ryzen-5-5600',
      gpu: 'rtx-4060',
      ram: '16gb',
      storage: 'nvme-1tb',
      motherboard: 'b550',
      psu: '650w',
      case: 'mid-tower',
    },
  },
  new Date('2026-09-26T10:00:00.000Z'),
);
const event: OrderEvent = { type: 'order.created', order, occurredAt: order.createdAt };

describe('LocalOrderEventBus', () => {
  it('entrega o evento a todos os ouvintes', () => {
    const bus = new LocalOrderEventBus();
    const received: string[] = [];
    bus.subscribe(() => void received.push('a'));
    bus.subscribe(() => void received.push('b'));
    bus.publish(event);
    assert.deepEqual(received, ['a', 'b']);
  });

  it('para de entregar depois do unsubscribe', () => {
    const bus = new LocalOrderEventBus();
    let count = 0;
    const unsubscribe = bus.subscribe(() => {
      count += 1;
    });
    unsubscribe();
    bus.publish(event);
    assert.equal(count, 0);
  });

  it('isola ouvintes que falham (sincronos e assincronos)', async () => {
    const errors: unknown[] = [];
    const bus = new LocalOrderEventBus({ onListenerError: (error) => errors.push(error) });
    let delivered = false;
    bus.subscribe(() => {
      throw new Error('sincrono');
    });
    bus.subscribe(async () => {
      throw new Error('assincrono');
    });
    bus.subscribe(() => {
      delivered = true;
    });

    assert.doesNotThrow(() => bus.publish(event));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(delivered, true);
    assert.deepEqual(errors.map((e) => (e as Error).message).sort(), ['assincrono', 'sincrono']);
  });
});
