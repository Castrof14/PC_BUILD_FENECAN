/**
 * ============================================================================
 *  MOCK API - APENAS DESENVOLVIMENTO E TESTES. NAO E A API DO PROJETO.
 * ============================================================================
 *
 *  Esta arquivo existe so para simular o comportamento da API real enquanto ela
 *  nao fica pronta. Ele imita o contrato esperado (os mesmos endpoints, o mesmo
 *  formato de JSON e o mesmo codigo de status HTTP).
 *
 *  O sistema operador NUNCA importa este arquivo.
 *  O sistema operador fala com a API apenas pelo cliente HTTP em
 *  src/api/orders-api.ts, usando a URL de API_URL.
 *
 *  Para iniciar:
 *      npm run mock:api
 *
 *  Quando a API real estiver pronta, apague a pasta tools/ inteira e mude
 *  API_URL no .env. Nenhum codigo do sistema operador precisa ser alterado.
 * ============================================================================
 */
import { createServer, type ServerResponse } from 'node:http';

const PORT = Number(process.env['MOCK_PORT'] ?? 3000);
const AUTO_ORDER_MS = Number(process.env['MOCK_AUTO_ORDER_MS'] ?? 15000);

const LOG = (message: string): void => console.log(`[MOCK] ${message}`);

interface MockOrder {
  id: string;
  status: string;
  components: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

const VALID_STATUS = new Set(['PENDING', 'ACCEPTED', 'BUILDING', 'COMPLETED', 'CANCELLED']);

const orders = new Map<string, MockOrder>();

function seed(id: string, components: Record<string, string>): void {
  const now = new Date().toISOString();
  orders.set(id, { id, status: 'PENDING', components, createdAt: now, updatedAt: now });
  LOG(`pedido inicial ${id} criado`);
}

seed('PED-001', {
  cpu: 'ryzen-5-5600',
  gpu: 'rtx-4060',
  ram: '16gb',
  storage: 'nvme-1tb',
  motherboard: 'b550',
  psu: '650w',
  case: 'mid-tower',
});

const FAKE_SPECS: Readonly<Record<string, readonly string[]>> = {
  cpu: ['intel-i5-13400f', 'ryzen-5-5600', 'ryzen-7-7700x', 'intel-i7-14700k'],
  gpu: ['rtx-4060', 'rtx-4070', 'gtx-1660-super', 'rtx-3060'],
  ram: ['16gb', '32gb', '8gb'],
  storage: ['nvme-1tb', 'ssd-512gb', 'hdd-2tb', 'nvme-500gb'],
  motherboard: ['b550', 'b650', 'z790', 'a620'],
  psu: ['650w', '750w', '550w', '850w'],
  case: ['mid-tower', 'mini-itx', 'full-tower'],
};

let counter = 1;

function pick(key: string): string {
  const options = FAKE_SPECS[key] ?? ['?'];
  return options[Math.floor(Math.random() * options.length)] ?? '?';
}

function createFakeOrder(): MockOrder {
  counter += 1;
  const id = `PED-${String(counter).padStart(3, '0')}`;
  const now = new Date().toISOString();
  const order: MockOrder = {
    id,
    status: 'PENDING',
    components: {
      cpu: pick('cpu'),
      gpu: pick('gpu'),
      ram: pick('ram'),
      storage: pick('storage'),
      motherboard: pick('motherboard'),
      psu: pick('psu'),
      case: pick('case'),
    },
    createdAt: now,
    updatedAt: now,
  };
  orders.set(id, order);
  LOG(`pedido ficticio ${id} criado: ${order.components.cpu} + ${order.components.gpu}`);
  return order;
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  const payload = body === null ? '' : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,PATCH,OPTIONS',
  });
  response.end(payload);
}

if (AUTO_ORDER_MS > 0) {
  setInterval(createFakeOrder, AUTO_ORDER_MS).unref();
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const method = request.method ?? 'GET';

  if (method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,PATCH,OPTIONS',
    });
    response.end();
    return;
  }

  LOG(`${method} ${url.pathname}`);

  if (url.pathname === '/orders' && method === 'GET') {
    reply(response, 200, [...orders.values()]);
    return;
  }

  const statusMatch = /^\/orders\/([^/]+)\/status$/.exec(url.pathname);
  if (statusMatch !== null && (method === 'PATCH' || method === 'POST')) {
    const id = decodeURIComponent(statusMatch[1] ?? '');
    const order = orders.get(id);
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      if (order === undefined) {
        reply(response, 404, { error: 'Pedido nao encontrado' });
        return;
      }
      let status: unknown;
      try {
        status = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { status?: unknown }).status;
      } catch {
        reply(response, 400, { error: 'JSON invalido' });
        return;
      }
      if (typeof status !== 'string' || !VALID_STATUS.has(status)) {
        reply(response, 422, { error: `Status invalido: ${String(status)}` });
        return;
      }
      order.status = status;
      order.updatedAt = new Date().toISOString();
      LOG(`pedido ${id} -> ${status}`);
      reply(response, 200, order);
    });
    return;
  }

  const detailMatch = /^\/orders\/([^/]+)$/.exec(url.pathname);
  if (detailMatch !== null && method === 'GET') {
    const order = orders.get(decodeURIComponent(detailMatch[1] ?? ''));
    if (order === undefined) {
      reply(response, 404, { error: 'Pedido nao encontrado' });
      return;
    }
    reply(response, 200, order);
    return;
  }

  reply(response, 404, { error: 'Rota nao encontrada' });
}).listen(PORT, '127.0.0.1', () => {
  LOG('===========================================================');
  LOG(' MOCK API DE DESENVOLVIMENTO - nao e a API do projeto');
  LOG(` URL: http://localhost:${PORT}`);
  LOG(` Cria pedido ficticio a cada ${AUTO_ORDER_MS} ms (0 para desativar)`);
  LOG(' Contrato: GET /orders | GET /orders/:id | PATCH /orders/:id/status');
  LOG('===========================================================');
});
