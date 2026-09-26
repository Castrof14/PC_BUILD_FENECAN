import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OrderValidationError } from '../../src/domain/index.js';
import { OsOrderMapper } from '../../src/infrastructure/integrations/external-api/os-order-mapper.js';

describe('OsOrderMapper', () => {
  const mapper = new OsOrderMapper();

  it('extrai id e components do formato da O.S.', () => {
    const components = { cpu: 'ryzen-5-5600' };
    assert.deepEqual(mapper.toIncomingOrder({ id: 'PED-001', components }), { id: 'PED-001', components });
  });

  it('id ausente continua ausente (a O.S. gera)', () => {
    assert.equal(mapper.toIncomingOrder({ components: {} }).id, undefined);
  });

  it('ignora status vindo de fora', () => {
    assert.deepEqual(Object.keys(mapper.toIncomingOrder({ status: 'COMPLETED', components: {} })).sort(), ['components', 'id']);
  });

  it('rejeita payload que nao e objeto', () => {
    for (const payload of [null, undefined, 'texto', 42, []]) {
      assert.throws(() => mapper.toIncomingOrder(payload), OrderValidationError);
    }
  });
});
