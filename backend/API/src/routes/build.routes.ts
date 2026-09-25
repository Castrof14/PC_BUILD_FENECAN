import type { FastifyInstance } from "fastify";
import { buildSchema, toValidationDetails } from "../schemas/build.schema.js";
import type { BuildService } from "../services/build.service.js";
import type {
  BuildDetailsResponse,
  BuildResponse,
  ErrorResponse,
} from "../types/build.js";

/**
 * Rotas de builds.
 *
 * Esta camada só valida o formato da requisição, delega a regra de negócio
 * ao `BuildService` e formata a resposta. Não há lógica de montagem aqui —
 * isso virá da fila/WebSocket.
 */
export async function buildRoutes(
  app: FastifyInstance,
  service: BuildService,
): Promise<void> {
  /** POST /build — recebe uma nova configuração do site. */
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

    const build = service.createBuild(parsed.data);

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
      const build = service.getBuild(request.params.id);

      if (!build) {
        return reply.status(404).send({
          success: false,
          error: "BUILD_NOT_FOUND",
          message: "Build não encontrada",
        } satisfies ErrorResponse);
      }

      return reply.status(200).send({
        success: true,
        build,
      } satisfies BuildDetailsResponse);
    },
  );
}
