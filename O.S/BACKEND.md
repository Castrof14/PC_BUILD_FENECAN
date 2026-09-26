# Backend da O.S. (Ordem de Serviço)

Núcleo que recebe, valida e controla as Ordens de Serviço de montagem de PCs.

Ele **não** é a API oficial, **não** é o banco de dados e **não** tem interface.
Funciona sozinho hoje (armazenamento em memória) e está pronto para receber a
API oficial e o banco de dados sem reescrever as regras de negócio.

```text
SITE → API OFICIAL → [provedor] → BACKEND DA O.S. → [repositório] → BANCO DE DADOS
                      (a fazer)                      (hoje: memória)
```

---

## Sumário

1. [Como rodar](#como-rodar)
2. [Fluxo de status](#fluxo-de-status)
3. [Formato de uma O.S.](#formato-de-uma-os)
4. [Arquitetura](#arquitetura)
5. [Usando o OrderService](#usando-o-orderservice)
6. [Erros](#erros)
7. [Eventos](#eventos)
8. [Configuração (.env)](#configuração-env)
9. [Guia: conectar o banco de dados oficial](#guia-conectar-o-banco-de-dados-oficial)
10. [Guia: conectar a API oficial](#guia-conectar-a-api-oficial)
11. [Alterações comuns](#alterações-comuns)
12. [Limitações conhecidas](#limitações-conhecidas)

---

## Como rodar

Requisito: Node.js 20 ou superior.

```bash
cd O.S
npm install
npm test            # roda todos os testes
npm run os:start    # inicia o backend da O.S.
```

Para ver pedidos de exemplo chegando (apenas desenvolvimento), use no `.env`:

```env
ORDER_PROVIDER=mock
MOCK_ORDER_INTERVAL_MS=3000
```

Saída esperada:

```text
  BACKEND O.S. INICIADO
  Armazenamento   memory
  Origem pedidos  mock
  Mock            1 pedido a cada 3000 ms
  Ctrl+C encerra.

10:00:03  O.S. PED-001 criada (PENDING)
10:00:06  O.S. PED-002 criada (PENDING)
```

> `npm test` e `npm run os:start` compilam com `tsc` e rodam com `node`. Eles
> não dependem de `tsx`/`esbuild`, que não funcionam em algumas versões do
> macOS.

---

## Fluxo de status

```text
PENDING ──► ACCEPTED ──► BUILDING ──► COMPLETED
   │
   └──────► CANCELLED
```

| De | Pode ir para |
| --- | --- |
| `PENDING` | `ACCEPTED`, `CANCELLED` |
| `ACCEPTED` | `BUILDING` |
| `BUILDING` | `COMPLETED` |
| `COMPLETED` | — (final) |
| `CANCELLED` | — (final) |

Qualquer outra transição é recusada com `INVALID_STATUS_TRANSITION` e nada é
salvo. A tabela fica em `src/domain/rules/status-transitions.ts`.

---

## Formato de uma O.S.

```json
{
  "id": "PED-001",
  "status": "PENDING",
  "components": {
    "cpu": "ryzen-5-5600",
    "gpu": "rtx-4060",
    "ram": "16gb",
    "storage": "nvme-1tb",
    "motherboard": "b550",
    "psu": "650w",
    "case": "mid-tower"
  },
  "createdAt": "2026-09-26T10:00:00.000Z",
  "updatedAt": "2026-09-26T10:00:00.000Z"
}
```

Regras de validação:

| Campo | Regra |
| --- | --- |
| `id` | Opcional na criação (se ausente, é gerado: `PED-001`, `PED-002`...). Letras, números, `-` e `_`, até 64 caracteres. |
| `components` | Todos os 7 componentes são obrigatórios. Componentes desconhecidos são recusados. |
| ID de componente | Minúsculas, números e hífens (ex.: `ryzen-5-5600`), até 100 caracteres. Deve ser o mesmo ID usado no site, na API, no banco e na Unity. |
| `status` | Sempre nasce `PENDING`. Um `status` vindo de fora é ignorado. |

---

## Arquitetura

```text
src/
├── domain/                      REGRAS DE NEGÓCIO (não importa nada de fora)
│   ├── types/order.ts           Order, OrderStatus, COMPONENT_KEYS
│   ├── rules/
│   │   ├── status-transitions.ts  fluxo de status
│   │   └── order-validation.ts    validação de id, componentes e status
│   ├── entities/order.ts        createOrder(), changeOrderStatus()
│   └── errors.ts                erros de domínio
│
├── application/                 CASOS DE USO (só depende do domínio e das portas)
│   ├── ports/                   INTERFACES que a infraestrutura implementa
│   │   ├── order-repository.ts      OrderRepository
│   │   ├── order-id-generator.ts    OrderIdGenerator
│   │   ├── clock.ts                 Clock
│   │   ├── order-event-publisher.ts OrderEventPublisher, OrderEvent
│   │   └── external-order-provider.ts ExternalOrderProvider, ExternalOrderMapper
│   ├── use-cases/               create, get, list, update-status
│   ├── services/
│   │   ├── order-service.ts         fachada: ponto de entrada da O.S.
│   │   └── external-order-intake.ts liga provedor externo → OrderService
│   ├── shared/keyed-lock.ts     evita atualizações simultâneas da mesma O.S.
│   └── errors.ts                erros de caso de uso
│
├── infrastructure/              IMPLEMENTAÇÕES TROCÁVEIS
│   ├── repositories/in-memory/  InMemoryOrderRepository  (temporário)
│   ├── id/                      SequentialOrderIdGenerator
│   ├── clock/                   SystemClock
│   ├── events/                  LocalOrderEventBus
│   └── integrations/external-api/
│       ├── os-order-mapper.ts       JSON externo → pedido
│       ├── noop-order-provider.ts   origem vazia (padrão)
│       └── mock/                    provedor de teste (só desenvolvimento)
│
├── config/
│   ├── os-settings.ts           lê e valida as variáveis de ambiente
│   └── container.ts             ÚNICO lugar que escolhe as implementações
│
└── os-main.ts                   inicia o backend (npm run os:start)
```

Regra de dependência: `domain` ← `application` ← `infrastructure` / `config`.
O domínio e a aplicação **nunca** importam da infraestrutura. Por isso o banco e
a API podem ser trocados sem tocar nas regras.

```text
                     ┌── InMemoryOrderRepository   (hoje)
OrderService ──► OrderRepository
                     └── DatabaseOrderRepository   (futuro)

                          ┌── NoopOrderProvider          (hoje, padrão)
ExternalOrderIntake ──► ExternalOrderProvider ── LocalMockOrderProvider  (desenvolvimento)
                          └── <provedor da API oficial>  (futuro)
```

Os arquivos antigos do sistema operador (`src/api`, `src/services`, `src/ui`,
`src/integration`, `src/types`, `web/`) não foram alterados e ainda não usam
este backend (veja [Limitações conhecidas](#limitações-conhecidas)).

---

## Usando o OrderService

Tudo começa pelo container:

```ts
import { createOsBackend } from './config/container.js';
import { readOsSettings } from './config/os-settings.js';

const backend = createOsBackend(readOsSettings());
await backend.start();                 // liga a origem de pedidos configurada

const { service } = backend;
```

| Operação | Chamada | Retorno |
| --- | --- | --- |
| Criar com ID gerado | `service.create({ components })` | `Order` |
| Criar com ID externo | `service.create({ id: 'X-1', components })` | `Order` |
| Consultar uma | `service.get('PED-001')` | `Order` |
| Listar todas | `service.list()` | `Order[]` (mais antiga primeiro) |
| Listar por status | `service.list({ status: 'PENDING' })` ou `{ status: ['PENDING', 'ACCEPTED'] }` | `Order[]` |
| Mudar status | `service.updateStatus({ id: 'PED-001', status: 'ACCEPTED' })` | `{ order, from, to }` |

As entradas são `unknown`: a camada que chamar (ex.: a API oficial) pode repassar
o JSON recebido direto, porque toda a validação acontece aqui dentro. As O.S.
devolvidas são objetos congelados (imutáveis) e podem virar JSON diretamente.

---

## Erros

Todo erro de negócio tem um `code` estável. Use o `code`, não a mensagem.

| `code` | Classe | Quando | Sugestão de HTTP para a API |
| --- | --- | --- | --- |
| `ORDER_VALIDATION_ERROR` | `OrderValidationError` | Dados inválidos. `error.issues` lista `{ field, message }` de **todos** os campos com problema. | 400 / 422 |
| `INVALID_STATUS_TRANSITION` | `InvalidStatusTransitionError` | Transição fora do fluxo. Tem `from`, `to` e `allowed`. | 409 |
| `ORDER_NOT_FOUND` | `OrderNotFoundError` | ID inexistente. | 404 |
| `ORDER_ALREADY_EXISTS` | `OrderAlreadyExistsError` | Criação com ID externo já usado. | 409 |
| `ORDER_ID_UNAVAILABLE` | `OrderIdUnavailableError` | O gerador só devolveu IDs já usados (configuração errada). | 500 |

A tabela HTTP é só uma sugestão para quem fizer a API oficial. O backend da O.S.
não fala HTTP.

Qualquer outro erro (ex.: banco fora do ar) é repassado sem alteração.

---

## Eventos

Depois que uma O.S. é salva, um evento é publicado:

```ts
backend.events.subscribe((event) => {
  if (event.type === 'order.created') {
    // event.order
  }
  if (event.type === 'order.status-changed') {
    // event.order, event.from, event.to
  }
});
```

- O evento só é publicado **depois** que a O.S. foi salva.
- Um ouvinte que falha não afeta os outros nem desfaz a operação. O erro vai para `console.error`.
- É o ponto para, no futuro, avisar a API oficial, a Unity ou a tela do operador de uma mudança de status.

---

## Configuração (.env)

| Variável | Padrão | Valores | Significado |
| --- | --- | --- | --- |
| `ORDER_STORAGE` | `memory` | `memory` | Onde as O.S. ficam. `memory` perde tudo ao reiniciar. |
| `ORDER_PROVIDER` | `none` | `none`, `mock` | De onde chegam pedidos. `mock` é **apenas para desenvolvimento**. |
| `ORDER_ID_PREFIX` | `PED` | 1–16 letras/números | Prefixo dos IDs gerados. |
| `MOCK_ORDER_INTERVAL_MS` | `0` | 0–3600000 | Com `mock`, gera um pedido a cada N ms. `0` desliga. |

Um valor inválido impede a inicialização e mostra qual variável corrigir.

---

## Guia: conectar o banco de dados oficial

Nenhuma regra de negócio precisa mudar. São 4 passos.

**1. Criar o repositório** em
`src/infrastructure/repositories/database/database-order-repository.ts`:

```ts
import type { OrderFilter, OrderRepository } from '../../../application/ports/index.js';
import type { Order } from '../../../domain/index.js';

export class DatabaseOrderRepository implements OrderRepository {
  constructor(/* cliente/conexão do banco oficial */) {}

  async save(order: Order): Promise<void> {
    // inserir, ou atualizar se já existir uma linha com o mesmo id
  }

  async findById(id: string): Promise<Order | null> {
    // buscar pelo id; converter a linha para Order; null se não existir
  }

  async findAll(filter?: OrderFilter): Promise<Order[]> {
    // filtrar por status (um ou vários) e ordenar por createdAt, depois id
  }

  async exists(id: string): Promise<boolean> {
    // true se existir uma linha com esse id
  }
}
```

Converter nomes do banco para os da O.S. (ex.: `na_fila` → `PENDING`, colunas
em português → campos de `Order`) é responsabilidade **desta classe**. O resto do
sistema só vê `Order`.

**2. Garantir o contrato** em `test/infrastructure/database-order-repository.test.ts`:

```ts
import { runOrderRepositoryContract } from '../contracts/order-repository.contract.js';

runOrderRepositoryContract('DatabaseOrderRepository', async () => {
  // devolver um repositório conectado a um banco de TESTE vazio
});
```

Se passar em `npm test`, a implementação é compatível.

**3. Registrar no container.** Em `src/config/os-settings.ts`:

```ts
export const STORAGE_KINDS = ['memory', 'database'] as const;
```

Em `src/config/container.ts`, dentro de `createRepository`:

```ts
case 'database':
  return new DatabaseOrderRepository(/* conexão */);
```

**4. Ativar** no `.env`: `ORDER_STORAGE=database`.

**Cuidados:**

- O `id` precisa de **restrição de unicidade** no banco.
- Com mais de um processo, a trava interna (`KeyedLock`) não basta. A mudança
  de status (ler, validar e salvar) precisa de transação ou de uma atualização
  condicional (só atualiza se o status ainda for o lido).
- Se o banco gerar os IDs, crie também um `OrderIdGenerator` baseado nele e
  registre no container.

---

## Guia: conectar a API oficial

O contrato da API oficial ainda **não foi definido**. Por isso nenhum endpoint
foi criado aqui. Quando existir:

**1. Criar o provedor** em `src/infrastructure/integrations/external-api/`:

```ts
import type { ExternalOrderHandler, ExternalOrderProvider } from '../../../application/ports/index.js';

export class OfficialApiOrderProvider implements ExternalOrderProvider {
  readonly name = 'official-api';

  async start(handler: ExternalOrderHandler): Promise<void> {
    // Conectar à API oficial (HTTP, WebSocket, fila, consulta periódica...).
    // Para cada pedido recebido:
    //   const outcome = await handler(payload);
    //   outcome.status === 'accepted'  → pedido virou O.S. (outcome.order)
    //   outcome.status === 'duplicate' → já existia; seguro confirmar de novo
    //   outcome.status === 'rejected'  → inválido (outcome.code, outcome.issues)
    //   handler lançou erro            → falha interna; tentar de novo depois
  }

  async stop(): Promise<void> {
    // desconectar
  }
}
```

**2. Se o JSON da API tiver outro formato**, criar um `ExternalOrderMapper`
(ex.: `official-api-order-mapper.ts`) que converta para `{ id?, components }`.
O `OsOrderMapper` atual aceita só `{ id?, components: {...} }` e recusa
qualquer outra coisa de propósito.

**3. Registrar:** adicionar `'official-api'` em `PROVIDER_KINDS`
(`os-settings.ts`), tratar o caso em `createProvider` (`container.ts`) e, se
necessário, passar o novo mapper.

**4. Ativar** no `.env`: `ORDER_PROVIDER=official-api`.

**Para avisar a API quando o status mudar**, inscreva um ouvinte em
`backend.events` (veja [Eventos](#eventos)) que envie `order.status-changed`
para ela.

**Nomes de status entre as equipes.** Hoje cada parte do projeto usa nomes
diferentes. A conversão deve ficar no mapper, no provedor ou no repositório,
nunca no domínio:

| O.S. | `backend/API` (README) | `backend/FILA` (schema) |
| --- | --- | --- |
| `PENDING` | `WAITING` | `na_fila` |
| `ACCEPTED` | — | — |
| `BUILDING` | `BUILDING` | `em_execucao` |
| `COMPLETED` | `COMPLETED` | `concluida` |
| `CANCELLED` | — | — |
| — | `ERROR` | `erro` |

A equipe precisa decidir o que fazer com `ACCEPTED`, `CANCELLED` e `ERROR`.

---

## Alterações comuns

| Quero... | Onde mexer |
| --- | --- |
| Adicionar um componente (ex.: `cooler`) | Acrescentar em `COMPONENT_KEYS` (`src/domain/types/order.ts`). A validação e o tipo se ajustam sozinhos. Atualize os exemplos dos testes. |
| Mudar o fluxo de status | `STATUS_TRANSITIONS` em `src/domain/rules/status-transitions.ts` e os testes correspondentes. |
| Adicionar um status novo | `ORDER_STATUSES` (`types/order.ts`) e `STATUS_TRANSITIONS`. |
| Mudar o padrão dos IDs | `ORDER_ID_PREFIX` no `.env` ou as opções de `SequentialOrderIdGenerator`. |
| Mudar a regra dos IDs de componente | `COMPONENT_ID_PATTERN` em `src/domain/rules/order-validation.ts`. |

---

## Limitações conhecidas

- **Memória é temporária:** com `ORDER_STORAGE=memory`, todas as O.S. somem ao reiniciar.
- **Um único processo:** a proteção contra atualizações simultâneas vale dentro de um processo só (veja os cuidados no guia do banco).
- **Contador de IDs em memória:** o contador recomeça do 1 ao reiniciar. Um ID já usado é pulado, mas com memória temporária isso só importa quando houver banco.
- **Tela do operador ainda separada:** o sistema operador antigo (`src/main.ts`, `src/services/order-service.ts`) continua consultando uma API HTTP por `GET /orders` e `PATCH /orders/:id/status`. Esses endpoints **não** fazem parte de nenhum contrato definido. Ligar a tela a este backend é uma etapa futura.
- **Regra de cancelamento diferente:** o sistema operador antigo permite cancelar a partir de `ACCEPTED` e `BUILDING`. Este backend segue a especificação: só a partir de `PENDING`.

---

## Testes

```bash
npm test
```

| Pasta | O que cobre |
| --- | --- |
| `test/domain/` | Transições, validação e entidade. |
| `test/application/` | `OrderService`, entrada de pedidos externos e trava de concorrência. |
| `test/infrastructure/` | Repositório em memória (via contrato), gerador de IDs, eventos e mapper. |
| `test/contracts/` | Bateria reutilizável que **todo** `OrderRepository` deve passar. |
| `test/config/` | Leitura do `.env` e montagem do container. |
