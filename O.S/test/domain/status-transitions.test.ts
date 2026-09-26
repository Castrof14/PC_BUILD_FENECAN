import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORDER_STATUSES,
  InvalidStatusTransitionError,
  allowedTransitions,
  assertTransition,
  canTransition,
  isFinalStatus,
  type OrderStatus,
} from '../../src/domain/index.js';

const VALID: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ['PENDING', 'ACCEPTED'],
  ['ACCEPTED', 'BUILDING'],
  ['BUILDING', 'COMPLETED'],
  ['PENDING', 'CANCELLED'],
];

describe('transicoes de status', () => {
  it('permite exatamente o fluxo definido', () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        const expected = VALID.some(([a, b]) => a === from && b === to);
        assert.equal(canTransition(from, to), expected, `${from} -> ${to}`);
      }
    }
  });

  it('so permite cancelar a partir de PENDING', () => {
    assert.equal(canTransition('ACCEPTED', 'CANCELLED'), false);
    assert.equal(canTransition('BUILDING', 'CANCELLED'), false);
  });

  it('COMPLETED e CANCELLED sao finais', () => {
    assert.equal(isFinalStatus('COMPLETED'), true);
    assert.equal(isFinalStatus('CANCELLED'), true);
    assert.equal(isFinalStatus('PENDING'), false);
    assert.deepEqual(allowedTransitions('COMPLETED'), []);
  });

  it('assertTransition lanca erro com os status permitidos', () => {
    assert.throws(
      () => assertTransition('PED-001', 'PENDING', 'COMPLETED'),
      (error: unknown) =>
        error instanceof InvalidStatusTransitionError &&
        error.code === 'INVALID_STATUS_TRANSITION' &&
        error.from === 'PENDING' &&
        error.to === 'COMPLETED' &&
        error.allowed.join() === 'ACCEPTED,CANCELLED',
    );
  });
});
