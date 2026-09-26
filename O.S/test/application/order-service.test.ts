import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  OrderAlreadyExistsError,
  OrderNotFoundError,
  OrderService,
  type Clock,
  type OrderEvent,
} from '../../src/application/index.js';
import { InvalidStatusTransitionError, OrderValidationError } from '../../src/domain/index.js';
import { LocalOrderEventBus } from '../../src/infrastructure/events/local-order-event-bus.js';
import { SequentialOrderIdGenerator } from '../../src/infrastructure/id/sequential-order-id-generator.js';
import { InMemoryOrderRepository } from '../../src/infrastructure/repositories/in-memory/in-memory-order-repository.js';

const COMPONENTS = {
  cpu: 'ryzen-5-5600',
  gpu: 'rtx-4060',
  ram: '16gb',
  storage: 'nvme-1tb',
  motherboard: 'b550',
  psu: '650w',
  case: 'mid-tower',
};

class FakeClock implements Clock {
  private current = new Date('2026-09-26T10:00:00.000Z');
  now(): Date {
    return new Date(this.current);
  }
  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

let repository: InMemoryOrderRepository;
let clock: FakeClock;
let events: OrderEvent[];
let service: OrderService;

beforeEach(() => {
  repository = new InMemoryOrderRepository();
  clock = new FakeClock();
  events = [];
  const bus = new LocalOrderEventBus();
  bus.subscribe((event) => {
    events.push(event);
  });
  service = new OrderService({ repository, idGenerator: new SequentialOrderIdGenerator(), clock, events: bus });
});

function fieldsOf(error: unknown): string[] {
  assert.ok(error instanceof OrderValidationError);
  return error.issues.map((issue) => issue.field);
}

describe('OrderService.create', () => {
  it('gera o id quando nao vem de fora, salva e publica order.created', async () => {
    const order = await service.create({ components: COMPONENTS });

    assert.equal(order.id, 'PED-001');
    assert.equal(order.status, 'PENDING');
    assert.deepEqual(await repository.findById('PED-001'), order);
    assert.deepEqual(events, [{ type: 'order.created', order, occurredAt: order.createdAt }]);
  });

  it('usa o id externo quando informado', async () => {
    const order = await service.create({ id: 'API-777', components: COMPONENTS });
    assert.equal(order.id, 'API-777');
  });

  it('recusa id externo duplicado sem publicar evento', async () => {
    await service.create({ id: 'API-1', components: COMPONENTS });
    await assert.rejects(service.create({ id: 'API-1', components: COMPONENTS }), OrderAlreadyExistsError);
    assert.equal(events.length, 1);
  });

  it('pula ids gerados que ja foram usados por pedidos externos', async () => {
    await service.create({ id: 'PED-001', components: COMPONENTS });
    const generated = await service.create({ components: COMPONENTS });
    assert.equal(generated.id, 'PED-002');
  });

  it('nao consome id do gerador quando os componentes sao invalidos', async () => {
    await assert.rejects(service.create({ components: { ...COMPONENTS, cpu: '' } }), OrderValidationError);
    const order = await service.create({ components: COMPONENTS });
    assert.equal(order.id, 'PED-001');
  });

  it('informa todos os campos invalidos juntos', async () => {
    const error = await service.create({ id: 'com espaco', components: { ...COMPONENTS, gpu: 'RTX' } }).catch((e: unknown) => e);
    assert.deepEqual(fieldsOf(error).sort(), ['components.gpu', 'id']);
    assert.deepEqual(await repository.findAll(), []);
  });

  it('com o mesmo id em paralelo, apenas um pedido e aceito', async () => {
    const results = await Promise.allSettled([
      service.create({ id: 'API-1', components: COMPONENTS }),
      service.create({ id: 'API-1', components: COMPONENTS }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await repository.findAll()).length, 1);
  });
});

describe('OrderService.get', () => {
  it('devolve a O.S. existente', async () => {
    const order = await service.create({ components: COMPONENTS });
    assert.deepEqual(await service.get('PED-001'), order);
  });

  it('lanca OrderNotFoundError para id inexistente', async () => {
    await assert.rejects(service.get('PED-999'), OrderNotFoundError);
  });

  it('lanca OrderValidationError para id malformado', async () => {
    await assert.rejects(service.get(''), OrderValidationError);
  });
});

describe('OrderService.list', () => {
  beforeEach(async () => {
    await service.create({ components: COMPONENTS });
    clock.advanceMinutes(1);
    await service.create({ components: COMPONENTS });
    clock.advanceMinutes(1);
    await service.create({ components: COMPONENTS });
    await service.updateStatus({ id: 'PED-002', status: 'ACCEPTED' });
    await service.updateStatus({ id: 'PED-003', status: 'CANCELLED' });
  });

  it('lista todas da mais antiga para a mais nova', async () => {
    assert.deepEqual((await service.list()).map((o) => o.id), ['PED-001', 'PED-002', 'PED-003']);
  });

  it('filtra por um status', async () => {
    assert.deepEqual((await service.list({ status: 'ACCEPTED' })).map((o) => o.id), ['PED-002']);
  });

  it('filtra por varios status', async () => {
    const ids = (await service.list({ status: ['PENDING', 'CANCELLED'] })).map((o) => o.id);
    assert.deepEqual(ids, ['PED-001', 'PED-003']);
  });

  it('rejeita status desconhecido no filtro', async () => {
    const error = await service.list({ status: ['PENDING', 'waiting'] }).catch((e: unknown) => e);
    assert.deepEqual(fieldsOf(error), ['status[1]']);
  });
});

describe('OrderService.updateStatus', () => {
  it('percorre PENDING -> ACCEPTED -> BUILDING -> COMPLETED publicando cada mudanca', async () => {
    const created = await service.create({ components: COMPONENTS });
    for (const status of ['ACCEPTED', 'BUILDING', 'COMPLETED'] as const) {
      clock.advanceMinutes(5);
      await service.updateStatus({ id: created.id, status });
    }

    const final = await service.get(created.id);
    assert.equal(final.status, 'COMPLETED');
    assert.equal(final.createdAt, created.createdAt);
    assert.equal(final.updatedAt, '2026-09-26T10:15:00.000Z');

    const changes = events.flatMap((e) => (e.type === 'order.status-changed' ? [`${e.from}->${e.to}`] : []));
    assert.deepEqual(changes, ['PENDING->ACCEPTED', 'ACCEPTED->BUILDING', 'BUILDING->COMPLETED']);
  });

  it('devolve a mudanca realizada', async () => {
    await service.create({ components: COMPONENTS });
    const change = await service.updateStatus({ id: 'PED-001', status: 'CANCELLED' });
    assert.equal(change.from, 'PENDING');
    assert.equal(change.to, 'CANCELLED');
    assert.equal(change.order.status, 'CANCELLED');
  });

  it('bloqueia transicao invalida sem salvar nem publicar', async () => {
    const created = await service.create({ components: COMPONENTS });
    await service.updateStatus({ id: created.id, status: 'ACCEPTED' });
    const before = events.length;

    await assert.rejects(service.updateStatus({ id: created.id, status: 'CANCELLED' }), InvalidStatusTransitionError);
    assert.equal((await service.get(created.id)).status, 'ACCEPTED');
    assert.equal(events.length, before);
  });

  it('lanca OrderNotFoundError para O.S. inexistente', async () => {
    await assert.rejects(service.updateStatus({ id: 'PED-404', status: 'ACCEPTED' }), OrderNotFoundError);
  });

  it('valida id e status juntos', async () => {
    const error = await service.updateStatus({ id: '', status: 'accepted' }).catch((e: unknown) => e);
    assert.deepEqual(fieldsOf(error).sort(), ['id', 'status']);
  });

  it('com atualizacoes em paralelo na mesma O.S., so uma transicao a partir de PENDING vence', async () => {
    await service.create({ components: COMPONENTS });
    const results = await Promise.allSettled([
      service.updateStatus({ id: 'PED-001', status: 'ACCEPTED' }),
      service.updateStatus({ id: 'PED-001', status: 'CANCELLED' }),
    ]);

    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.ok(results[1].status === 'rejected' && results[1].reason instanceof InvalidStatusTransitionError);
    assert.equal((await service.get('PED-001')).status, 'ACCEPTED');
  });
});
