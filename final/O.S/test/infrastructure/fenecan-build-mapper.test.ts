import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOsBackend } from '../../src/config/container.js';
import { readOsSettings } from '../../src/config/os-settings.js';
import { OrderValidationError } from '../../src/domain/index.js';
import { FenecanBuildMapper } from '../../src/infrastructure/integrations/external-api/fenecan/fenecan-build-mapper.js';

const BUILD = {
  buildId: 'BUILD-001',
  cpu: 'ryzen-5-5600',
  gpu: 'rtx-4060',
  ram: 'ram-16-ddr4',
  storage: 'ssd-512',
  motherboard: 'b550',
  psu: '650w',
  case: 'mid-tower',
  status: 'WAITING',
  createdAt: '2026-09-26T10:00:00.000Z',
};

describe('FenecanBuildMapper', () => {
  it('usa o buildId como id e separa os componentes', () => {
    assert.deepEqual(new FenecanBuildMapper().toIncomingOrder(BUILD), {
      id: 'BUILD-001',
      components: {
        cpu: 'ryzen-5-5600', gpu: 'rtx-4060', ram: 'ram-16-ddr4', storage: 'ssd-512',
        motherboard: 'b550', psu: '650w', case: 'mid-tower',
      },
    });
  });

  it('recusa payload que nao e objeto', () => {
    assert.throws(() => new FenecanBuildMapper().toIncomingOrder('BUILD-001'), OrderValidationError);
  });

  it('build do backend vira O.S. PENDING e reenvio vira duplicate', async () => {
    const backend = createOsBackend(readOsSettings({}), { mapper: new FenecanBuildMapper() });
    const first = await backend.intake.receive(BUILD);
    assert.equal(first.status, 'accepted');
    assert.equal(first.status === 'accepted' && first.order.status, 'PENDING');
    assert.equal((await backend.intake.receive(BUILD)).status, 'duplicate');
    assert.equal((await backend.service.list()).length, 1);
  });
});
