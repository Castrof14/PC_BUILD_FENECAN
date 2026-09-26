import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import * as path from 'node:path';
import { projectRoot } from '../config.js';
import { isOrderStatus, type OrderStatus } from '../types/order.js';
import type { OperatorState } from '../types/api.js';
import type { OrderService } from '../services/order-service.js';
import { OrderServiceError } from '../services/order-service.js';
import { Poller } from '../services/poller.js';
import { openOperatorWindow } from './launcher.js';

const PUBLIC_DIR = path.join(projectRoot, 'src', 'ui', 'public');
const WEB_BUILD_DIR = path.join(projectRoot, 'web-dist');

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export interface UiServerOptions {
  port: number;
  autoOpenBrowser: boolean;
  kioskMode: boolean;
  orderService: OrderService;
  poller: Poller;
  pollIntervalMs: number;
  soundEnabled: boolean;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function sendText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.length;
    if (size > 64 * 1024) {
      throw new Error('Corpo da requisicao muito grande.');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw === '') {
    return {};
  }
  return JSON.parse(raw) as unknown;
}

function serveFile(response: ServerResponse, filePath: string): boolean {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
  createReadStream(filePath).pipe(response);
  return true;
}

function resolveStatic(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes('\0') || decoded.includes('..')) {
    return null;
  }
  const relative = decoded.replace(/^\/+/, '');
  if (relative === '') {
    return null;
  }
  const target = path.resolve(WEB_BUILD_DIR, relative);
  const root = path.resolve(WEB_BUILD_DIR);
  if (target !== root && !target.startsWith(root + path.sep)) {
    return null;
  }
  return target;
}

export class OperatorUiServer {
  private server: Server | null = null;
  private address: string | null = null;

  constructor(private readonly options: UiServerOptions) {}

  get url(): string {
    return this.address ?? '';
  }

  async start(): Promise<string> {
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    const url = await new Promise<string>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port, '127.0.0.1', () => {
        server.off('error', reject);
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : this.options.port;
        resolve(`http://127.0.0.1:${port}`);
      });
    });
    this.address = url;
    if (this.options.autoOpenBrowser) {
      openOperatorWindow(url, this.options.kioskMode);
    }
    return url;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server === null) {
      return;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private state(): OperatorState {
    const { store, connection, baseUrl } = this.options.orderService;
    return {
      connection: connection.status,
      orders: store.list.map((order) => ({ ...order, isNew: store.isNew(order.id) })),
      newOrderIds: store.newOrderIds,
      lastUpdatedAt: store.updatedAt,
      pollIntervalMs: this.options.pollIntervalMs,
      serverTime: new Date().toISOString(),
      apiBaseUrl: baseUrl,
      soundEnabled: this.options.soundEnabled,
    };
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    const method = request.method ?? 'GET';

    try {
      if (pathname === '/api/state' && method === 'GET') {
        sendJson(response, 200, this.state());
        return;
      }

      if (pathname === '/api/refresh' && method === 'POST') {
        void this.options.poller.runOnce();
        sendJson(response, 202, { ok: true, message: 'Atualizacao solicitada.' });
        return;
      }

      if (pathname === '/api/clear-new' && method === 'POST') {
        this.options.orderService.store.markAllSeen();
        sendJson(response, 200, { ok: true });
        return;
      }

      const statusMatch = /^\/api\/orders\/([^/]+)\/status$/.exec(pathname);
      if (statusMatch !== null && (method === 'PATCH' || method === 'POST')) {
        await this.handleStatusChange(request, response, decodeURIComponent(statusMatch[1] ?? ''));
        return;
      }

      if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { ok: false, error: 'Rota nao encontrada.' });
        return;
      }

      if (method !== 'GET') {
        sendText(response, 405, 'Metodo nao permitido.');
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        if (serveFile(response, path.join(PUBLIC_DIR, 'index.html'))) {
          return;
        }
        sendText(response, 500, 'Interface nao encontrada. Rode: npm run build:web');
        return;
      }

      if (pathname === '/styles.css') {
        if (serveFile(response, path.join(PUBLIC_DIR, 'styles.css'))) {
          return;
        }
        sendText(response, 404, 'styles.css nao encontrado.');
        return;
      }

      if (pathname === '/app.js') {
        if (serveFile(response, path.join(WEB_BUILD_DIR, 'ui', 'public', 'app.js'))) {
          return;
        }
        sendText(response, 500, 'app.js nao encontrado. Rode: npm run build:web');
        return;
      }

      const staticPath = resolveStatic(pathname);
      if (staticPath !== null && serveFile(response, staticPath)) {
        return;
      }

      sendText(response, 404, 'Nao encontrado.');
    } catch (error) {
      if (error instanceof OrderServiceError) {
        sendJson(response, 409, { ok: false, error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { ok: false, error: 'JSON invalido no corpo da requisicao.' });
        return;
      }
      sendJson(response, 500, { ok: false, error: 'Erro interno do sistema operador.' });
    }
  }

  private async handleStatusChange(
    request: IncomingMessage,
    response: ServerResponse,
    orderId: string,
  ): Promise<void> {
    const body = (await readJsonBody(request)) as { status?: unknown };
    const status = body?.status;
    if (typeof status !== 'string' || !isOrderStatus(status)) {
      sendJson(response, 400, {
        ok: false,
        error: `Status invalido. Use um de: PENDING, ACCEPTED, BUILDING, COMPLETED, CANCELLED.`,
      });
      return;
    }
    const result = await this.options.orderService.changeStatus(orderId, status as OrderStatus);
    sendJson(response, 200, { ok: true, order: result.order });
  }
}
