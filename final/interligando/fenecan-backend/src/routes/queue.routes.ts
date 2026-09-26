import type { FastifyInstance } from "fastify";
import { notFound } from "../errors.js";
import type { QueueService } from "../services/queue.service.js";
import type { UnityWebSocketHub } from "../websocket/unity.websocket.js";
import type {
  ErrorResponse,
  QueuePositionResponse,
  QueueResponse,
} from "../types/build.js";

/**
 * Rotas da fila e da Unity.
 *
 * Substituem as rotas do módulo de fila original (`/montagens`, `/fila`,
 * `/fila/proxima`) no mesmo Fastify. `/fila/proxima` sumiu de propósito:
 * no desenho integrado a fila anda sozinha, então a Unity não puxa build
 * por HTTP — ela só recebe pelo WebSocket e avisa quando termina.
 */
export async function queueRoutes(
  app: FastifyInstance,
  queue: QueueService,
  unity: UnityWebSocketHub,
): Promise<void> {
  /**
   * GET /queue — situação da fila e da Unity.
   * Serve para o app mobile mostrar "sua vez está chegando" e para
   * depurar a integração durante a montagem.
   */
  app.get("/queue", async (): Promise<QueueResponse> => {
    return queue.snapshot(unity.state());
  });

  /**
   * GET /build/:id/position — posição da build na fila.
   * 1 = próxima a ser montada; 0 = já saiu da fila.
   */
  app.get<{ Params: { id: string } }>(
    "/build/:id/position",
    async (request, reply): Promise<QueuePositionResponse | ErrorResponse> => {
      const found = await queue.describePosition(request.params.id);

      if (!found) {
        return reply.status(404).send(notFound().toJSON() satisfies ErrorResponse);
      }

      return reply.status(200).send({
        success: true,
        buildId: request.params.id,
        status: found.status,
        position: found.position,
      } satisfies QueuePositionResponse);
    },
  );
}
