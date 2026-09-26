/**
 * PONTO UNICO DE MONTAGEM do backend da O.S.
 *
 * E o unico arquivo que conhece as implementacoes concretas. Para conectar:
 *
 *  - Banco oficial: crie `DatabaseOrderRepository` (implementando
 *    OrderRepository), adicione 'database' em STORAGE_KINDS e trate o caso em
 *    `createRepository`.
 *  - API oficial: crie um ExternalOrderProvider (e, se o formato do JSON for
 *    outro, um ExternalOrderMapper), adicione em PROVIDER_KINDS e trate o caso
 *    em `createProvider`.
 *
 * Nenhuma regra de negocio muda.
 */
import {
  ExternalOrderIntake,
  OrderService,
  type Clock,
  type ExternalOrderMapper,
  type ExternalOrderProvider,
  type OrderIdGenerator,
  type OrderRepository,
} from '../application/index.js';
import { SystemClock } from '../infrastructure/clock/system-clock.js';
import { LocalOrderEventBus } from '../infrastructure/events/local-order-event-bus.js';
import { SequentialOrderIdGenerator } from '../infrastructure/id/sequential-order-id-generator.js';
import { LocalMockOrderProvider } from '../infrastructure/integrations/external-api/mock/local-mock-order-provider.js';
import { NoopOrderProvider } from '../infrastructure/integrations/external-api/noop-order-provider.js';
import { OsOrderMapper } from '../infrastructure/integrations/external-api/os-order-mapper.js';
import { InMemoryOrderRepository } from '../infrastructure/repositories/in-memory/in-memory-order-repository.js';
import type { OsSettings } from './os-settings.js';

export interface OsBackend {
  readonly settings: OsSettings;
  readonly service: OrderService;
  /** Inscreva-se aqui para reagir a mudancas (ex.: avisar API oficial, Unity, tela). */
  readonly events: LocalOrderEventBus;
  readonly provider: ExternalOrderProvider;
  readonly intake: ExternalOrderIntake;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Substituicoes opcionais, uteis em testes. */
export interface OsBackendOverrides {
  repository?: OrderRepository;
  idGenerator?: OrderIdGenerator;
  clock?: Clock;
  provider?: ExternalOrderProvider;
  mapper?: ExternalOrderMapper;
}

function createRepository(settings: OsSettings): OrderRepository {
  switch (settings.storage) {
    case 'memory':
      return new InMemoryOrderRepository();
  }
}

function createProvider(settings: OsSettings): ExternalOrderProvider {
  switch (settings.provider) {
    case 'none':
      return new NoopOrderProvider();
    case 'mock':
      return new LocalMockOrderProvider({
        intervalMs: settings.mockIntervalMs,
        onError: (error) => console.error('[os-mock] falha ao entregar pedido:', error),
      });
  }
}

export function createOsBackend(settings: OsSettings, overrides: OsBackendOverrides = {}): OsBackend {
  const events = new LocalOrderEventBus();
  const service = new OrderService({
    repository: overrides.repository ?? createRepository(settings),
    idGenerator: overrides.idGenerator ?? new SequentialOrderIdGenerator({ prefix: settings.idPrefix }),
    clock: overrides.clock ?? new SystemClock(),
    events,
  });
  const provider = overrides.provider ?? createProvider(settings);
  const intake = new ExternalOrderIntake({
    service,
    provider,
    mapper: overrides.mapper ?? new OsOrderMapper(),
  });

  return {
    settings,
    service,
    events,
    provider,
    intake,
    start: () => intake.start(),
    stop: () => intake.stop(),
  };
}
