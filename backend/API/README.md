# fenecan-backend

API REST do **PC Build Simulator** — projeto FENECAN.

Recebe a configuração de PC escolhida no site, valida, gera um `Build ID` e
entrega a build para as próximas camadas (fila, WebSocket e Unity).

```
📱 Site  ──HTTP/REST──▶  🌐 API (Fastify)  ──▶  Fila / WebSocket  ──▶  🎮 Unity
```

> **Escopo atual (MVP):** apenas a camada REST. O armazenamento é **em memória**,
> então as builds se perdem a cada reinício do servidor. Banco de dados, fila,
> WebSocket, autenticação e Docker ficam para as próximas etapas.

---

## Stack

- Node.js + TypeScript (modo `strict`, sem `any`)
- Fastify 5
- Zod 4 (validação)
- `@fastify/cors`
- dotenv
- tsx (desenvolvimento)

---

## Como executar

Pré-requisito: Node.js 20+ instalado.

```bash
# 1. instalar dependências
npm install

# 2. subir o servidor em desenvolvimento (recarrega sozinho ao salvar)
npm run dev
```

A API sobe em `http://localhost:8080`.

Para rodar a versão compilada:

```bash
npm run build     # compila TypeScript para dist/
npm run start     # executa dist/server.js
```

---

## Variáveis de ambiente

O `.env` já vem pronto. O `.env.example` serve como modelo para o time.

| Variável      | Padrão     | Descrição                                              |
| ------------- | ---------- | ------------------------------------------------------ |
| `PORT`        | `8080`     | Porta do servidor                                       |
| `HOST`        | `0.0.0.0`  | Interface de escuta                                     |
| `CORS_ORIGIN` | _(vazio)_  | Opcional. Domínios permitidos, separados por vírgula.   |

Sem `CORS_ORIGIN`, o CORS fica liberado para qualquer origem (necessário
durante o desenvolvimento). Para restringir ao site oficial:

```bash
CORS_ORIGIN=https://site.fenecan.com
```

---

## Endpoints

### `GET /health`

Verifica se o servidor está no ar.

```bash
curl http://localhost:8080/health
```

```json
{ "status": "ok" }
```

`200 OK`

---

### `POST /build`

Recebe uma nova configuração e cria a build com status inicial `WAITING`.

```bash
curl -X POST http://localhost:8080/build \
  -H "Content-Type: application/json" \
  -d '{
    "cpu": "ryzen-5-5600",
    "gpu": "rtx-4060",
    "ram": "16gb",
    "storage": "nvme-1tb",
    "motherboard": "b550",
    "psu": "650w",
    "case": "mid-tower"
  }'
```

```json
{
  "success": true,
  "buildId": "BUILD-001",
  "status": "WAITING",
  "message": "Build recebida com sucesso"
}
```

`201 Created`

Todos os campos são **obrigatórios** e devem ser strings não vazias.
Os IDs são sequenciais e únicos por execução: `BUILD-001`, `BUILD-002`, ...

---

### `GET /build/:id`

Consulta uma build pelo identificador.

```bash
curl http://localhost:8080/build/BUILD-001
```

```json
{
  "success": true,
  "build": {
    "buildId": "BUILD-001",
    "cpu": "ryzen-5-5600",
    "gpu": "rtx-4060",
    "ram": "16gb",
    "storage": "nvme-1tb",
    "motherboard": "b550",
    "psu": "650w",
    "case": "mid-tower",
    "status": "WAITING"
  }
}
```

`200 OK` — ou `404 Not Found` se a build não existir.

---

## Tratamento de erros

Todas as respostas, inclusive as de erro, são JSON. Stack traces e detalhes
internos **nunca** vão para o cliente — ficam apenas no log do servidor.

| Situação                                | Status | `error`                  |
| --------------------------------------- | ------ | ------------------------ |
| Dados inválidos / JSON malformado       | `400`  | `VALIDATION_ERROR`       |
| Build inexistente                       | `404`  | `BUILD_NOT_FOUND`        |
| Rota inexistente                        | `404`  | `ROUTE_NOT_FOUND`        |
| Falha inesperada                        | `500`  | `INTERNAL_SERVER_ERROR`  |

Dados inválidos:

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Dados da build inválidos",
  "details": [{ "field": "cpu", "message": "cpu é obrigatório" }]
}
```

Build inexistente:

```json
{
  "success": false,
  "error": "BUILD_NOT_FOUND",
  "message": "Build não encontrada"
}
```

### Códigos de `error`

Use estes valores para tratar erros no site e na Unity — eles são estáveis:

`VALIDATION_ERROR` · `BUILD_NOT_FOUND` · `ROUTE_NOT_FOUND` · `INTERNAL_SERVER_ERROR`

---

## Status da build

`WAITING` · `BUILDING` · `COMPLETED` · `ERROR`

Toda build nova nasce em `WAITING`. **A mudança automática de status não está
implementada** — será controlada pela fila/WebSocket.

---

## Testes manuais

Com o servidor rodando (`npm run dev`):

```bash
# health
curl http://localhost:8080/health

# criar build
curl -X POST http://localhost:8080/build \
  -H "Content-Type: application/json" \
  -d '{
    "cpu": "ryzen-5-5600",
    "gpu": "rtx-4060",
    "ram": "16gb",
    "storage": "nvme-1tb",
    "motherboard": "b550",
    "psu": "650w",
    "case": "mid-tower"
  }'

# consultar build
curl http://localhost:8080/build/BUILD-001

# build inexistente -> 404
curl http://localhost:8080/build/BUILD-999

# validação -> 400
curl -X POST http://localhost:8080/build \
  -H "Content-Type: application/json" \
  -d '{ "cpu": 123, "gpu": null }'
```

---

## Estrutura do projeto

```
fenecan-backend/
├── src/
│   ├── server.ts                        # apenas inicia o servidor
│   ├── app.ts                           # monta o Fastify: CORS, rotas, handlers de erro
│   │
│   ├── config/
│   │   └── index.ts                     # variáveis de ambiente (dotenv)
│   │
│   ├── routes/
│   │   └── build.routes.ts              # rotas de build (valida e formata a resposta)
│   │
│   ├── schemas/
│   │   └── build.schema.ts              # schema Zod + formatação de `details`
│   │
│   ├── services/
│   │   └── build.service.ts             # regra de negócio (criar / consultar)
│   │
│   ├── repository/
│   │   ├── build.repository.ts          # interface de persistência (contrato do banco)
│   │   └── in-memory.build.repository.ts# implementação em memória (Map) — MVP
│   │
│   └── types/
│       └── build.ts                     # Build, BuildStatus, respostas e erros
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

## Onde encaixar as próximas camadas

O projeto já está preparado para as próximas etapas:

- **Banco de dados** — implemente `BuildRepository` (outra classe com o mesmo
  formato) e troque a instância criada em `src/app.ts`. Nenhuma rota muda.
- **Fila / WebSocket** — a máquina de status
  (`WAITING → BUILDING → COMPLETED | ERROR`) entra em
  `src/services/build.service.ts`, que hoje só cria e consulta.
- **Unity** — basta consumir `GET /build/:id` e os códigos de `error` acima.

---

## Fora do escopo (não implementado)

PostgreSQL · Prisma · Supabase · WebSocket · Socket.IO · fila · integração com
Unity · autenticação · Docker · deploy.
