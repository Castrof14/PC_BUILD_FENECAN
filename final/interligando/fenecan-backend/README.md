# fenecan-backend

Backend único do **PC Build Simulator** — projeto FENECAN.

Um só processo Node.js cuida de tudo: recebe a configuração do celular,
valida, salva no MySQL, controla a fila e conversa com a Unity por WebSocket.

```
📱 Celular ──HTTP──▶ 🌐 API (Fastify) ──▶ 🗄️ MySQL ──▶ 🚦 Fila ──▶ 🎮 Unity ──▶ 📺 TV/Projetor
                                                ▲                          │
                                                └──────── WebSocket ───────┘
```

Os três módulos que tinham sido desenvolvidos separados (API, WebSocket e
banco/fila) foram unificados aqui. As pastas `../FILA` e `../websocket`
continuam no repositório como referência do código original; **o que roda é
só isto**.

---

## Sumário

- [Stack](#stack)
- [Instalação](#instalação)
- [Configuração (.env)](#configuração-env)
- [Banco de dados](#banco-de-dados)
- [Como iniciar](#como-iniciar)
- [Endpoints](#endpoints)
- [Formato da build](#formato-da-build)
- [Status](#status)
- [Fila](#fila)
- [Protocolo WebSocket](#protocolo-websocket)
- [Testes](#testes)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Responsabilidades](#responsabilidades)
- [Decisões de integração](#decisões-de-integração)

---

## Stack

- Node.js 20+ e TypeScript (`strict`, sem `any`)
- Fastify 5 (API HTTP)
- Zod 4 (validação)
- `ws` 8 (WebSocket da Unity, no mesmo processo do HTTP)
- mysql2 (MySQL)
- dotenv, tsx

Sem autenticação, sem Docker, sem Redis, sem microsserviços — o que o MVP
precisa.

---

## Instalação

Pré-requisitos: **Node.js 20+** e um **MySQL 8** acessível.

```bash
cd fenecan-backend
npm install
```

---

## Configuração (.env)

```bash
cp .env.example .env
```

O `.env` **não** vai para o Git (já está no `.gitignore`). O
`.env.example` é o modelo, sem credenciais.

| Variável       | Padrão                     | Descrição                                             |
| -------------- | -------------------------- | ----------------------------------------------------- |
| `PORT`         | `3000`                     | Porta do HTTP **e** do WebSocket                       |
| `HOST`         | `0.0.0.0`                  | Interface de escuta                                   |
| `LOG_LEVEL`    | `info`                     | `fatal`…`trace` ou `silent`                           |
| `CORS_ORIGIN`  | _(vazio)_                  | Domínios permitidos, separados por vírgula            |
| `WS_PATH`      | `/ws`                      | Caminho do WebSocket da Unity                         |
| `OS_WS_PATH`   | `/ws/os`                   | Caminho do WebSocket da O.S. (sistema do operador)    |
| `BUILD_STORAGE`| `mysql`                    | `mysql` (banco) ou `memory` (sem banco, dados somem ao reiniciar) |
| `DATABASE_URL` | —                          | `mysql://usuário:senha@host:porta/banco`              |
| `AUTO_MIGRATE` | `true`                     | Cria a tabela `builds` ao subir                       |

Sem `CORS_ORIGIN`, o CORS é liberado para qualquer origem (necessário no
desenvolvimento do app). Para restringir:

```env
CORS_ORIGIN=https://site.fenecan.com
```

Sem MySQL disponível, use `BUILD_STORAGE=memory`: tudo funciona igual, mas
as builds somem ao reiniciar. Para ligar o banco depois, basta criar o banco
(abaixo), preencher `DATABASE_URL` e trocar para `BUILD_STORAGE=mysql` —
nenhum código muda.

`DATABASE_URL` tem prioridade. Se não existir, o backend monta a URL a partir
das variáveis antigas do módulo de fila (`DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`) — quem já tinha `.env` continua funcionando.

---

## Banco de dados

MySQL 8 (o `FOR UPDATE SKIP LOCKED`, que garante a fila, exige 8.0+).

O **banco** precisa existir uma vez; a **tabela** é criada sozinha na
primeira subida (`AUTO_MIGRATE=true`):

```sql
CREATE DATABASE montagens_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

O schema está em [`database/schema.sql`](database/schema.sql) e é idempotente.
A tabela `builds` guarda: `id` (interno), `build_id` (`BUILD-001`), os sete
componentes, `configuracao` (JSON derivado), `status`, `created_at`,
`updated_at`, `started_at`, `finished_at`.

> A tabela antiga `montagens` (do módulo de fila, com `configuracao` em JSON e
> status em português) está vazia e pode ser descartada:
> `DROP TABLE montagens;`

Para ver o schema aplicado, sem subir o servidor:

```bash
mysql -u root -p montagens_db < database/schema.sql
```

---

## Como iniciar

```bash
npm run dev     # desenvolvimento, recarrega ao salvar
```

Sobe em `http://localhost:3000` e o WebSocket da Unity em
`ws://localhost:3000/ws`.

```bash
npm run build   # compila TypeScript em dist/
npm start       # executa dist/server.js
```

Outros scripts úteis:

```bash
npm test        # verificação de ponta a ponta (sobe servidor, MySQL e Unity fake)
npm run typecheck
npm run unity:sim   # Unity simulada, para ver a fila funcionando
```

Encerrar com `Ctrl+C` fecha o WebSocket e o pool de conexões.

---

## Endpoints

Contrato completo em [`docs/API.md`](docs/API.md).

| Método | Rota                  | Descrição                       |
| ------ | --------------------- | ------------------------------- |
| `GET`  | `/health`             | `{"status":"ok"}`               |
| `POST` | `/build`              | cria a build e coloca na fila    |
| `GET`  | `/build/:id`          | dados atuais da build           |
| `GET`  | `/build/:id/position` | posição na fila (1 = próxima)    |
| `GET`  | `/queue`              | fila e situação da Unity        |
| `WS`   | `/ws`                 | Unity (ver `docs/WEBSOCKET.md`) |
| `WS`   | `/ws/os`              | O.S.: recebe cada build criada/alterada |

```bash
curl http://localhost:3000/health
# {"status":"ok"}

curl -X POST http://localhost:3000/build \
  -H "Content-Type: application/json" \
  -d '{"cpu":"ryzen-5-5600","gpu":"rtx-4060","ram":"16gb","storage":"nvme-1tb",
       "motherboard":"b550","psu":"650w","case":"mid-tower"}'
# {"success":true,"buildId":"BUILD-001","status":"WAITING","message":"Build recebida com sucesso"}

curl http://localhost:3000/build/BUILD-001
```

Erros: `400` dados inválidos · `404` build ou rota inexistente ·
`409` conflito de operação · `500` erro interno · `503` banco indisponível.
Todos no mesmo formato (`success`, `error`, `message`, `details`).

---

## Formato da build

Sete campos, todos **strings não vazias**, com o **ID do componente**:

```json
{
  "cpu": "ryzen-5-5600",
  "gpu": "rtx-4060",
  "ram": "16gb",
  "storage": "nvme-1tb",
  "motherboard": "b550",
  "psu": "650w",
  "case": "mid-tower"
}
```

`visitante` é opcional. Os IDs chegam intactos na Unity — sem
`toLowerCase`, sem "correção". Detalhes e regras em
[`docs/COMPONENTS.md`](docs/COMPONENTS.md).

---

## Status

Vocabulário único, em todo o backend (inclusive no `ENUM` do MySQL):

```
WAITING  →  BUILDING  →  COMPLETED
   ▲            │
   └────────────┴──▶  ERROR
```

- `WAITING` — salva, esperando a vez (status inicial, sempre);
- `BUILDING` — enviada para a Unity, em montagem;
- `COMPLETED` — a Unity confirmou que terminou;
- `ERROR` — a Unity informou falha.

Não existem outras grafias no projeto. `BuildStatus` está em
[`src/types/build.ts`](src/types/build.ts) e é o único lugar onde a lista é
declarada.

---

## Fila

A ordem é FIFO por `created_at` (com `id` como desempate). **Uma build
`BUILDING` por vez**, garantido pelo banco:

1. `POST /build` salva a build como `WAITING`;
2. o backend pergunta à Unity se está livre (`ready`);
3. se estiver, reserva a próxima numa transação
   (`SELECT ... FOR UPDATE SKIP LOCKED` — vem do módulo de fila original);
4. a build vira `BUILDING` e é enviada no WebSocket;
5. a Unity confirma `BUILD_STARTED` e depois `BUILD_COMPLETED`/`BUILD_ERROR`;
6. ao terminar, a build vai para `COMPLETED`/`ERROR`, a Unity é liberada e a
   próxima da fila é enviada **automaticamente**.

```
POST /build (3x, sem Unity)     BUILD-001 WAITING / 002 WAITING / 003 WAITING
Unity conecta                   BUILD-001 BUILDING / 002 WAITING / 003 WAITING
BUILD_COMPLETED BUILD-001       BUILD-001 COMPLETED / 002 BUILDING / 003 WAITING
BUILD_COMPLETED BUILD-002       BUILD-001 COMPLETED / 002 COMPLETED / 003 BUILDING
```

Casos de borda que a fila resolve:

| Situação                              | Comportamento                                          |
| ------------------------------------- | ------------------------------------------------------ |
| Nenhuma Unity conectada               | tudo fica em `WAITING`                                 |
| Unity caiu no meio da montagem        | a build volta para `WAITING` e é reenviada ao voltar   |
| Backend reiniciado com `BUILDING`     | a build volta para `WAITING` no boot                    |
| Duas Uities conectadas                | só a ativa recebe; se cair, a outra assume              |
| Envio falhou porque a Unity caiu       | a build volta para `WAITING` (nada fica preso)         |
| `BUILD_COMPLETED` repetido            | ignorado — não pula a fila                              |

A trava é do **banco** (`FOR UPDATE`), não do processo: mesmo com requisições
simultâneas, só uma build vira `BUILDING`.

`GET /queue` mostra o estado atual — é o jeito mais rápido de conferir tudo:

```bash
curl http://localhost:3000/queue
```

---

## Protocolo WebSocket

`ws://localhost:3000/ws` — contrato completo em
[`docs/WEBSOCKET.md`](docs/WEBSOCKET.md).

| Evento              | Direção        | Efeito                                    |
| ------------------- | -------------- | ----------------------------------------- |
| `BUILD_START`       | backend → Unity| entrega a configuração da build           |
| `BUILD_STARTED`     | Unity → backend| garante o status `BUILDING`               |
| `BUILD_COMPLETED`   | Unity → backend| `COMPLETED` e libera a próxima            |
| `BUILD_ERROR`       | Unity → backend| `ERROR` e libera a próxima                |
| `unity.status`      | Unity → backend| `ready`/`busy` (opcional)                 |
| `connected`         | backend → Unity| primeiro contato (mantido do módulo antigo)|

```json
// backend → Unity
{ "type": "BUILD_START", "buildId": "BUILD-001",
  "build": { "id": "BUILD-001", "cpu": "ryzen-5-5600", "gpu": "rtx-4060",
             "ram": "16gb", "storage": "nvme-1tb",
             "motherboard": "b550", "psu": "650w", "case": "mid-tower" } }

// Unity → backend
{ "type": "BUILD_COMPLETED", "buildId": "BUILD-001" }
```

---

## Testes

`npm test` sobe o servidor de verdade (mesmo HTTP e WebSocket de produção),
conecta no MySQL de verdade e usa um cliente WebSocket no lugar da Unity. Sem
mock no meio do caminho. Os testes usam um banco separado
(`<seu_banco>_test`), que é recriado a cada execução — nenhum dado de
desenvolvimento é tocado.

```bash
npm test
```

```
# tests 30
# pass 30
# fail 0
```

O que é verificado, por área:

- **API** — health, criação, consulta, ids sequenciais, IDs dos componentes
  intactos (inclusive maiúsculas), datas coerentes, `400` com detalhes,
  `404` de build e de rota;
- **Fila sem Unity** — todas em `WAITING`, ordem de chegada, posições;
- **Fluxo com Unity** — entrega da primeira build, `BUILD_STARTED`,
  `BUILD_COMPLETED` puxando a próxima, `BUILD_ERROR`, eventos de build
  inexistente, JSON inválido sem derrubar a conexão;
- **Concorrência** — uma única `BUILDING`, finalização repetida ignorada,
  quatro builds chegando ao mesmo tempo;
- **Queda e reconexão** — build devolvida à fila, reenvio ao voltar, `busy` /
  `ready`, duas Uities conectadas.

Para ver o fluxo com os próprios olhos, sem a Unity instalada:

```bash
npm run dev                            # terminal 1
npm run unity:sim                      # terminal 2
SIMULATED_BUILD_MS=4000 npm run unity:sim   # devagar, para acompanhar
```

O simulador implementa `unity.status`, `BUILD_STARTED` e `BUILD_COMPLETED`:
basta abrir `npm run unity:sim` e criar builds com `curl` para a fila andar
sozinha.

Verificação manual rápida:

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/build -H "Content-Type: application/json" -d '{"cpu":"ryzen-5-5600","gpu":"rtx-4060","ram":"16gb","storage":"nvme-1tb","motherboard":"b550","psu":"650w","case":"mid-tower"}'
curl http://localhost:3000/build/BUILD-001
curl http://localhost:3000/build/BUILD-999          # 404
curl -X POST http://localhost:3000/build -H "Content-Type: application/json" -d '{"cpu":123}'   # 400
curl http://localhost:3000/queue
```

---

## Estrutura do projeto

```
fenecan-backend/
├── src/
│   ├── server.ts                          # boot: banco → schema → app → listen
│   ├── app.ts                             # monta tudo em um processo só
│   ├── errors.ts                          # erros de domínio → HTTP
│   │
│   ├── config/
│   │   └── index.ts                       # .env (porta, MySQL, CORS, WS)
│   │
│   ├── routes/
│   │   ├── build.routes.ts                # POST /build, GET /build/:id
│   │   └── queue.routes.ts                # GET /queue, GET /build/:id/position
│   │
│   ├── schemas/
│   │   └── build.schema.ts                # validação Zod
│   │
│   ├── services/
│   │   ├── build.service.ts               # criar / consultar
│   │   └── queue.service.ts               # fila, máquina de estados, concorrência
│   │
│   ├── repository/
│   │   ├── build.repository.ts            # contrato de persistência
│   │   └── mysql.build.repository.ts      # MySQL + trava da fila (FOR UPDATE)
│   │
│   ├── websocket/
│   │   └── unity.websocket.ts             # conexão, eventos, envio de build
│   │
│   ├── database/
│   │   └── database.ts                    # pool, teste de conexão, migração
│   │
│   └── types/
│       └── build.ts                       # Build, BuildStatus, contratos
│
├── database/
│   └── schema.sql                         # tabela builds (aplicada no boot)
│
├── docs/
│   ├── API.md                             # contrato HTTP
│   ├── WEBSOCKET.md                       # contrato com a Unity
│   └── COMPONENTS.md                      # contrato dos componentes
│
├── tests/
│   ├── integration.test.ts                # 30 verificações de ponta a ponta
│   ├── unity.client.ts                    # cliente WebSocket de teste
│   └── unity.simulator.ts                 # Unity simulada (npm run unity:sim)
│
├── .env / .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## Responsabilidades

| Camada      | Arquivos                                          | O que faz                                        |
| ----------- | ------------------------------------------------- | ------------------------------------------------ |
| **API**     | `routes/*`, `schemas/*`                           | recebe, valida, cria, consulta, responde        |
| **Service** | `services/build.service.ts`                       | regra de negócio da build                       |
| **Fila**    | `services/queue.service.ts`                       | ordem, próxima build, uma por vez, quando iniciar |
| **Banco**   | `database/database.ts`, `repository/*`            | persiste, consulta, muda status com trava       |
| **WebSocket** | `websocket/unity.websocket.ts`                  | conexão da Unity, envio e recepção de eventos    |
| **Tipos**   | `types/build.ts`                                  | fonte única de `Build` e `BuildStatus`           |

As rotas não conhecem a fila, e o WebSocket não conhece o banco: o
`QueueService` é quem costura os dois, e o `app.ts` é o único lugar que monta
as implementações concretas.

---

## Decisões de integração

O que mudou ao juntar os três módulos, e por quê:

1. **MySQL, não PostgreSQL.** O pedido falava em PostgreSQL, mas o banco
   implementado no projeto era MySQL (`mysql2`). Trocar seria reescrever o
   módulo de fila inteiro, então o MySQL foi mantido.
2. **Um processo só.** A API (Fastify), o WebSocket (`ws`) e o banco
   (Express + MySQL) eram três servidores — e API e WebSocket ainda usavam a
   mesma porta 8080. Agora tudo sobe junto, na porta `PORT` (3000).
3. **Status único.** O banco usava `na_fila`/`em_execucao`/`concluida`/`erro`
   e a API usava `WAITING`/`BUILDING`/`COMPLETED`/`ERROR`. O vocabulário da
   API venceu e o `ENUM` do MySQL passou a usar os mesmos quatro valores.
4. **`build_id` além do id numérico.** A fila original usava
   `INT AUTO_INCREMENT` (1, 2, 3) e a API usava `BUILD-001`. As duas coisas
   coexistem: o `id` numérico ordena e trava as linhas (é o que a
   `SELECT ... FOR UPDATE` do módulo de fila já usava) e o `build_id` é o
   identificador público, com índice único, derivado do próprio
   auto-increment.
5. **Componentes em colunas.** A configuração estava num JSON único; agora
   cada componente tem coluna, como pede o contrato da API. O JSON foi
   mantido como cópia derivada, para não quebrar o que já existia.
6. **`BuildRepository` virou assíncrono.** Com MySQL, `save`/`findById`
   passaram a devolver `Promise`. As rotas já eram `async`, então o formato
   delas não mudou. O `InMemoryBuildRepository` saiu: com o banco obrigatório
   não sobrou uso para ele.
7. **Protocolo do WebSocket.** Os nomes antigos (`connected`, `message`,
   `error`) eram de um servidor de demonstração que repassava tudo para
   todos os clientes. `connected` e `error` foram mantidos; o repasse
   indiscriminado saiu (a Unity receberia de volta os próprios eventos) e os
   eventos de build seguem os nomes do contrato (`BUILD_START`,
   `BUILD_STARTED`, `BUILD_COMPLETED`, `BUILD_ERROR`). `unity.status`, que já
   existia no simulador antigo, foi oficializado como forma de a Unity
   segurar a fila.
8. **`id` e `buildId` juntos na resposta.** O app usa `buildId`, o contrato
   da Unity usa `id`. A API devolve os dois com o mesmo valor, para nenhum dos
   lados precisar traduzir.
9. **Recuperação no boot.** Se o servidor caísse com uma build em
   `BUILDING`, a fila ficaria travada para sempre, já que ninguém confirmaria
   o término. No boot, uma `BUILDING` volta para `WAITING`.
10. **Senha fora do código.** O módulo de fila tinha a senha do MySQL como
    valor padrão em `src/db.js`. Agora vem do `.env`, que está no
    `.gitignore`.

### Fora do escopo (de propósito)

Autenticação, usuários, login, pagamentos, Docker, Kubernetes, microsserviços,
Redis, cloud, monitoramento, frontend e código da Unity. Nenhuma dessas coisas
foi adicionada.
