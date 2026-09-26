import type { ExternalOrderMapper, IncomingOrder } from '../../../application/ports/index.js';
import { OrderValidationError } from '../../../domain/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Tradutor para o formato de pedido definido para a O.S.:
 *
 *   { "id": "PED-001", "components": { "cpu": "...", ... } }   (id opcional)
 *
 * O contrato da API oficial AINDA NAO FOI DEFINIDO. Este tradutor nao tenta
 * adivinhar outros formatos de proposito: um payload inesperado deve falhar
 * de forma clara, nao ser aceito pela metade.
 *
 * Quando o contrato oficial existir, crie outro ExternalOrderMapper neste
 * diretorio (ex.: `official-api-order-mapper.ts`) e troque no container.
 * Campos como `status` sao ignorados: toda O.S. nova nasce PENDING.
 */
export class OsOrderMapper implements ExternalOrderMapper {
  toIncomingOrder(payload: unknown): IncomingOrder {
    if (!isRecord(payload)) {
      throw new OrderValidationError([{ field: 'payload', message: 'o pedido deve ser um objeto JSON' }]);
    }
    return { id: payload['id'], components: payload['components'] };
  }
}
