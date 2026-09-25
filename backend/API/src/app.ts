import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifyError, FastifyInstance } from "fastify";
import { config } from "./config/index.js";
import { InMemoryBuildRepository } from "./repository/in-memory.build.repository.js";
import { BuildService } from "./services/build.service.js";
import { buildRoutes } from "./routes/build.routes.js";
import type { ErrorResponse, HealthResponse } from "./types/build.js";

/**
 * Cria e configura a instância do Fastify.
 *
 * É aqui que as dependências são montadas (hoje: repositório em memória).
 * Quando o banco, a fila e o WebSocket existirem, basta trocar as
 * implementações injetadas aqui — as rotas não mudam.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "OPTIONS"],
  });

  // Dependências (troca de implementação única para o banco de dados).
  const repository = new InMemoryBuildRepository();
  const buildService = new BuildService(repository);

  /** GET /health — verificação de disponibilidade. */
  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));

  buildRoutes(app, buildService);

  /** Rota inexistente: resposta no mesmo formato de erro da API. */
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      success: false,
      error: "ROUTE_NOT_FOUND",
      message: `Rota não encontrada: ${request.method} ${request.url}`,
    } satisfies ErrorResponse);
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
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

    // Stack trace e detalhes internos ficam apenas no log do servidor.
    request.log.error(error);

    return reply.status(500).send({
      success: false,
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno do servidor",
    } satisfies ErrorResponse);
  });

  return app;
}
