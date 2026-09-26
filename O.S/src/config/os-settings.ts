/**
 * Configuracao do backend da O.S., lida de variaveis de ambiente.
 * Recebe `env` por parametro para ser testavel; nao carrega o `.env` sozinha.
 */

export const STORAGE_KINDS = ['memory'] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

export const PROVIDER_KINDS = ['none', 'mock'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export interface OsSettings {
  /** ORDER_STORAGE. Hoje so `memory`; `database` entra quando o repositorio existir. */
  storage: StorageKind;
  /** ORDER_PROVIDER. `none` (padrao) ou `mock` (apenas desenvolvimento). */
  provider: ProviderKind;
  /** ORDER_ID_PREFIX. Padrao `PED`. */
  idPrefix: string;
  /** MOCK_ORDER_INTERVAL_MS. 0 = mock nao gera pedidos sozinho. */
  mockIntervalMs: number;
}

export class OsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OsConfigError';
  }
}

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function oneOf<T extends string>(env: Env, key: string, options: readonly T[], fallback: T): T {
  const raw = read(env, key);
  if (raw === undefined) {
    return fallback;
  }
  const value = raw.toLowerCase();
  if (!(options as readonly string[]).includes(value)) {
    throw new OsConfigError(`${key} invalido: "${raw}". Use: ${options.join(', ')}.`);
  }
  return value as T;
}

export function readOsSettings(env: Env = process.env): OsSettings {
  const idPrefix = read(env, 'ORDER_ID_PREFIX') ?? 'PED';
  if (!/^[A-Za-z0-9]{1,16}$/.test(idPrefix)) {
    throw new OsConfigError(`ORDER_ID_PREFIX invalido: "${idPrefix}". Use de 1 a 16 letras ou numeros.`);
  }

  const rawInterval = read(env, 'MOCK_ORDER_INTERVAL_MS') ?? '0';
  const mockIntervalMs = Number(rawInterval);
  if (!Number.isInteger(mockIntervalMs) || mockIntervalMs < 0 || mockIntervalMs > 3_600_000) {
    throw new OsConfigError(`MOCK_ORDER_INTERVAL_MS invalido: "${rawInterval}". Use um inteiro entre 0 e 3600000.`);
  }

  return {
    storage: oneOf(env, 'ORDER_STORAGE', STORAGE_KINDS, 'memory'),
    provider: oneOf(env, 'ORDER_PROVIDER', PROVIDER_KINDS, 'none'),
    idPrefix,
    mockIntervalMs,
  };
}
