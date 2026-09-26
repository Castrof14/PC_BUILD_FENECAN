import { connectUnity } from "./unity.client.js";

/**
 * Simulador manual da Unity (`npm run unity:sim`).
 *
 * Versão do simulador que já existia no módulo WebSocket, agora com o
 * comportamento completo: ao receber `BUILD_START` ele confirma o início
 * (`BUILD_STARTED`) e, depois de SIMULATED_BUILD_MS, o término
 * (`BUILD_COMPLETED`) — o que dá para ver a fila inteira funcionando sem
 * a Unity instalada.
 *
 *   BACKEND_URL=ws://localhost:3000/ws npm run unity:sim
 *   SIMULATED_BUILD_MS=1500 npm run unity:sim     # devagar, para acompanhar
 */

const buildDurationMs = Number(process.env.SIMULATED_BUILD_MS ?? 1200);

async function main(): Promise<void> {
  const client = await connectUnity({ deviceId: "unity-simulator" });

  console.log(`Unity simulada conectada em ${process.env.BACKEND_URL ?? "ws://localhost:3000/ws"}`);

  // `next()` entrega cada mensagem uma vez só, então o laço não reprocessa
  // a mesma build quando uma nova chega.
  void (async () => {
    for (;;) {
      const message = await client.next((candidate) => candidate.type === "BUILD_START");

      const buildId = String(message.buildId);
      console.log(`\n[Unity] recebeu ${buildId}:`, JSON.stringify(message.build));

      client.confirmStarted(buildId);
      console.log(`[Unity] ${buildId} → BUILD_STARTED (montando por ${buildDurationMs}ms)`);

      setTimeout(() => {
        client.confirmCompleted(buildId);
        console.log(`[Unity] ${buildId} → BUILD_COMPLETED`);
      }, buildDurationMs);
    }
  })();

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

process.on("SIGINT", () => {
  console.log("\nUnity simulada desconectada.");
  process.exit(0);
});

main().catch((error: unknown) => {
  console.error("Unity simulada falhou:", error);
  process.exit(1);
});
