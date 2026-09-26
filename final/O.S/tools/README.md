# tools/ - Mock API (apenas desenvolvimento)

Esta pasta **nao faz parte do sistema operador**. E a Mock API.

```
src/       <- SISTEMA OPERADOR (codigo de producao)
tools/     <- MOCK API (so desenvolvimento/teste, pode ser apagado)
```

## Por que existe

A API real esta sendo desenvolvida por outra equipe. Para desenvolver e testar a tela do
operador sem depender dela, a Mock API simula o mesmo contrato.

## Contrato simulado

| Método | Rota | Resposta |
| --- | --- | --- |
| `GET` | `/orders` | `200` com array de pedidos |
| `GET` | `/orders/:id` | `200` com o pedido, ou `404` |
| `PATCH` | `/orders/:id/status` | `200` com o pedido atualizado, `404` se nao existe, `422` se status invalido |

Formato do pedido (identico ao exemplo do enunciado):

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
  }
}
```

## Como iniciar

```bash
npm run mock:api
```

Terminal 2:

```bash
npm start
```

Variaveis opcionais da Mock API (nao do sistema operador):

| Variavel | Padrao | Significado |
| --- | --- | --- |
| `MOCK_PORT` | `3000` | porta da Mock API |
| `MOCK_AUTO_ORDER_MS` | `15000` | intervalo entre pedidos ficticios; `0` desativa |

Exemplo para testar pedidos chegando rapido:

```bash
$env:MOCK_AUTO_ORDER_MS=5000
npm run mock:api
```

## Como trocar para a API real

1. Apague a pasta `tools/` inteira.
2. No `.env`, mude **uma unica linha**:

```
API_URL=http://ENDERECO-DA-API-REAL:PORTA
```

3. Rode `npm start`.

O sistema operador nao importa nada de `tools/`: ele fala com a API apenas pelo
cliente HTTP em `src/api/orders-api.ts`.
