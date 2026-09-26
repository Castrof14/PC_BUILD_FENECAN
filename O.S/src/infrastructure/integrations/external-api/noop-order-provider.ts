import type { ExternalOrderHandler, ExternalOrderProvider } from '../../../application/ports/index.js';

/**
 * Origem vazia: nao entrega pedidos. E o padrao enquanto a API oficial nao
 * estiver conectada, para que o sistema nunca receba dados falsos sem querer.
 */
export class NoopOrderProvider implements ExternalOrderProvider {
  readonly name = 'none';

  async start(_handler: ExternalOrderHandler): Promise<void> {
    return;
  }

  async stop(): Promise<void> {
    return;
  }
}
