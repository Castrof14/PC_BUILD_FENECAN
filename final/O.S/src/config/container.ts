/**
 * PONTO UNICO DE MONTAGEM do backend da O.S.
 *
 * E o unico arquivo que conhece as implementacoes concretas. Para conectar:
 *
 *  - Banco oficial: crie `DatabaseOrderRepository` (implementando
 *    OrderRepository), adicione 'database' em STORAGE_KINDS e trate o caso em
 *    `createRepository`.
 *  - API oficial: ja ligada com ORDER_PROVIDER=fenecan (FenecanOrderProvider).
 *    Para outra origem, crie um ExternalOrderProvider (e, se o formato do JSON for
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
import { FenecanBuildMapper } from '../infrastructure/integrations/external-api/fenecan/fenecan-build-mapper.js';
import { FenecanOrderProvider } from '../infrastructure/integrations/external-api/fenecan/fenecan-order-provider.js';
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
    case 'fenecan':
      return new FenecanOrderProvider({
        url: settings.fenecanWsUrl,
        onConnectionChange: (connected) =>
          console.log(`[fenecan] ${connected ? 'conectado' : 'desconectado, tentando de novo...'} (${settings.fenecanWsUrl})`),
        onOutcome: (outcome) => {
          if (outcome.status === 'rejected') {
            console.error(`[fenecan] build recusada: ${outcome.message}`, outcome.issues);
          }
        },
        onError: (error) => console.error('[fenecan] falha ao receber build:', error),
        onIdCollision: (id) =>
          console.error(
            `[fenecan] ATENCAO: chegou outra build com o id ${id}, que ja existe na O.S. ` +
              'O fenecan-backend provavelmente reiniciou sem banco (BUILD_STORAGE=memory) e recomecou a numeracao. ' +
              'Reinicie tambem a O.S. (ou use BUILD_STORAGE=mysql) para nao perder builds.',
          ),
      });
  }
}

/** Cada origem entrega o JSON no proprio formato. */
function createMapper(settings: OsSettings): ExternalOrderMapper {
  return settings.provider === 'fenecan' ? new FenecanBuildMapper() : new OsOrderMapper();
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
    mapper: overrides.mapper ?? createMapper(settings),
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
