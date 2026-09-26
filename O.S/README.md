# PC Build Simulator - Sistema Operador

Sistema operador (TypeScript + Node.js) que consome a **API que já existe**, exibe os pedidos
feitos pelos visitantes no site e permite ao operador mudar o status do pedido.

```
VISITANTE -> SITE (existente) -> API (existente) -> ESTE SISTEMA -> OPERADOR
                                                          |
                                                          +-> PC Building Simulator + Mods (futuro)
```

Este repositório **não** contém site, API, banco de dados nem QR Code.
Ele apenas **consome** a API e cuida da tela do operador.

---

## Backend da O.S.

Esta pasta também contém o **backend da O.S.**: regras de negócio, fluxo de status,
repositório abstrato (hoje em memória) e a porta de entrada preparada para a API
oficial. Ele fica em `src/domain`, `src/application`, `src/infrastructure` e
`src/config`, e funciona sem a API e sem o banco oficiais.

```bash
npm test            # testes do backend da O.S.
npm run os:start    # inicia o backend da O.S.
```

Documentação completa, com os guias para conectar o banco e a API oficiais:
**[BACKEND.md](BACKEND.md)**.

---

## Decisão técnica: app web local (não Electron)

Interface = servidor web local (Node) + HTML/CSS/TS servido no navegador em modo
`--app` (sem barra de endereço, sem abas, praticamente uma janela de software).

| Opção | Peso | Debug na feira | Veredito |
| --- | --- | --- | --- |
| App web local + Node | ~0 MB extra | fácil (F12, hot reload) | **escolhida** |
| Electron | +150 MB, build lento | difícil | não escolhido |
| CLI no terminal | mínimo | ok | ruim para apresentar |

O Chromium já está instalado no Windows (`msedge.exe` / `chrome.exe`), então o "app"
abre em tela cheia sem instalar nada. Se um dia quiser janela nativa, dá para
embaralhar em Electron depois sem reescrever a lógica: a regra é que **toda regra de
negócio fica em `src/services/` e nunca depende da UI**.

---

## Requisitos

- Node.js 20 ou superior (testado no v24.18.1)
- npm 10 ou superior

Verificar:

```bash
node --version
npm --version
```

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | instala as dependências |
| `npm start` | executa o sistema em modo normal |
| `npm run dev` | executa com recarga automática ao salvar (desenvolvimento) |
| `npm run typecheck` | valida os tipos sem gerar nada |
| `npm run build` | compila TypeScript para `dist/` |
| `npm run clean` | apaga `dist/` |

---

## Configuração

Tudo é configurado no arquivo **`.env`** (criado automaticamente nesta etapa).

```env
API_BASE_URL=http://localhost:3000
POLL_INTERVAL_MS=2000
REQUEST_TIMEOUT_MS=5000
OPERATOR_PORT=4000
AUTO_OPEN_BROWSER=true
```

| Variável | Obrigatória | Padrão | Significado |
| --- | --- | --- | --- |
| `API_BASE_URL` | sim | - | Endereço da API. É só isso que você muda para apontar para o servidor real. |
| `POLL_INTERVAL_MS` | não | `2000` | Intervalo da atualização automática (ETAPA 6). |
| `REQUEST_TIMEOUT_MS` | não | `5000` | Tempo limite de cada requisição. |
| `OPERATOR_PORT` | não | `4000` | Porta do servidor da interface do operador. |
| `AUTO_OPEN_BROWSER` | não | `true` | Abrir a interface automaticamente ao iniciar. |

Ao trocar para o servidor real da feira, edite apenas a primeira linha:

```env
API_BASE_URL=http://192.168.0.20:3000
```

O `.env` está no `.gitignore` (padrão, para não versionar configuração local).
O `.env.example` é a cópia que vai para o repositório.

A URL é normalizada automaticamente: `localhost:3000`, `http://localhost:3000/`
e `http://localhost:3000/api` são aceitos e viram a mesma base sem barra final.

---

## Endpoints usados

A API já existe. Nenhum endpoint novo será inventado.

| Método | Rota | Uso |
| --- | --- | --- |
| `GET` | `/orders` | lista de pedidos (polling) |
| `GET` | `/orders/:id` | detalhe de um pedido |
| `PATCH` | `/orders/:id/status` | troca de status |

---

## Estrutura planejada

```
operator-system/
├── src/
│   ├── config.ts              [ETAPA 1]  lê e valida o .env
│   ├── main.ts                [ETAPA 1]  ponto de entrada
│   ├── types/
│   │   └── order.ts           [ETAPA 2]  Order, Components, OrderStatus
│   ├── api/
│   │   └── orders-api.ts      [ETAPA 3]  cliente HTTP
│   ├── services/
│   │   ├── order-service.ts   [ETAPA 4]  GET /orders e regras de status
│   │   ├── poller.ts          [ETAPA 6]  atualização automática
│   │   └── connection.ts      [ETAPA 8]  online/offline da API
│   ├── ui/
│   │   ├── server.ts          [ETAPA 5]  servidor web local
│   │   └── public/            [ETAPA 5]  index.html, styles.css, app.ts
│   └── integration/           [ETAPA 10] ponte futura com o mod
├── .env / .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## ETAPA 1 - o que foi feito

Dependências instaladas:

- `typescript` (compilador)
- `tsx` (executa TypeScript direto, sem etapa de build no desenvolvimento)
- `@types/node` (tipos do Node)
- `dotenv` (lê o `.env`)

Arquivos criados:

| Arquivo | Conteúdo |
| --- | --- |
| `package.json` | scripts e dependências |
| `tsconfig.json` | TypeScript em modo estrito, ESM, saída em `dist/` |
| `.env` | configuração local (`API_BASE_URL=http://localhost:3000`) |
| `.env.example` | modelo de configuração |
| `.gitignore` | ignora `node_modules`, `dist`, `.env` |
| `src/config.ts` | lê e valida o `.env`, expõe `getConfig()` |
| `src/main.ts` | ponto de entrada, mostra o estado do ambiente |
| `README.md` | este documento |

Nenhuma chamada de rede é feita nesta etapa de propósito: a API ainda não é usada.

### Como verificar

```bash
npm install
npm run typecheck
npm start
```

Saída esperada (trecho):

```
==============================================================
  PC BUILD SIMULATOR - SISTEMA OPERADOR
  Etapa 1: projeto e ambiente configurados
==============================================================

  Node.js             v24.18.1
  Arquivo .env        carregado

  CONFIGURACAO
  API_BASE_URL        http://localhost:3000
  POLL_INTERVAL_MS    2000 ms (2s)

  [x] 1. Projeto TypeScript e ambiente
  [ ] 2. Tipos dos pedidos
  ...
  Etapa 1 concluida. Nenhuma chamada de rede foi feita ainda.
```

Teste extra de erro: renomeie `.env` e rode `npm start`. Deve aparecer
`ERRO DE CONFIGURACAO` explicando o que falta, em vez de um stack trace.

---

## Roadmap

- [x] **ETAPA 1** - projeto e ambiente
- [ ] **ETAPA 2** - tipos TypeScript dos pedidos
- [ ] **ETAPA 3** - cliente HTTP
- [ ] **ETAPA 4** - `GET /orders` funcionando
- [ ] **ETAPA 5** - pedidos na interface
- [ ] **ETAPA 6** - atualização automática
- [ ] **ETAPA 7** - alteração de status
- [ ] **ETAPA 8** - erros e indicador de conexão
- [ ] **ETAPA 9** - interface para a feira
- [ ] **ETAPA 10** - estrutura para integração com o mod
