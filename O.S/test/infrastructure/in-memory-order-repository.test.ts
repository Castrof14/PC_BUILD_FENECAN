import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOrder } from '../../src/domain/index.js';
import { InMemoryOrderRepository } from '../../src/infrastructure/repositories/in-memory/in-memory-order-repository.js';
import { runOrderRepositoryContract } from '../contracts/order-repository.contract.js';

runOrderRepositoryContract('InMemoryOrderRepository', async () => new InMemoryOrderRepository());

describe('InMemoryOrderRepository', () => {
  it('nao deixa alteracoes externas vazarem para o armazenamento', async () => {
    const repo = new InMemoryOrderRepository();
    const components = {
      cpu: 'ryzen-5-5600',
      gpu: 'rtx-4060',
      ram: '16gb',
      storage: 'nvme-1tb',
      motherboard: 'b550',
      psu: '650w',
      case: 'mid-tower',
    };
    const original = createOrder({ id: 'PED-001', components }, new Date());
    const mutable = { ...original, components: { ...original.components } };
    await repo.save(mutable);
    mutable.components.gpu = 'alterado';

    const stored = await repo.findById('PED-001');
    assert.equal(stored?.components.gpu, 'rtx-4060');
    assert.ok(Object.isFrozen(stored));
  });
});
