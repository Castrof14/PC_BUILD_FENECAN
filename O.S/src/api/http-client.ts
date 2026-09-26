export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'abort' | 'parse';

export interface ApiErrorOptions {
  kind: ApiErrorKind;
  status?: number;
  url: string;
  body?: string;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly url: string;
  readonly body: string | undefined;

  constructor(message: string, options: ApiErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = options.kind;
    this.status = options.status;
    this.url = options.url;
    this.body = options.body;
  }

  get isTimeout(): boolean {
    return this.kind === 'timeout';
  }

  get isOffline(): boolean {
    return this.kind === 'network' || this.kind === 'timeout';
  }

  get isAbort(): boolean {
    return this.kind === 'abort';
  }
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const MAX_BODY_SNIPPET = 300;

function snippet(body: string): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_BODY_SNIPPET ? `${clean.slice(0, MAX_BODY_SNIPPET)}...` : clean;
}

async function readBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export async function requestJson<T>(url: string, options: HttpRequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) {
      throw new ApiError('Requisicao cancelada.', { kind: 'abort', url, cause: error });
    }
    if (timeoutSignal.aborted) {
      throw new ApiError(`Tempo limite de ${options.timeoutMs} ms excedido.`, {
        kind: 'timeout',
        url,
        cause: error,
      });
    }
    throw new ApiError('Nao foi possivel conectar na API.', { kind: 'network', url, cause: error });
  }

  const raw = await readBody(response);

  if (!response.ok) {
    throw new ApiError(`API respondeu ${response.status} ${response.statusText}`.trim(), {
      kind: 'http',
      status: response.status,
      url,
      body: snippet(raw),
    });
  }

  if (raw.trim() === '') {
    return undefined as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new ApiError('Resposta da API nao e um JSON valido.', {
      kind: 'parse',
      status: response.status,
      url,
      body: snippet(raw),
      cause: error,
    });
  }
}
