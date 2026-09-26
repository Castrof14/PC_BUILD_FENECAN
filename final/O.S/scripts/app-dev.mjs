/**
 * Sobe a O.S. completa para desenvolvimento:
 *   - backend da O.S. (npm run os:start): recebe as builds do fenecan-backend
 *     e expoe a API local em OS_HTTP_PORT;
 *   - tela do operador (Vite, porta 5173).
 *
 * E o `beforeDevCommand` do Tauri (Tauri/src-tauri/tauri.conf.json), mas
 * tambem roda sozinho:  npm run app:dev
 * Ctrl+C (ou o Tauri fechando) encerra os dois.
 */
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'os:start'], { stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npm, ['run', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  process.exit(code);
}

for (const child of children) {
  // Se um dos dois cair, derruba o outro: meia O.S. no ar so confunde.
  child.on('exit', (code) => stop(code ?? 0));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
