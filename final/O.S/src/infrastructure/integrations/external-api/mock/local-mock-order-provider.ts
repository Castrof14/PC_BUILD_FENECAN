/**
 * ============================================================================
 *  PROVEDOR MOCK - APENAS DESENVOLVIMENTO E TESTES. NAO E A API OFICIAL.
 * ============================================================================
 *  Gera pedidos locais, dentro do proprio processo (sem HTTP, sem endpoints),
 *  para exercitar a O.S. enquanto a API oficial nao existe.
 *  So e usado quando ORDER_PROVIDER=mock. Pode ser apagado sem afetar o resto.
 * ============================================================================
 */
import type {
  ExternalOrderHandler,
  ExternalOrderProvider,
  ReceiveOutcome,
} from '../../../../application/ports/index.js';

const SAMPLE_BUILDS: ReadonlyArray<Record<string, string>> = [
  { cpu: 'ryzen-5-5600', gpu: 'rtx-4060', ram: '16gb', storage: 'nvme-1tb', motherboard: 'b550', psu: '650w', case: 'mid-tower' },
  { cpu: 'ryzen-7-5800x', gpu: 'rx-7700-xt', ram: '32gb', storage: 'nvme-2tb', motherboard: 'x570', psu: '750w', case: 'mid-tower' },
  { cpu: 'core-i5-12400f', gpu: 'rtx-3060', ram: '16gb', storage: 'ssd-512gb', motherboard: 'b660', psu: '550w', case: 'mini-tower' },
];

export interface LocalMockOrderProviderOptions {
  /** Gera um pedido de exemplo a cada N ms. 0 = so gera quando chamado. */
  intervalMs?: number;
  /** Recebe o resultado de cada pedido gerado automaticamente. */
  onOutcome?: (outcome: ReceiveOutcome) => void;
  /** Recebe falhas inesperadas dos pedidos gerados automaticamente. */
  onError?: (error: unknown) => void;
}

export class LocalMockOrderProvider implements ExternalOrderProvider {
  readonly name = 'mock';
  private handler: ExternalOrderHandler | null = null;
  private timer: NodeJS.Timeout | null = null;
  private sampleIndex = 0;

  constructor(private readonly options: LocalMockOrderProviderOptions = {}) {}

  async start(handler: ExternalOrderHandler): Promise<void> {
    this.handler = handler;
    const intervalMs = this.options.intervalMs ?? 0;
    if (intervalMs > 0) {
      this.timer = setInterval(() => {
        this.emitSample().then(this.options.onOutcome, this.options.onError);
      }, intervalMs);
    }
  }

  async stop(): Promise<void> {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.handler = null;
  }

  /** Entrega um payload qualquer, como se viesse da API. */
  push(payload: unknown): Promise<ReceiveOutcome> {
    if (this.handler === null) {
      return Promise.reject(new Error('LocalMockOrderProvider nao foi iniciado.'));
    }
    return this.handler(payload);
  }

  /** Entrega o proximo pedido de exemplo (sem id: a O.S. gera). */
  emitSample(): Promise<ReceiveOutcome> {
    const components = SAMPLE_BUILDS[this.sampleIndex % SAMPLE_BUILDS.length];
    this.sampleIndex += 1;
    return this.push({ components: { ...components } });
  }
}
