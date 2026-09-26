import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOsBackend } from '../../src/config/container.js';
import { OsConfigError, readOsSettings } from '../../src/config/os-settings.js';

describe('readOsSettings', () => {
  it('usa padroes seguros: memoria e nenhuma origem de pedidos', () => {
    assert.deepEqual(readOsSettings({}), {
      storage: 'memory', provider: 'none', idPrefix: 'PED', mockIntervalMs: 0,
      fenecanWsUrl: 'ws://localhost:3000/ws/os', httpPort: 4100,
    });
  });

  it('le os valores do ambiente', () => {
    const settings = readOsSettings({
      ORDER_STORAGE: 'memory',
      ORDER_PROVIDER: 'MOCK',
      ORDER_ID_PREFIX: 'OS',
      MOCK_ORDER_INTERVAL_MS: '5000',
      FENECAN_WS_URL: 'ws://192.168.0.20:3000/ws/os',
      OS_HTTP_PORT: '4200',
    });
    assert.deepEqual(settings, {
      storage: 'memory', provider: 'mock', idPrefix: 'OS', mockIntervalMs: 5000,
      fenecanWsUrl: 'ws://192.168.0.20:3000/ws/os', httpPort: 4200,
    });
  });

  it('trata valores vazios como ausentes', () => {
    assert.equal(readOsSettings({ ORDER_PROVIDER: '  ' }).provider, 'none');
  });

  it('rejeita valores invalidos com mensagem clara', () => {
    assert.throws(() => readOsSettings({ ORDER_STORAGE: 'database' }), OsConfigError);
    assert.throws(() => readOsSettings({ ORDER_PROVIDER: 'http' }), OsConfigError);
    assert.throws(() => readOsSettings({ ORDER_ID_PREFIX: 'PED-' }), OsConfigError);
    assert.throws(() => readOsSettings({ MOCK_ORDER_INTERVAL_MS: '-1' }), OsConfigError);
    assert.throws(() => readOsSettings({ MOCK_ORDER_INTERVAL_MS: 'rapido' }), OsConfigError);
    assert.throws(() => readOsSettings({ FENECAN_WS_URL: 'http://localhost:3000' }), OsConfigError);
    assert.throws(() => readOsSettings({ OS_HTTP_PORT: '70000' }), OsConfigError);
  });
});

describe('createOsBackend', () => {
  it('monta o backend conforme a configuracao', async () => {
    const backend = createOsBackend(readOsSettings({ ORDER_PROVIDER: 'none', ORDER_ID_PREFIX: 'OS' }));
    assert.equal(backend.intake.providerName, 'none');
    await backend.start();
    const order = await backend.service.create({ components: {
      cpu: 'ryzen-5-5600', gpu: 'rtx-4060', ram: '16gb', storage: 'nvme-1tb',
      motherboard: 'b550', psu: '650w', case: 'mid-tower',
    } });
    assert.equal(order.id, 'OS-001');
    await backend.stop();
  });

  it('seleciona o provedor mock quando configurado', () => {
    assert.equal(createOsBackend(readOsSettings({ ORDER_PROVIDER: 'mock' })).intake.providerName, 'mock');
  });

  it('seleciona o provedor do fenecan-backend quando configurado', () => {
    assert.equal(createOsBackend(readOsSettings({ ORDER_PROVIDER: 'fenecan' })).intake.providerName, 'fenecan');
  });
});
