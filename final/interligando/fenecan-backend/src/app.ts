import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyError, FastifyInstance } from "fastify";
import { config } from "./config/index.js";
import { isDatabaseUnavailableError } from "./database/database.js";
import { databaseUnavailable, DomainError } from "./errors.js";
import { MysqlBuildRepository } from "./repository/mysql.build.repository.js";
import { InMemoryBuildRepository } from "./repository/in-memory.build.repository.js";
import type { BuildRepository } from "./repository/build.repository.js";
import { buildRoutes } from "./routes/build.routes.js";
import { queueRoutes } from "./routes/queue.routes.js";
import { BuildService } from "./services/build.service.js";
import { QueueService } from "./services/queue.service.js";
import type { ErrorResponse, HealthResponse } from "./types/build.js";
import { UnityWebSocketHub } from "./websocket/unity.websocket.js";
import { OsWebSocketHub } from "./websocket/os.websocket.js";
import { NotifyingBuildRepository } from "./repository/notifying.build.repository.js";
import { BUILD_STATUSES } from "./types/build.js";

/** As instâncias montadas, para o boot e os testes poderem usá-las. */
export interface Backend {
  app: FastifyInstance;
  repository: BuildRepository;
  queue: QueueService;
  unity: UnityWebSocketHub;
  os: OsWebSocketHub;
}

/**
 * Escolhe o repositório de builds. `BUILD_STORAGE=memory` dispense MySQL:
 * é o caminho de desenvolvimento e demonstração (site -> API -> O.S.).
 */
function createRepository(): BuildRepository {
  return config.storage === "memory" ? new InMemoryBuildRepository() : new MysqlBuildRepository();
}

/**
 * Monta o backend único do FENECAN: API HTTP, banco, fila e WebSocket
 * da Unity no mesmo processo.
 *
 * As dependências são injetadas aqui. Este arquivo é o único lugar que
 * conhece as implementações concretas — trocar o MySQL ou o transporte
 * do WebSocket não toca em rotas nem serviços.
 */
export function buildApp(): Backend {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Canal da O.S. (sistema do operador): recebe cada build criada/alterada.
  // Ao conectar, a O.S. recebe todas as builds — em ordem de chegada.
  const os = new OsWebSocketHub({
    path: config.osWsPath,
    logger: app.log,
    snapshot: async () => {
      const lists = await Promise.all(BUILD_STATUSES.map((status) => repository.findByStatus(status)));
      return lists.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  });

  // Persistência das builds — MySQL por padrão, memória com BUILD_STORAGE=memory.
  // O invólucro avisa a O.S. de toda mudança, sem as rotas e a fila saberem.
  const repository = new NotifyingBuildRepository(createRepository(), os);
  const buildService = new BuildService(repository);

  // WebSocket da Unity — mesmo processo, mesmo HTTP, upgrade em config.wsPath.
  const unity = new UnityWebSocketHub({ path: config.wsPath, logger: app.log });

  // Um único ouvinte de upgrade roteia para a Unity ou para a O.S.
  app.server.on("upgrade", (request, socket, head) => {
    if (!unity.handleUpgrade(request, socket, head) && !os.handleUpgrade(request, socket, head)) {
      socket.destroy();
    }
  });

  // Fila: decide qual build a Unity monta, uma por vez.
  const queue = new QueueService(repository, unity, { logger: app.log });
  unity.onEvent((event) => {
    void queue.handleUnityEvent(event).catch((error: unknown) => {
      app.log.error({ err: error, event }, "falha ao tratar evento da Unity");
    });
  });

  /** GET /health — verificação de disponibilidade. */
  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));

  buildRoutes(app, buildService, queue);
  queueRoutes(app, queue, unity);

  /** Rota inexistente: resposta no mesmo formato de erro da API. */
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      success: false,
      error: "ROUTE_NOT_FOUND",
      message: `Rota não encontrada: ${request.method} ${request.url}`,
    } satisfies ErrorResponse);
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    // Erros de domínio (fila/banco) trazem status e código próprios.
    if (error instanceof DomainError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Falhas de parsing e de request do Fastify (JSON malformado -> 400,
    // Content-Type ausente/inválido -> 415, payload grande demais -> 413).
    // Todas são culpa do cliente e viram 400 no mesmo formato da API.
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      request.log.warn({ err: error }, "requisição inválida");

      return reply.status(400).send({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Dados da build inválidos",
        details: [],
      } satisfies ErrorResponse);
    }

    // Banco fora do ar não é erro interno: a API está no ar, só sem dados.
    if (isDatabaseUnavailableError(error)) {
      request.log.error({ err: error }, "banco de dados indisponível");

      return reply
        .status(503)
        .send(databaseUnavailable(error).toJSON() satisfies ErrorResponse);
    }

    // Stack trace e detalhes internos ficam apenas no log do servidor.
    request.log.error(error);

    return reply.status(500).send({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno do servidor",
    } satisfies ErrorResponse);
  });

  /**
   * Ao encerrar, fecha o WebSocket e o pool de conexões — nessa ordem.
   *
   * O WebSocket vai no `preClose` (e não no `onClose`) por um motivo
   * concreto: a conexão da Unity é um socket que passou por *upgrade*, e o
   * Node só conclui `server.close()` quando todas as conexões acabarem.
   * Como o `onClose` do Fastify roda DEPOIS do `server.close()`, encerrar
   * a Unity lá deixaria o `app.close()` esperando para sempre sempre que
   * houvesse uma Unity conectada — o servidor não encerraria. No `preClose`
   * a Unity é derrubada antes de o servidor HTTP fechar.
   */
  app.addHook("preClose", async () => {
    await unity.close();
    await os.close();
  });

  /** O repositório por último: é o que a fila usa para responder aos eventos. */
  app.addHook("onClose", async () => {
    await repository.close();
  });

  return { app, repository, queue, unity, os };
}
