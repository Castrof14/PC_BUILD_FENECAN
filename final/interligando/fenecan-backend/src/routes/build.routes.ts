import type { FastifyInstance } from "fastify";
import { notFound } from "../errors.js";
import {
  buildSchema,
  toNewBuild,
  toValidationDetails,
} from "../schemas/build.schema.js";
import type { BuildService } from "../services/build.service.js";
import type { QueueService } from "../services/queue.service.js";
import type {
  BuildDetailsResponse,
  BuildResponse,
  ErrorResponse,
} from "../types/build.js";

/**
 * Rotas de builds.
 *
 * Esta camada só valida o formato da requisição, delega a regra de negócio
 * ao `BuildService` e formata a resposta. A montagem fica com a fila e o
 * WebSocket: a rota só chama `queue.dispatch()` para a fila tentar
 * começar, e não espera o resultado — a resposta é a da criação
 * (`WAITING`), como manda o contrato do app mobile.
 */
export async function buildRoutes(
  app: FastifyInstance,
  service: BuildService,
  queue: QueueService,
): Promise<void> {
  /** POST /build — recebe uma nova configuração do celular. */
  app.post("/build", async (request, reply): Promise<BuildResponse | ErrorResponse> => {
    const parsed = buildSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Dados da build inválidos",
        details: toValidationDetails(parsed.error),
      } satisfies ErrorResponse);
    }

    const build = await service.createBuild(toNewBuild(parsed.data));

    // A fila tenta começar agora, mas a resposta não depende disso: se a
    // Unity estiver ocupada, a build fica em WAITING esperando.
    void queue.dispatch().catch((error: unknown) => {
      request.log.error({ err: error }, "falha ao despachar a build da fila");
    });

    return reply.status(201).send({
      success: true,
      buildId: build.buildId,
      status: build.status,
      message: "Build recebida com sucesso",
    } satisfies BuildResponse);
  });

  /** GET /build/:id — consulta uma build pelo identificador. */
  app.get<{ Params: { id: string } }>(
    "/build/:id",
    async (request, reply): Promise<BuildDetailsResponse | ErrorResponse> => {
      const build = await service.getBuild(request.params.id);

      if (!build) {
        return reply
          .status(404)
          .send(notFound().toJSON() satisfies ErrorResponse);
      }

      return reply.status(200).send({
        success: true,
        // `id` é alias de `buildId` (mesmo valor): o app mobile e a Unity
        // usam um nome ou outro, e nenhum dos dois precisa traduzir.
        build: { ...build, id: build.buildId },
      } satisfies BuildDetailsResponse);
    },
  );
}
