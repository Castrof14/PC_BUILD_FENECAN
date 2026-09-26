import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ApplicationError, type OrderService } from '../../application/index.js';
import { DomainError, OrderValidationError } from '../../domain/index.js';

/**
 * API local da O.S., consumida pela tela do operador (O.S/web, aberta no Tauri).
 *
 * Usa o mesmo contrato que o sistema operador ja consumia (ver tools/README.md):
 *
 *   GET   /health
 *   GET   /orders               lista de O.S. (mais antiga primeiro)
 *   GET   /orders/:id           uma O.S.
 *   PATCH /orders/:id/status    { "status": "ACCEPTED" }
 *
 * Toda regra continua no OrderService: aqui so ha traducao HTTP <-> servico.
 */

const HTTP_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  ORDER_VALIDATION_ERROR: 422,
  INVALID_STATUS_TRANSITION: 409,
  ORDER_NOT_FOUND: 404,
  ORDER_ALREADY_EXISTS: 409,
  ORDER_ID_UNAVAILABLE: 500,
};

const CORS_HEADERS = {
  // A tela roda no Tauri (tauri://localhost) ou no Vite (localhost:5173).
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,PATCH,POST,OPTIONS',
};

function reply(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    ...CORS_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.length;
    if (size > 64 * 1024) {
      throw new SyntaxError('Corpo da requisicao muito grande.');
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw === '' ? {} : (JSON.parse(raw) as unknown);
}

export interface OsHttpServerOptions {
  port: number;
  service: OrderService;
}

export class OsHttpServer {
  private server: Server | null = null;

  constructor(private readonly options: OsHttpServerOptions) {}

  async start(): Promise<string> {
    const server = createServer((request, response) => void this.handle(request, response));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    return `http://127.0.0.1:${this.options.port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server !== null) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? 'GET';
    const { service } = this.options;

    try {
      if (method === 'OPTIONS') {
        response.writeHead(204, CORS_HEADERS);
        response.end();
        return;
      }

      if (pathname === '/health' && method === 'GET') {
        reply(response, 200, { status: 'ok' });
        return;
      }

      if (pathname === '/orders' && method === 'GET') {
        reply(response, 200, await service.list());
        return;
      }

      const statusMatch = /^\/orders\/([^/]+)\/status$/.exec(pathname);
      if (statusMatch !== null && (method === 'PATCH' || method === 'POST')) {
        const body = (await readJson(request)) as { status?: unknown } | null;
        const change = await service.updateStatus({
          id: decodeURIComponent(statusMatch[1] ?? ''),
          status: body?.status,
        });
        reply(response, 200, change.order);
        return;
      }

      const detailMatch = /^\/orders\/([^/]+)$/.exec(pathname);
      if (detailMatch !== null && method === 'GET') {
        reply(response, 200, await service.get(decodeURIComponent(detailMatch[1] ?? '')));
        return;
      }

      reply(response, 404, { error: 'ROUTE_NOT_FOUND', message: `Rota nao encontrada: ${method} ${pathname}` });
    } catch (error) {
      if (error instanceof DomainError || error instanceof ApplicationError) {
        reply(response, HTTP_STATUS_BY_CODE[error.code] ?? 400, {
          error: error.code,
          message: error.message,
          ...(error instanceof OrderValidationError ? { issues: error.issues } : {}),
        });
        return;
      }
      if (error instanceof SyntaxError) {
        reply(response, 400, { error: 'INVALID_JSON', message: 'JSON invalido no corpo da requisicao.' });
        return;
      }
      console.error('[os-http] erro interno:', error);
      reply(response, 500, { error: 'INTERNAL_SERVER_ERROR', message: 'Erro interno da O.S.' });
    }
  }
}
