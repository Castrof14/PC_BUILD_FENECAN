/**
 * Inicia o backend da O.S. sozinho (sem a tela do operador).
 *
 *   npm run os:start
 *
 * Com ORDER_PROVIDER=mock e MOCK_ORDER_INTERVAL_MS > 0, pedidos de exemplo
 * chegam sozinhos e cada evento aparece no terminal.
 */
import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOsBackend } from './config/container.js';
import { OsConfigError, readOsSettings } from './config/os-settings.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function time(): string {
  return new Date().toLocaleTimeString('pt-BR');
}

async function main(): Promise<void> {
  loadDotenv({ path: path.join(projectRoot, '.env'), quiet: true });
  const settings = readOsSettings();
  const backend = createOsBackend(settings);

  backend.events.subscribe((event) => {
    if (event.type === 'order.created') {
      console.log(`${time()}  O.S. ${event.order.id} criada (${event.order.status})`);
    } else {
      console.log(`${time()}  O.S. ${event.order.id}: ${event.from} -> ${event.to}`);
    }
  });

  await backend.start();

  console.log('');
  console.log('  BACKEND O.S. INICIADO');
  console.log(`  Armazenamento   ${settings.storage}`);
  console.log(`  Origem pedidos  ${backend.intake.providerName}`);
  if (settings.provider === 'mock') {
    console.log(`  Mock            ${settings.mockIntervalMs > 0 ? `1 pedido a cada ${settings.mockIntervalMs} ms` : 'sem geracao automatica'}`);
  }
  console.log('  Ctrl+C encerra.');
  console.log('');

  const shutdown = async (): Promise<void> => {
    await backend.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  // Mantem o processo vivo mesmo sem timers (ex.: ORDER_PROVIDER=none).
  setInterval(() => undefined, 1 << 30);
}

main().catch((error: unknown) => {
  console.error('');
  console.error('  NAO FOI POSSIVEL INICIAR O BACKEND DA O.S.');
  console.error(`  ${error instanceof OsConfigError ? error.message : String(error)}`);
  console.error('');
  process.exit(1);
});
