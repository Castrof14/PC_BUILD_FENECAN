// Roda os testes compilados em .test-dist/test (usado por `npm test`).
// Lista os arquivos aqui mesmo porque o Node 20 nao expande padroes como **/*.test.js.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '.test-dist/test';

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.name.endsWith('.test.js') ? [path] : [];
  });
}

const files = findTests(ROOT).sort();
if (files.length === 0) {
  console.error(`Nenhum teste encontrado em ${ROOT}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
