import type { Order, ValidationIssue } from '../../domain/index.js';

/** Pedido ja traduzido para o formato da O.S., ainda nao validado. */
export interface IncomingOrder {
  /** ID dado pela origem. Ausente = a O.S. gera um. */
  id?: unknown;
  components: unknown;
}

/** Resposta devolvida a origem para cada pedido entregue. */
export type ReceiveOutcome =
  | { readonly status: 'accepted'; readonly order: Order }
  /** O pedido ja existia (ex.: reenvio). Nada foi alterado. */
  | { readonly status: 'duplicate'; readonly order: Order }
  | {
      readonly status: 'rejected';
      readonly code: string;
      readonly message: string;
      readonly issues: readonly ValidationIssue[];
    };

/**
 * Recebe o payload bruto de um pedido. Resolve com o resultado; rejeita somente
 * em falhas inesperadas (ex.: armazenamento fora do ar), para que a origem
 * possa tentar de novo.
 */
export type ExternalOrderHandler = (payload: unknown) => Promise<ReceiveOutcome>;

/**
 * Porta de ENTRADA de pedidos vindos de fora da O.S.
 *
 * Nao define transporte (HTTP, WebSocket, fila, polling...): isso e decidido
 * por quem implementar o adaptador da API oficial. O adaptador so precisa
 * chamar `handler(payload)` para cada pedido recebido.
 */
export interface ExternalOrderProvider {
  readonly name: string;
  start(handler: ExternalOrderHandler): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Traduz o payload da origem para `IncomingOrder`. E o UNICO lugar que conhece
 * o formato do JSON externo. Lanca `OrderValidationError` se o formato nao for
 * reconhecido.
 */
export interface ExternalOrderMapper {
  toIncomingOrder(payload: unknown): IncomingOrder;
}
