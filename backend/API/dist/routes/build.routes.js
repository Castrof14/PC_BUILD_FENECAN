import { buildSchema, toValidationDetails } from "../schemas/build.schema.js";
/**
 * Rotas de builds.
 *
 * Esta camada só valida o formato da requisição, delega a regra de negócio
 * ao `BuildService` e formata a resposta. Não há lógica de montagem aqui —
 * isso virá da fila/WebSocket.
 */
export async function buildRoutes(app, service) {
    /** POST /build — recebe uma nova configuração do site. */
    app.post("/build", async (request, reply) => {
        const parsed = buildSchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: "VALIDATION_ERROR",
                message: "Dados da build inválidos",
                details: toValidationDetails(parsed.error),
            });
        }
        const build = service.createBuild(parsed.data);
        return reply.status(201).send({
            success: true,
            buildId: build.buildId,
            status: build.status,
            message: "Build recebida com sucesso",
        });
    });
    /** GET /build/:id — consulta uma build pelo identificador. */
    app.get("/build/:id", async (request, reply) => {
        const build = service.getBuild(request.params.id);
        if (!build) {
            return reply.status(404).send({
                success: false,
                error: "BUILD_NOT_FOUND",
                message: "Build não encontrada",
            });
        }
        return reply.status(200).send({
            success: true,
            build,
        });
    });
}
//# sourceMappingURL=build.routes.js.map