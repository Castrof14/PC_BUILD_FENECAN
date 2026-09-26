import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrderRepository } from '../../src/application/index.js';
import { createOsBackend } from '../../src/config/container.js';
import { readOsSettings } from '../../src/config/os-settings.js';
import { LocalMockOrderProvider } from '../../src/infrastructure/integrations/external-api/mock/local-mock-order-provider.js';
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

async function setup(repository?: OrderRepository) {
  const provider = new LocalMockOrderProvider();
  const backend = createOsBackend(readOsSettings({}), { provider, repository });
  await backend.start();
  return { backend, provider };
}

describe('ExternalOrderIntake', () => {
  it('pedido valido vira O.S. PENDING', async () => {
    const { backend, provider } = await setup();
    const outcome = await provider.push({ components: COMPONENTS });

    assert.equal(outcome.status, 'accepted');
    assert.ok(outcome.status === 'accepted');
    assert.equal(outcome.order.id, 'PED-001');
    assert.equal((await backend.service.get('PED-001')).status, 'PENDING');
  });

  it('reenvio do mesmo id devolve duplicate com a O.S. existente, sem alterar nada', async () => {
    const { backend, provider } = await setup();
    await provider.push({ id: 'API-1', components: COMPONENTS });
    await backend.service.updateStatus({ id: 'API-1', status: 'ACCEPTED' });

    const outcome = await provider.push({ id: 'API-1', components: COMPONENTS });
    assert.equal(outcome.status, 'duplicate');
    assert.ok(outcome.status === 'duplicate');
    assert.equal(outcome.order.status, 'ACCEPTED');
    assert.equal((await backend.service.list()).length, 1);
  });

  it('pedido invalido e rejeitado com os campos problematicos', async () => {
    const { backend, provider } = await setup();
    const outcome = await provider.push({ components: { ...COMPONENTS, gpu: '' } });

    assert.ok(outcome.status === 'rejected');
    assert.equal(outcome.code, 'ORDER_VALIDATION_ERROR');
    assert.deepEqual(outcome.issues.map((i) => i.field), ['components.gpu']);
    assert.deepEqual(await backend.service.list(), []);
  });

  it('payload que nao e objeto e rejeitado', async () => {
    const { provider } = await setup();
    const outcome = await provider.push('nao sou json');
    assert.ok(outcome.status === 'rejected');
    assert.deepEqual(outcome.issues.map((i) => i.field), ['payload']);
  });

  it('falha inesperada do armazenamento e repassada para a origem tentar de novo', async () => {
    const broken = new InMemoryOrderRepository();
    broken.save = async () => {
      throw new Error('banco fora do ar');
    };
    const { provider } = await setup(broken);
    await assert.rejects(provider.push({ components: COMPONENTS }), /banco fora do ar/);
  });

  it('eventos chegam aos inscritos', async () => {
    const { backend, provider } = await setup();
    const types: string[] = [];
    backend.events.subscribe((event) => void types.push(event.type));

    await provider.emitSample();
    await backend.service.updateStatus({ id: 'PED-001', status: 'ACCEPTED' });
    assert.deepEqual(types, ['order.created', 'order.status-changed']);
  });

  it('depois de stop, o provedor nao entrega mais pedidos', async () => {
    const { backend, provider } = await setup();
    await backend.stop();
    await assert.rejects(provider.push({ components: COMPONENTS }), /nao foi iniciado/);
  });
});

describe('LocalMockOrderProvider', () => {
  it('gera exemplos validos em sequencia', async () => {
    const { backend, provider } = await setup();
    for (let i = 0; i < 4; i += 1) {
      const outcome = await provider.emitSample();
      assert.equal(outcome.status, 'accepted');
    }
    assert.deepEqual((await backend.service.list()).map((o) => o.id), ['PED-001', 'PED-002', 'PED-003', 'PED-004']);
  });
});
