import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Rodando pelo Tauri (`tauri dev`), a janela e do Tauri: nao abre navegador.
const runningInTauri = process.env['TAURI_ENV_PLATFORM'] !== undefined;

export default defineConfig({
  root: 'web',
  // O .env fica em O.S/ (o mesmo do backend), nao em O.S/web.
  envDir: '..',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    open: !runningInTauri,
  },
  // Mantem os erros do Rust visiveis no terminal do `tauri dev`.
  clearScreen: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
