# Contrato do WebSocket — backend ↔ Unity

O backend e a Unity conversam por **um único WebSocket**, no mesmo processo e
na mesma porta da API HTTP.

```
ws://<HOST>:<PORT><WS_PATH>     # padrão: ws://localhost:3000/ws
```

Não há autenticação, token ou handshake especial. Para o servidor aceitar a
conexão, o path tem que ser exatamente o de `WS_PATH` (`/ws` por padrão);
qualquer outro path é recusado.

A identificação da Unity é opcional e serve para o log e para o
`GET /queue`:

```
ws://localhost:3000/ws?deviceId=unity-01
```

---

## Formato das mensagens

Tudo é JSON em texto, uma mensagem por frame, sempre com um campo `type`
(string). Campo desconhecido é ignorado; mensagem sem `type` é recusada.

| direção  | quem manda                    | mensagens                                       |
| -------- | ----------------------------- | ----------------------------------------------- |
| backend → Unity | backend              | `connected`, `BUILD_START`, `error`             |
| Unity → backend | Unity                | `unity.status`, `BUILD_STARTED`, `BUILD_COMPLETED`, `BUILD_ERROR` |

---

## Fluxo completo

```
 Unity                              Backend                      MySQL
   │                                    │                           │
   ├────── unity.status (ready) ───────▶│                           │
   │                                    │                           │
   │◀───────────── BUILD_START ─────────┤◀── claimNextBuild() ──────┤  BUILD-001
   │                                    │      (WAITING→BUILDING)   │
   ├────── BUILD_STARTED ─────────────▶│                           │
   │                                    │                           │
   │        (montando o PC...)          │                           │
   │                                    │                           │
   ├────── BUILD_COMPLETED ────────────▶│                           │
   │                                    │◀── (BUILDING→COMPLETED) ──┤
   │                                    │                           │
   │◀───────────── BUILD_START ─────────┤◀── claimNextBuild() ──────┤  BUILD-002
   │                        (repete a montagem, uma por vez)        │
```

A fila **anda sozinha**: o backend entrega a próxima build assim que recebe
`BUILD_COMPLETED` ou `BUILD_ERROR`. A Unity não precisa pedir nada por HTTP.

---

## Backend → Unity

### `connected`

Primeira mensagem, logo após a conexão. Mantida do módulo WebSocket original.

```json
{
  "type": "connected",
  "clientId": "0f0c1f6e-6b2f-4a5e-9a1e-2c3d4e5f6a7b",
  "message": "WebSocket connection established"
}
```

`clientId` vem de `?clientId=`/`?deviceId=` da URL ou é gerado.

### `BUILD_START`

A build que a Unity deve montar agora. Só uma por vez.

```json
{
  "type": "BUILD_START",
  "buildId": "BUILD-001",
  "sentAt": "2026-09-26T02:54:20.104Z",
  "build": {
    "id": "BUILD-001",
    "cpu": "ryzen-5-5600",
    "gpu": "rtx-4060",
    "ram": "16gb",
    "storage": "nvme-1tb",
    "motherboard": "b550",
    "psu": "650w",
    "case": "mid-tower"
  }
}
```

Pontos de atenção:

- **`build.id`** é o identificador da build (`BUILD-001`). O mesmo valor
  também vem em `buildId`, no topo da mensagem, porque o app mobile chama
  esse campo de `buildId` e a Unity de `id`.
- **Os IDs dos componentes vão exatamente como o celular enviou.** Nada é
  normalizado: `Ryzen-5-5600` continua `Ryzen-5-5600`, `16GB` continua
  `16GB`. É assim que a Unity reconhece o componente. Veja
  [COMPONENTS.md](./COMPONENTS.md).
- `sentAt` é ISO-8601 em UTC, só para log.

### `error`

Resposta a uma mensagem inválida, enviada **só** para quem errou (não é
repassada a outros clientes).

```json
{ "type": "error", "message": "Messages must be valid JSON." }
```

Casos: JSON inválido, mensagem sem `type`, `type` desconhecido,
`BUILD_STARTED`/`COMPLETED`/`ERROR` sem `buildId`, `unity.status` com valor
inválido.

---

## Unity → backend

### `unity.status`

Declara se a Unity está livre. **Opcional**: sem essa mensagem a Unity é
considerada livre e recebe builds normalmente (compatível com uma Unity que
implemente só o contrato mínimo).

```json
{ "type": "unity.status", "status": "ready", "deviceId": "unity-01" }
```

| `status` | efeito                                                              |
| -------- | ------------------------------------------------------------------- |
| `ready`  | libera a fila: a próxima build `WAITING` é entregue                |
| `busy`   | segura a fila: nada é enviado enquanto a Unity estiver ocupada    |

`UNITY_STATUS` (maiúsculas) é aceito como sinônimo. A mensagem também pode
trazer `deviceId`, que é o nome usado em `GET /queue` e nos logs.

### `BUILD_STARTED`

A Unity começou a montar. Garante o status `BUILDING` da build.

```json
{ "type": "BUILD_STARTED", "buildId": "BUILD-001" }
```

Na prática a build já está `BUILDING` quando chega aqui (o backend marca ao
enviar). O evento cobre o caso de reconexão: se a build estava `WAITING`, ela
vira `BUILDING`. Se já estiver `COMPLETED` ou `ERROR`, o evento é ignorado
(com aviso no log) — não ressuscita build terminada.

### `BUILD_COMPLETED`

A montagem terminou com sucesso. O backend marca `COMPLETED`, libera a Unity
e entrega a próxima build da fila.

```json
{ "type": "BUILD_COMPLETED", "buildId": "BUILD-001" }
```

Mensagem repetida para a mesma build é ignorada: o segundo `BUILD_COMPLETED`
não altera nada e não faz a Unity pular a fila.

### `BUILD_ERROR`

A montagem falhou. O backend marca `ERROR`, registra o motivo e libera a
Unity para a próxima build.

```json
{ "type": "BUILD_ERROR", "buildId": "BUILD-001", "message": "faltou o cooler" }
```

`message` é opcional e vai para o log do servidor.

---

## Comportamentos que a Unity pode esperar

| Situação                                            | O que acontece                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| Nenhuma Unity conectada                             | as builds ficam em `WAITING`; nada é enviado                          |
| Build na fila, Unity `ready`                        | a mais antiga (`created_at`) é enviada na hora                       |
| Unity `busy`                                        | a fila espera; ao virar `ready`, a fila anda                         |
| Unity desconecta no meio da montagem                | a build volta para `WAITING` e é reenviada quando a Unity voltar     |
| Backend reinicia com build presa em `BUILDING`      | ela volta para `WAITING` no boot (ninguém confirmaria o término)    |
| Duas Uities conectadas                              | só a ativa recebe builds; se ela cair, a build vai para a outra      |
| Envio falha porque a Unity caiu no meio              | a build volta para `WAITING` (nada fica preso em `BUILDING`)        |
| Mensagem inválida                                   | só a Unity que errou recebe `error`; a conexão continua viva         |
| Build desconhecida no `buildId`                     | evento ignorado com aviso no log; o servidor segue normal           |

Nenhuma situação resulta em duas builds `BUILDING` ao mesmo tempo: a trava
é do banco (transação com `SELECT ... FOR UPDATE`), não do processo.

---

## Exemplos

### Node.js (`ws`)

```js
import WebSocket from "ws";

const socket = new WebSocket("ws://localhost:3000/ws?deviceId=unity-01");

socket.on("open", () => {
  socket.send(JSON.stringify({ type: "unity.status", status: "ready", deviceId: "unity-01" }));
});

socket.on("message", (raw) => {
  const message = JSON.parse(raw.toString());

  if (message.type === "BUILD_START") {
    const { id, cpu, gpu, ram, storage, motherboard, psu, case: pcCase } = message.build;

    console.log(`montando ${id}: ${cpu} + ${gpu} + ${ram} + ${storage}`);

    socket.send(JSON.stringify({ type: "BUILD_STARTED", buildId: id }));

    setTimeout(() => {
      socket.send(JSON.stringify({ type: "BUILD_COMPLETED", buildId: id }));
    }, 4000);
  }
});
```

O mesmo protocolo em C# (`NativeWebSocket` do Unity):

```csharp
using var socket = new ClientWebSocket();
await socket.ConnectAsync(new Uri("ws://localhost:3000/ws?deviceId=unity-01"), token);

var status = JsonUtility.FromJson<StatusMessage>(
    "{\"type\":\"unity.status\",\"status\":\"ready\"}");
await SendAsync(socket, status);

var started = JsonUtility.FromJson<BuildStartMessage>(Encoding.UTF8.GetString(buffer));
var buildId = started.build.id;                 // "BUILD-001"
var cpu = started.build.cpu;                    // "ryzen-5-5600"

await SendAsync(socket, new BuildEvent { type = "BUILD_STARTED", buildId = buildId });
```

### Cliente de teste do projeto

O repositório traz um simulador pronto, que é o mesmo usado nos testes
automatizados:

```bash
npm run unity:sim                            # 1,2s de montagem por build
SIMULATED_BUILD_MS=4000 npm run unity:sim    # devagar, para acompanhar
```

Ele implementa `unity.status`, `BUILD_STARTED` e `BUILD_COMPLETED`, então
dá para ver a fila inteira funcionando sem a Unity instalada.

---

## Canal da O.S. (sistema do operador)

`ws://<HOST>:<PORT>/ws/os` (caminho em `OS_WS_PATH`). Separado do canal da
Unity: quem conecta aqui **nunca** recebe `BUILD_START`. É só de saída — o
backend não espera mensagens da O.S.

| Evento            | Quando                                   | Corpo                      |
| ----------------- | ---------------------------------------- | -------------------------- |
| `BUILDS_SNAPSHOT` | logo ao conectar (todas as builds)       | `{ "builds": Build[] }`    |
| `BUILD_CREATED`   | `POST /build` salvou uma build nova      | `{ "build": Build }`       |
| `BUILD_UPDATED`   | a build mudou de status na fila          | `{ "build": Build }`       |

`Build` é o mesmo objeto de `GET /build/:id` (sem o alias `id`). Os avisos
saem do `NotifyingBuildRepository`, depois que a operação foi salva — com
MySQL ou em memória.

```json
{ "type": "BUILD_CREATED",
  "build": { "buildId": "BUILD-001", "cpu": "ryzen-5-5600", "gpu": "rtx-4060",
             "ram": "ram-16-ddr4", "storage": "ssd-512", "motherboard": "b550",
             "psu": "650w", "case": "mid-tower", "status": "WAITING",
             "createdAt": "…", "updatedAt": "…", "startedAt": null, "finishedAt": null } }
```

Quem consome: `O.S/src/infrastructure/integrations/external-api/fenecan/`
(`ORDER_PROVIDER=fenecan` no `.env` da O.S.).

---

## Dependências de versão

O módulo WebSocket original repetia toda mensagem recebida para todos os
clientes:

```json
{ "type": "message", "receivedAt": "...", "type": "BUILD_STARTED", "buildId": "BUILD-001" }
```

Isso foi removido de propósito: nesse formato a Unity receberia de volta os
próprios `BUILD_STARTED`/`BUILD_COMPLETED`, duplicados, e o protocolo não
fecharia. Hoje o repasse é só de `BUILD_START` do backend para a Unity ativa.
