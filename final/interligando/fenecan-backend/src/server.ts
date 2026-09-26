import type { FastifyInstance } from "fastify";
import { applySchema, testConnection } from "./database/database.js";
import { buildApp } from "./app.js";
import { config } from "./config/index.js";

/**
 * Ponto de entrada do backend único.
 *
 * Subida: checa o banco → cria o schema → monta o app (API + WebSocket
 * no mesmo processo) → recupera builds presas em BUILDING numa execução
 * anterior → escuta.
 */

let app: FastifyInstance | undefined;

async function main(): Promise<void> {
  // Com BUILD_STORAGE=memory não há banco: pula conexão e schema.
  if (config.storage === "mysql") {
    await testConnection();

    if (config.autoMigrate) {
      await applySchema();
    }
  }

  const backend = buildApp();
  app = backend.app;

  await backend.queue.recoverInterruptedBuilds();

  await app.listen({ port: config.port, host: config.host });

  app.log.info(
    {
      api: `http://${config.host}:${config.port}`,
      websocket: `ws://${config.host}:${config.port}${config.wsPath}`,
      websocketOs: `ws://${config.host}:${config.port}${config.osWsPath}`,
      storage: config.storage,
      // a senha nunca aparece no log
      database:
        config.storage === "memory"
          ? "em memoria (BUILD_STORAGE=memory)"
          : config.databaseUrl.replace(/:\/\/[^@]*@/, "://***@"),
    },
    "FENECAN backend no ar",
  );
}

/** Encerramento limpo: para de aceitar builds e fecha MySQL e WebSocket. */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} recebido, encerrando o servidor...`);

  try {
    await app?.close();
  } finally {
    process.exit(0);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  await main();
} catch (error) {
  console.error("falha ao iniciar o FENECAN backend:", error);
  process.exit(1);
}
