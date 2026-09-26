import type { ExternalOrderMapper, IncomingOrder } from '../../../../application/ports/index.js';
import { COMPONENT_KEYS, OrderValidationError } from '../../../../domain/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Tradutor da build do fenecan-backend (`interligando/fenecan-backend`) para
 * o pedido da O.S.
 *
 *   { "buildId": "BUILD-001", "cpu": "...", "gpu": "...", ..., "status": "WAITING" }
 *     -> { "id": "BUILD-001", "components": { "cpu": "...", ... } }
 *
 * O id da O.S. e o proprio `buildId`: reenviar a mesma build (reconexao,
 * retrato inicial) cai em `duplicate` e nao cria O.S. repetida. O `status`
 * da build e ignorado: toda O.S. nova nasce PENDING.
 */
export class FenecanBuildMapper implements ExternalOrderMapper {
  toIncomingOrder(payload: unknown): IncomingOrder {
    if (!isRecord(payload)) {
      throw new OrderValidationError([{ field: 'payload', message: 'a build deve ser um objeto JSON' }]);
    }
    const components: Record<string, unknown> = {};
    for (const key of COMPONENT_KEYS) {
      components[key] = payload[key];
    }
    return { id: payload['buildId'] ?? payload['id'], components };
  }
}
