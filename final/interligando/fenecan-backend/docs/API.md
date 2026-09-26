# Contrato da API — app mobile

Base: `http://<HOST>:<PORT>` (padrão `http://localhost:3000`).

Sem autenticação no MVP. CORS liberado por padrão, para o app consumir em
desenvolvimento — ver `CORS_ORIGIN` no `.env`.

Toda resposta é JSON, inclusive as de erro. Datas em ISO-8601, sempre em UTC.

---

## Formato da build

Os sete campos vão sempre no corpo, como **strings não vazias**. O valor é o
**ID do componente** e chega intacto na Unity (ver
[COMPONENTS.md](./COMPONENTS.md)).

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

| Campo         | Obrigatório | Observação                                   |
| ------------- | ----------- | -------------------------------------------- |
| `cpu`         | sim         | ID do componente                             |
| `gpu`         | sim         | ID do componente                             |
| `ram`         | sim         | ID do componente                             |
| `storage`     | sim         | ID do componente                             |
| `motherboard` | sim         | ID do componente                             |
| `psu`         | sim         | ID do componente                             |
| `case`        | sim         | ID do componente (o nome do campo é `case`)  |
| `visitante`   | não         | Nome/identificação, até 100 caracteres       |

> `case` é palavra reservada em várias linguagens: no JavaScript use
> `body.case` ou `body["case"]`.

---

## Status

Vocabulário único do projeto. Não existem outras grafias
(`"waiting"`, `"aguardando"`, `"pending"`…).

| Status      | Significado                                          |
| ----------- | ---------------------------------------------------- |
| `WAITING`   | salva e esperando a vez (sempre o status inicial)     |
| `BUILDING`  | enviada para a Unity, em montagem                    |
| `COMPLETED` | a Unity confirmou que terminou                      |
| `ERROR`     | a Unity informou falha (ou não pode mais prosseguir)  |

Transições possíveis:

```
WAITING ──▶ BUILDING ──▶ COMPLETED
   ▲            │
   └────────────┴──▶ ERROR
```

`COMPLETED` e `ERROR` são finais.

---

## `GET /health`

Verifica se a API está no ar.

```bash
curl http://localhost:3000/health
```

```json
{ "status": "ok" }
```

`200 OK`

---

## `POST /build`

Cria a build e coloca na fila. O status da resposta é o da criação
(`WAITING`): se a Unity estiver livre no momento, a build vira `BUILDING` logo
em seguida — consulte `GET /build/:id` para ver a situação atual.

```bash
curl -X POST http://localhost:3000/build \
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

Erros: `400` (dados inválidos), `503` (banco indisponível), `500`.

---

## `GET /build/:id`

Dados atuais da build.

```bash
curl http://localhost:3000/build/BUILD-001
```

```json
{
  "success": true,
  "build": {
    "id": "BUILD-001",
    "buildId": "BUILD-001",
    "cpu": "ryzen-5-5600",
    "gpu": "rtx-4060",
    "ram": "16gb",
    "storage": "nvme-1tb",
    "motherboard": "b550",
    "psu": "650w",
    "case": "mid-tower",
    "status": "COMPLETED",
    "createdAt": "2026-09-26T02:54:18.000Z",
    "updatedAt": "2026-09-26T02:54:24.000Z",
    "startedAt": "2026-09-26T02:54:22.000Z",
    "finishedAt": "2026-09-26T02:54:24.000Z"
  }
}
```

`200 OK` — ou `404` se a build não existir.

| Campo        | Observação                                                   |
| ------------ | ------------------------------------------------------------ |
| `id`         | mesmo valor de `buildId` (alias, veja abaixo)                 |
| `buildId`    | identificador da build, `BUILD-001`                           |
| `status`     | um dos quatro status                                          |
| `createdAt`  | quando entrou na fila                                         |
| `updatedAt`  | última mudança                                                |
| `startedAt`  | quando a Unity assumiu (`null` se nunca assumiu)              |
| `finishedAt` | quando terminou (`null` enquanto não terminou)               |

### Por que `id` e `buildId` juntos?

O app mobile já usava `buildId`; o contrato da Unity e o exemplo do projeto
usam `id`. Como é o mesmo registro, a API devolve os dois com o mesmo valor —
assim nenhum dos dois lados precisa traduzir, e dá para trocar o nome em um
dos lados sem breaking change. É um alias, não um segundo identificador.

---

## `GET /build/:id/position`

Posição na fila: `1` é a próxima a ser montada, `0` é quem já saiu da fila
(`BUILDING`, `COMPLETED` ou `ERROR`).

```bash
curl http://localhost:3000/build/BUILD-002/position
```

```json
{ "success": true, "buildId": "BUILD-002", "status": "WAITING", "position": 2 }
```

`200 OK` — ou `404` se a build não existir.

---

## `GET /queue`

Situação da fila e da conexão da Unity. Útil para uma tela de
acompanhamento e para depurar a integração.

```bash
curl http://localhost:3000/queue
```

```json
{
  "success": true,
  "unity": { "connected": true, "ready": true, "deviceId": "unity-01" },
  "building": { "buildId": "BUILD-001", "status": "BUILDING", "...": "..." },
  "waiting": [{ "buildId": "BUILD-002", "status": "WAITING", "...": "..." }],
  "counts": { "WAITING": 2, "BUILDING": 1, "COMPLETED": 4, "ERROR": 0 }
}
```

`200 OK`

| Campo      | Observação                                                  |
| ---------- | ----------------------------------------------------------- |
| `unity`    | `connected` = há socket aberto; `ready` = a fila pode andar  |
| `building` | a build em montagem, ou `null`                              |
| `waiting`  | as que esperam, da primeira para a última                   |
| `counts`   | total de builds por status                                   |

Aqui as builds vêm no formato de `Build` (com `buildId`, sem o alias `id`
que existe em `GET /build/:id`).

---

## Erros

Formato único:

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Dados da build inválidos",
  "details": [{ "field": "cpu", "message": "cpu é obrigatório" }]
}
```

`details` só aparece em `VALIDATION_ERROR`, com um item por campo inválido.

| Status | `error`                 | Quando                                             |
| ------ | ----------------------- | -------------------------------------------------- |
| `400`  | `VALIDATION_ERROR`      | campo faltando, vazio ou do tipo errado; JSON malformado |
| `404`  | `BUILD_NOT_FOUND`       | build inexistente                                    |
| `404`  | `ROUTE_NOT_FOUND`       | rota inexistente                                     |
| `409`  | `BUILD_CONFLICT`        | reservado: nenhuma rota do MVP chega a produzi-lo   |
| `503`  | `DATABASE_UNAVAILABLE`  | MySQL fora do ar                                     |
| `500`  | `INTERNAL_SERVER_ERROR` | falha inesperada                                     |

Sobre o `409`: não existe operação conflitante no MVP, porque **várias
builds podem ser criadas ao mesmo tempo** — o que o sistema garante é outra
coisa, no máximo uma build em montagem por vez, e isso quem garante é a fila
no banco, não a API. O código e o handler do `409` já existem
(`conflict()` em [`src/errors.ts`](../src/errors.ts)), prontos para quando
algum endpoint precisar recusar uma operação por conflito de estado.

Códigos são estáveis — o app pode tratar por `error`, não por `message`.
Stack trace e detalhe interno **nunca** vão para o cliente: ficam no log do
servidor.

Exemplo de validação (campo faltando):

```bash
curl -X POST http://localhost:3000/build \
  -H "Content-Type: application/json" \
  -d '{ "cpu": 123, "gpu": null }'
```

```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Dados da build inválidos",
  "details": [
    { "field": "cpu", "message": "cpu é obrigatório" },
    { "field": "gpu", "message": "gpu é obrigatório" }
  ]
}
```

---

## Resumo dos endpoints

| Método | Rota                     | Quem usa              | Resposta |
| ------ | ------------------------ | --------------------- | -------- |
| `GET`  | `/health`                | app, monitoramento    | `200`    |
| `POST` | `/build`                 | app mobile            | `201`    |
| `GET`  | `/build/:id`             | app mobile            | `200`    |
| `GET`  | `/build/:id/position`    | app mobile            | `200`    |
| `GET`  | `/queue`                 | tela de acompanhamento | `200`   |
| `WS`   | `/ws`                    | Unity                 | —        |

O contrato do WebSocket está em [WEBSOCKET.md](./WEBSOCKET.md).
