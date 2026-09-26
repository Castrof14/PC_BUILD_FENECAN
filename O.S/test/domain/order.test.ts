import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InvalidStatusTransitionError,
  OrderValidationError,
  changeOrderStatus,
  createOrder,
  validateComponents,
  validateStatus,
} from '../../src/domain/index.js';

const COMPONENTS = {
  cpu: 'ryzen-5-5600',
  gpu: 'rtx-4060',
  ram: '16gb',
  storage: 'nvme-1tb',
  motherboard: 'b550',
  psu: '650w',
  case: 'mid-tower',
};

const T0 = new Date('2026-09-26T10:00:00.000Z');
const T1 = new Date('2026-09-26T10:05:00.000Z');

function issuesOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof OrderValidationError);
    return error.issues.map((issue) => issue.field);
  }
  assert.fail('esperava OrderValidationError');
}

describe('createOrder', () => {
  it('cria uma O.S. PENDING no formato esperado', () => {
    const order = createOrder({ id: 'PED-001', components: COMPONENTS }, T0);
    assert.deepEqual(order, {
      id: 'PED-001',
      status: 'PENDING',
      components: COMPONENTS,
      createdAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
    });
  });

  it('remove espacos das pontas', () => {
    const order = createOrder({ id: ' PED-002 ', components: { ...COMPONENTS, gpu: ' rtx-4060 ' } }, T0);
    assert.equal(order.id, 'PED-002');
    assert.equal(order.components.gpu, 'rtx-4060');
  });

  it('e imutavel', () => {
    const order = createOrder({ id: 'PED-001', components: COMPONENTS }, T0);
    assert.ok(Object.isFrozen(order));
    assert.ok(Object.isFrozen(order.components));
  });

  it('junta todos os erros de validacao em uma unica excecao', () => {
    const { cpu: _cpu, ...semCpu } = COMPONENTS;
    const fields = issuesOf(() =>
      createOrder({ id: '', components: { ...semCpu, gpu: 'RTX 4060', gpus: 'x' } }, T0),
    );
    assert.deepEqual(fields.sort(), ['components.cpu', 'components.gpu', 'components.gpus', 'id'].sort());
  });

  it('rejeita componentes que nao sao objeto', () => {
    assert.deepEqual(issuesOf(() => createOrder({ id: 'PED-001', components: null }, T0)), ['components']);
    assert.deepEqual(issuesOf(() => createOrder({ id: 'PED-001', components: [] }, T0)), ['components']);
  });

  it('rejeita IDs de O.S. fora do padrao', () => {
    assert.deepEqual(issuesOf(() => createOrder({ id: 'PED 001', components: COMPONENTS }, T0)), ['id']);
    assert.deepEqual(issuesOf(() => createOrder({ id: 'x'.repeat(65), components: COMPONENTS }, T0)), ['id']);
    assert.deepEqual(issuesOf(() => createOrder({ id: 42, components: COMPONENTS }, T0)), ['id']);
  });
});

describe('changeOrderStatus', () => {
  it('percorre o fluxo completo sem alterar a O.S. original', () => {
    const pending = createOrder({ id: 'PED-001', components: COMPONENTS }, T0);
    const accepted = changeOrderStatus(pending, 'ACCEPTED', T1);
    const building = changeOrderStatus(accepted, 'BUILDING', T1);
    const completed = changeOrderStatus(building, 'COMPLETED', T1);

    assert.equal(pending.status, 'PENDING');
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.createdAt, T0.toISOString());
    assert.equal(completed.updatedAt, T1.toISOString());
    assert.deepEqual(completed.components, COMPONENTS);
  });

  it('bloqueia transicoes invalidas', () => {
    const pending = createOrder({ id: 'PED-001', components: COMPONENTS }, T0);
    const accepted = changeOrderStatus(pending, 'ACCEPTED', T1);
    assert.throws(() => changeOrderStatus(pending, 'BUILDING', T1), InvalidStatusTransitionError);
    assert.throws(() => changeOrderStatus(accepted, 'CANCELLED', T1), InvalidStatusTransitionError);
    assert.throws(() => changeOrderStatus(pending, 'PENDING', T1), InvalidStatusTransitionError);
  });
});

describe('validadores', () => {
  it('validateStatus aceita apenas os status oficiais', () => {
    assert.deepEqual(validateStatus('BUILDING'), { ok: true, value: 'BUILDING' });
    assert.equal(validateStatus('building').ok, false);
    assert.equal(validateStatus(undefined).ok, false);
  });

  it('validateComponents informa o caminho do campo', () => {
    const result = validateComponents({ ...COMPONENTS, psu: '' }, 'payload.components');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.deepEqual(result.issues.map((i) => i.field), ['payload.components.psu']);
    }
  });
});
