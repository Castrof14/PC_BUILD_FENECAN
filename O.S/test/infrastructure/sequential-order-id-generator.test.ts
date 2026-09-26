import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateOrderId } from '../../src/domain/index.js';
import { SequentialOrderIdGenerator } from '../../src/infrastructure/id/sequential-order-id-generator.js';

describe('SequentialOrderIdGenerator', () => {
  it('gera PED-001, PED-002, ...', async () => {
    const generator = new SequentialOrderIdGenerator();
    assert.equal(await generator.next(), 'PED-001');
    assert.equal(await generator.next(), 'PED-002');
  });

  it('aceita prefixo, digitos e inicio configuraveis', async () => {
    const generator = new SequentialOrderIdGenerator({ prefix: 'OS', digits: 5, start: 998 });
    assert.equal(await generator.next(), 'OS-00998');
  });

  it('passa do limite de digitos sem quebrar', async () => {
    const generator = new SequentialOrderIdGenerator({ start: 1000 });
    assert.equal(await generator.next(), 'PED-1000');
  });

  it('gera IDs aceitos pela validacao do dominio', async () => {
    const generator = new SequentialOrderIdGenerator();
    assert.equal(validateOrderId(await generator.next()).ok, true);
  });

  it('rejeita inicio invalido', () => {
    assert.throws(() => new SequentialOrderIdGenerator({ start: -1 }), RangeError);
    assert.throws(() => new SequentialOrderIdGenerator({ start: 1.5 }), RangeError);
  });
});
