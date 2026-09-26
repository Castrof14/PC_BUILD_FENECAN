import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createConnection } from "mysql2/promise";
import type { FastifyInstance } from "fastify";
import "dotenv/config";
import type { TestUnityClient } from "./unity.client.js";

/**
 * Verificação de ponta a ponta do backend integrado.
 *
 * Sobe o servidor de verdade (mesmo HTTP + WebSocket do processo de
 * produção), conecta no MySQL de verdade e usa um cliente WebSocket
 * no lugar da Unity. Não há mock no meio do caminho — o que passa aqui
 * é o que o app mobile e a Unity vão encontrar.
 *
 * Os testes rodam contra o banco `*_test` (derivado do DATABASE_URL do
 * .env), então nenhum dado de desenvolvimento é apagado.
 *
 *   npm test
 */

const TEST_DATABASE_SUFFIX = "_test";
const DEFAULT_URL = "mysql://root:root@127.0.0.1:3306/montagens_db";

/** Troca o nome do banco na URL (mantém usuário e senha). */
function withDatabase(url: string, name: string): string {
  const schemeEnd = url.indexOf("://") + 3;
  const slash = url.indexOf("/", schemeEnd);

  return slash === -1 ? `${url}/${name}` : `${url.slice(0, slash)}/${name}`;
}

const baseUrl = process.env.DATABASE_URL ?? DEFAULT_URL;
const baseDatabase = baseUrl.slice(baseUrl.lastIndexOf("/") + 1) || "montagens_db";

/**
 * Banco exclusivo desta execução.
 *
 * O nome tem o pid e o horário porque dois `npm test` ao mesmo tempo (ou uma
 * pessoa rodando enquanto outra pessoa roda) não podem compartilhar a mesma
 * tabela: o `TRUNCATE` de um apagaria as builds do outro no meio de um
 * teste. O banco é descartado no fim, em `after`.
 */
const testDatabase =
  process.env.TEST_DATABASE ??
  `${baseDatabase}${TEST_DATABASE_SUFFIX}_${process.pid}_${Date.now().toString(36)}`;

const testDatabaseUrl = withDatabase(baseUrl, testDatabase);

// Antes de qualquer import do código do servidor: o .env é lido, o banco
// de teste é definido e o log do Fastify é calado (LOG_LEVEL=error
// no ambiente mostra os erros do servidor durante a verificação).
process.env.DATABASE_URL = testDatabaseUrl;
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

const { buildApp } = await import("../src/app.js");
const { applySchema } = await import("../src/database/database.js");
const { connectUnity } = await import("./unity.client.js");

let app: FastifyInstance | null = null;
let api: string;
let unityUrl: string;
let unity: TestUnityClient | null = null;

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${api}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

async function postBuild(
  overrides: Partial<Record<string, unknown>> = {},
  expectedStatus = 201,
): Promise<Record<string, unknown>> {
  const response = await request("/build", {
    method: "POST",
    body: JSON.stringify({
      cpu: "ryzen-5-5600",
      gpu: "rtx-4060",
      ram: "16gb",
      storage: "nvme-1tb",
      motherboard: "b550",
      psu: "650w",
      case: "mid-tower",
      ...overrides,
    }),
  });

  assert.equal(response.status, expectedStatus, `POST /build devolveu ${response.status}`);

  return (await response.json()) as Record<string, unknown>;
}

async function getBuild(buildId: string): Promise<Record<string, unknown>> {
  const response = await request(`/build/${buildId}`);
  assert.equal(response.status, 200);

  const body = (await response.json()) as { build: Record<string, unknown> };

  return body.build;
}

async function getQueue(): Promise<{
  unity: { connected: boolean; ready: boolean };
  building: Record<string, unknown> | null;
  waiting: Record<string, unknown>[];
}> {
  const response = await request("/queue");
  assert.equal(response.status, 200);

  return (await response.json()) as never;
}

/** Espera a fila chegar no estado esperado (evita `sleep` fixo). */
async function waitForStatus(
  buildId: string,
  status: string,
  timeoutMs = 4000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  let last: Record<string, unknown> = {};

  while (Date.now() < deadline) {
    last = await getBuild(buildId);

    if (last.status === status) {
      return last;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  assert.equal(last.status, status, `build ${buildId} ficou em ${last.status}, esperado ${status}`);

  return last;
}

before(async () => {
  // O banco de teste é recriado do zero a cada execução: assim a verificação
  // sempre roda contra o schema atual e nunca toca no banco de
  // desenvolvimento. O nome sempre termina em `_test`.
  const admin = await createConnection(withDatabase(baseUrl, "mysql"));
  await admin.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
  await admin.query(
    `CREATE DATABASE \`${testDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await admin.end();

  await applySchema();

  const backend = buildApp();
  app = backend.app;

  await app.listen({ port: 0, host: "127.0.0.1" });

  const address = app.server.address();
  assert.ok(address && typeof address === "object", "servidor não subiu");

  const port = address.port;
  api = `http://127.0.0.1:${port}`;
  unityUrl = `ws://127.0.0.1:${port}/ws`;
});

after(async () => {
  // app.close() encerra o WebSocket e o pool de conexões (hooks preClose
  // e onClose). Fechar antes o cliente testaria outra ordem.
  await app?.close();
  await unity?.close();

  // O banco é exclusivo desta execução, então pode ir embora.
  if (!process.env.TEST_DATABASE) {
    const admin = await createConnection(withDatabase(baseUrl, "mysql"));

    try {
      await admin.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
    } finally {
      await admin.end();
    }
  }
});

beforeEach(async () => {
  await unity?.close();
  unity = null;

  // TRUNCATE zera também o AUTO_INCREMENT, então cada teste começa em BUILD-001.
  const connection = await createConnection(testDatabaseUrl);
  await connection.query("TRUNCATE TABLE builds");
  await connection.end();
});

describe("API HTTP", () => {
  it("responde o health check", async () => {
    const response = await request("/health");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("cria a build com status WAITING", async () => {
    const body = await postBuild();

    assert.deepEqual(body, {
      success: true,
      buildId: "BUILD-001",
      status: "WAITING",
      message: "Build recebida com sucesso",
    });
  });

  it("devolve a build criada com os IDs dos componentes intactos", async () => {
    await postBuild();

    const build = await getBuild("BUILD-001");

    assert.equal(build.cpu, "ryzen-5-5600");
    assert.equal(build.gpu, "rtx-4060");
    assert.equal(build.ram, "16gb");
    assert.equal(build.storage, "nvme-1tb");
    assert.equal(build.motherboard, "b550");
    assert.equal(build.psu, "650w");
    assert.equal(build.case, "mid-tower");
    assert.equal(build.status, "WAITING");
    assert.match(String(build.createdAt), /^\d{4}-\d{2}-\d{2}T/);
  });

  it("devolve id e buildId com o mesmo valor", async () => {
    await postBuild();

    const build = await getBuild("BUILD-001");

    // `id` (exemplo de contrato do FENECAN e payload da Unity) e `buildId`
    // (contrato já publicado da API) são o mesmo identificador.
    assert.equal(build.id, "BUILD-001");
    assert.equal(build.id, build.buildId);
  });

  it("preserva a grafia exata dos componentes", async () => {
    await postBuild({ cpu: "Ryzen-5-5600", ram: "16GB", psu: "650W" });

    const build = await getBuild("BUILD-001");

    assert.equal(build.cpu, "Ryzen-5-5600");
    assert.equal(build.ram, "16GB");
    assert.equal(build.psu, "650W");
  });

  it("gera ids sequenciais e únicos", async () => {
    const first = await postBuild();
    const second = await postBuild({ gpu: "rtx-4070" });

    assert.equal(first.buildId, "BUILD-001");
    assert.equal(second.buildId, "BUILD-002");
  });

  it("mantém as datas coerentes (created <= updated, mesmo fuso)", async () => {
    await postBuild();

    const created = await getBuild("BUILD-001");
    const createdAt = Date.parse(String(created.createdAt));
    const updatedAt = Date.parse(String(created.updatedAt));

    assert.ok(createdAt > 0, "createdAt precisa ser uma data ISO válida");
    assert.ok(
      updatedAt >= createdAt,
      `updatedAt (${created.updatedAt}) não pode ser anterior a createdAt (${created.createdAt})`,
    );

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitForType("BUILD_START");
    unity.confirmCompleted("BUILD-001");

    const finished = await waitForStatus("BUILD-001", "COMPLETED");
    assert.ok(
      Date.parse(String(finished.updatedAt)) >= Date.parse(String(finished.createdAt)),
      "updatedAt regrediu depois da mudança de status",
    );
    assert.ok(Date.parse(String(finished.finishedAt)) >= Date.parse(String(finished.createdAt)));
  });

  it("devolve 400 com detalhes quando faltam campos", async () => {
    const response = await request("/build", {
      method: "POST",
      body: JSON.stringify({ cpu: 123, gpu: null }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      success: boolean;
      error: string;
      details: { field: string }[];
    };

    assert.equal(body.success, false);
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.ok(body.details.length > 0);

    const fields = body.details.map((detail) => detail.field);
    assert.ok(fields.includes("cpu"));
    assert.ok(fields.includes("gpu"));
  });

  it("devolve 404 para build inexistente", async () => {
    const response = await request("/build/BUILD-999");

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      success: false,
      error: "BUILD_NOT_FOUND",
      message: "Build não encontrada",
    });
  });

  it("devolve 404 padronizado para rota inexistente", async () => {
    const response = await request("/rota-que-nao-existe");

    assert.equal(response.status, 404);

    const body = (await response.json()) as { error: string };
    assert.equal(body.error, "ROUTE_NOT_FOUND");
  });
});

describe("fila sem Unity conectada", () => {
  it("mantém as builds em WAITING e na ordem de chegada", async () => {
    await postBuild();
    await postBuild({ gpu: "rtx-4070" });
    await postBuild({ gpu: "rtx-4080" });

    const queue = await getQueue();

    assert.equal(queue.unity.connected, false);
    assert.equal(queue.unity.ready, false);
    assert.equal(queue.building, null);
    assert.deepEqual(
      queue.waiting.map((build) => build.buildId),
      ["BUILD-001", "BUILD-002", "BUILD-003"],
    );
  });

  it("informa a posição de cada build", async () => {
    await postBuild();
    await postBuild();
    await postBuild();

    const second = await (
      await request("/build/BUILD-002/position")
    ).json();
    const first = await (await request("/build/BUILD-001/position")).json();

    assert.equal(first.position, 1);
    assert.equal(second.position, 2);
  });

  it("devolve 404 na posição de build inexistente", async () => {
    const response = await request("/build/BUILD-999/position");

    assert.equal(response.status, 404);
  });
});

describe("fluxo completo com a Unity", () => {
  it("entrega a primeira build quando a Unity conecta", async () => {
    await postBuild();
    await postBuild();

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });

    const message = await unity.waitForType("BUILD_START");
    assert.equal(message.buildId, "BUILD-001");

    const build = message.build as Record<string, string>;
    assert.equal(build.id, "BUILD-001");
    assert.equal(build.cpu, "ryzen-5-5600");
    assert.equal(build.gpu, "rtx-4060");
    assert.equal(build.ram, "16gb");
    assert.equal(build.storage, "nvme-1tb");
    assert.equal(build.motherboard, "b550");
    assert.equal(build.psu, "650w");
    assert.equal(build.case, "mid-tower");

    // A segunda build continua esperando: uma montagem por vez.
    assert.equal((await getBuild("BUILD-002")).status, "WAITING");
    assert.equal((await getBuild("BUILD-001")).status, "BUILDING");
  });

  it("despacha assim que a build chega, com a Unity já conectada", async () => {
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });

    await postBuild();
    const message = await unity.waitForType("BUILD_START");

    assert.equal(message.buildId, "BUILD-001");
  });

  it("percorre BUILD_STARTED -> BUILD_COMPLETED e puxa a próxima", async () => {
    await postBuild();
    await postBuild({ gpu: "rtx-4070" });

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-001");

    // A Unity confirma o início; o status já é BUILDING, então não muda.
    unity.confirmStarted("BUILD-001");
    await waitForStatus("BUILD-001", "BUILDING");
    assert.equal((await getBuild("BUILD-002")).status, "WAITING");

    // A Unity termina: a próxima build entra sozinha.
    unity.confirmCompleted("BUILD-001");

    const completed = await waitForStatus("BUILD-001", "COMPLETED");
    assert.ok(completed.finishedAt, "COMPLETED deve registrar finishedAt");

    const next = await unity.waitFor(
      (message) => message.type === "BUILD_START" && message.buildId === "BUILD-002",
    );
    assert.equal(next.buildId, "BUILD-002");

    await waitForStatus("BUILD-002", "BUILDING");
    assert.equal((await getBuild("BUILD-001")).status, "COMPLETED");
  });

  it("move WAITING -> BUILDING quando a Unity confirma o início", async () => {
    await postBuild();

    // Sem despachar: só enviamos o BUILD_STARTED na mão, como a Unity
    // faria se tivesse recebido a build antes do backend reiniciar.
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01", announceReady: false });
    unity.confirmStarted("BUILD-001");

    const build = await waitForStatus("BUILD-001", "BUILDING");
    assert.ok(build.startedAt, "BUILDING deve registrar startedAt");
  });

  it("marca ERROR e libera a fila quando a Unity falha", async () => {
    await postBuild();
    await postBuild({ gpu: "rtx-4070" });

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-001");

    unity.confirmError("BUILD-001", "componente faltando");

    await waitForStatus("BUILD-001", "ERROR");
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-002");
    await waitForStatus("BUILD-002", "BUILDING");
  });

  it("ignora eventos de builds que não existem", async () => {
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitForType("connected");

    unity.confirmCompleted("BUILD-999");

    // O servidor continua respondendo depois do evento inválido.
    const response = await request("/health");
    assert.equal(response.status, 200);
  });

  it("ignora JSON inválido sem derrubar a conexão", async () => {
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitForType("connected");

    unity.sendRaw("{ isso não é json");

    const error = await unity.waitForType("error");
    assert.equal(error.message, "Messages must be valid JSON.");

    // A conexão continua viva: um novo build chega normalmente.
    await postBuild();
    const started = await unity.waitForType("BUILD_START");
    assert.equal(started.buildId, "BUILD-001");
  });
});

describe("concorrência", () => {
  it("mantém apenas uma build BUILDING", async () => {
    await postBuild();
    await postBuild({ gpu: "rtx-4070" });
    await postBuild({ gpu: "rtx-4080" });

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-001");

    unity.confirmCompleted("BUILD-001");
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-002");
    unity.confirmCompleted("BUILD-002");
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-003");

    const queue = await getQueue();

    assert.equal(queue.building?.buildId, "BUILD-003");
    assert.equal(queue.waiting.length, 0);
    assert.equal(unity.startedBuilds().length, 3, "cada build é entregue uma única vez");
  });

  it("ignora a segunda finalização da mesma build", async () => {
    await postBuild();
    await postBuild({ gpu: "rtx-4070" });

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-001");

    unity.confirmCompleted("BUILD-001");
    unity.confirmCompleted("BUILD-001");

    await waitForStatus("BUILD-001", "COMPLETED");
    await waitForStatus("BUILD-002", "BUILDING");

    // O segundo BUILD_COMPLETED não pode roubar a build da frente.
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal((await getBuild("BUILD-002")).status, "BUILDING");
    assert.equal(unity.startedBuilds().length, 2);
  });

  it("não despacha duas vezes quando várias builds chegam juntas", async () => {
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });

    await Promise.all([
      postBuild(),
      postBuild({ gpu: "rtx-4070" }),
      postBuild({ gpu: "rtx-4080" }),
      postBuild({ gpu: "rtx-4090" }),
    ]);

    await unity.waitForType("BUILD_START");
    await new Promise((resolve) => setTimeout(resolve, 300));

    const queue = await getQueue();

    // Uma build por vez, sem depender de qual id chegou primeiro:
    // as quatro requisições são concorrentes e o banco decide a ordem.
    assert.equal(unity.startedBuilds().length, 1, "apenas uma build pode ser enviada por vez");
    assert.ok(queue.building, "a build enviada precisa estar em montagem");
    assert.equal(queue.building.buildId, unity.startedBuilds()[0]?.id);
    assert.equal(queue.waiting.length, 3);
  });
});

describe("queda e reconexão da Unity", () => {
  it("devolve a build para a fila quando a Unity cai no meio", async () => {
    await postBuild();
    await postBuild({ gpu: "rtx-4070" });

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitFor((message) => message.type === "BUILD_START" && message.buildId === "BUILD-001");
    await waitForStatus("BUILD-001", "BUILDING");

    await unity.close();
    unity = null;

    // Sem Unity, BUILD-001 não pode ficar travada em BUILDING.
    await waitForStatus("BUILD-001", "WAITING");

    const queue = await getQueue();
    assert.equal(queue.unity.connected, false);
    assert.deepEqual(
      queue.waiting.map((build) => build.buildId),
      ["BUILD-001", "BUILD-002"],
    );
  });

  it("reenvia a build quando a Unity volta", async () => {
    await postBuild();

    const first = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await first.waitForType("BUILD_START");
    await first.close();

    await waitForStatus("BUILD-001", "WAITING");

    unity = await connectUnity({ url: unityUrl, deviceId: "unity-02" });

    const resent = await unity.waitForType("BUILD_START");
    assert.equal(resent.buildId, "BUILD-001");
    await waitForStatus("BUILD-001", "BUILDING");
  });

  it("considera a Unity livre mesmo sem declarar status", async () => {
    // A Unity que implementa só o contrato mínimo (BUILD_STARTED /
    // COMPLETED / ERROR) nunca manda `unity.status`. Ela precisa receber
    // a build assim mesmo, senão a fila nunca andaria.
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01", announceReady: false });

    await postBuild();

    const message = await unity.waitForType("BUILD_START");
    assert.equal(message.buildId, "BUILD-001");
    await waitForStatus("BUILD-001", "BUILDING");
  });

  it("para a fila quando a Unity declara 'busy'", async () => {
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitForType("connected");

    unity.send({ type: "unity.status", status: "busy" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await postBuild();
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(unity.startedBuilds().length, 0);
    assert.equal((await getBuild("BUILD-001")).status, "WAITING");
  });

  it("retoma a fila quando a Unity volta de 'busy' para 'ready'", async () => {
    unity = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    await unity.waitForType("connected");

    unity.send({ type: "unity.status", status: "busy" });
    await postBuild();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(unity.startedBuilds().length, 0);

    unity.send({ type: "unity.status", status: "ready" });

    const message = await unity.waitForType("BUILD_START");
    assert.equal(message.buildId, "BUILD-001");
    await waitForStatus("BUILD-001", "BUILDING");
  });

  it("repassa a build para a outra Unity quando a que montava cai", async () => {
    const building = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    const idle = await connectUnity({ url: unityUrl, deviceId: "unity-02" });

    // Só a primeira (a primeira conectada) recebe a build.
    await postBuild();
    await building.waitForType("BUILD_START");
    await waitForStatus("BUILD-001", "BUILDING");

    // A Unity que estava só conectada cai: a montagem NÃO é devolvida para
    // a fila, senão a mesma build seria reenviada e montada duas vezes.
    await idle.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal((await getBuild("BUILD-001")).status, "BUILDING");
    assert.equal(building.startedBuilds().length, 1, "a build não pode ser reenviada à que já a tem");

    // Uma terceira Unity conecta enquanto a primeira ainda está montando:
    // ela não recebe nada (a fila só tem uma build em andamento).
    const standby = await connectUnity({ url: unityUrl, deviceId: "unity-03" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(standby.startedBuilds().length, 0);

    // Agora a Unity que estava montando cai: a build volta para a fila e
    // a que estiver pronta a reassume sozinha.
    await building.close();

    unity = standby;
    const resumed = await standby.waitForType("BUILD_START");
    assert.equal(resumed.buildId, "BUILD-001");
    await waitForStatus("BUILD-001", "BUILDING");
  });

  it("só uma das duas Uities conectadas recebe a build", async () => {
    const first = await connectUnity({ url: unityUrl, deviceId: "unity-01" });
    const second = await connectUnity({ url: unityUrl, deviceId: "unity-02" });
    unity = first;

    await postBuild();

    await first.waitForType("BUILD_START");
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(first.startedBuilds().length, 1);
    assert.equal(second.startedBuilds().length, 0, "a segunda Unity não deve receber a mesma build");

    await second.close();
  });
});
