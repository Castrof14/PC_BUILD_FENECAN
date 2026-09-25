# FENECAN PC Build Simulator — Backend

Backend responsável por receber, validar e gerenciar as configurações de computadores escolhidas pelos visitantes durante a apresentação da FENECAN.

O sistema funciona como intermediário entre o site acessado pelos celulares, o banco de dados, o sistema de fila e a aplicação 3D desenvolvida em Unity.

## Arquitetura

```text
📱 Celular do visitante
        │
        │ HTTP / REST
        ▼
┌───────────────────────┐
│       Backend         │
│                       │
│  API + Validação      │
│  Fila + Banco         │
│  WebSocket            │
└───────────┬───────────┘
            │
            │ WebSocket
            ▼
       🎮 Unity
            │
            ▼
       📺 TV / Projetor
```

## Objetivo

Permitir que um visitante:

1. Acesse o site pelo celular.
2. Escolha os componentes de um computador.
3. Envie sua configuração.
4. Receba um identificador da montagem.
5. Acompanhe o status da sua montagem.
6. Aguarde sua vez na fila.
7. Tenha sua configuração enviada para a Unity.
8. Veja o computador sendo montado virtualmente em 3D.

## Responsabilidade do Backend

O backend é responsável por:

* Receber as configurações enviadas pelo site.
* Validar os dados recebidos.
* Gerar um identificador único para cada montagem.
* Armazenar as configurações.
* Gerenciar a fila de montagens.
* Controlar o status de cada montagem.
* Comunicar-se com a Unity através de WebSocket.
* Informar o status das montagens ao site.
* Disponibilizar informações sobre o estado do servidor.

## Tecnologias

* Node.js
* TypeScript
* Fastify
* Zod
* PostgreSQL
* WebSocket
* dotenv

## Estrutura planejada

```text
fenecan-backend/
│
├── src/
│   ├── server.ts
│   ├── app.ts
│   │
│   ├── routes/
│   │   ├── build.routes.ts
│   │   └── queue.routes.ts
│   │
│   ├── schemas/
│   │   └── build.schema.ts
│   │
│   ├── services/
│   │   ├── build.service.ts
│   │   └── queue.service.ts
│   │
│   ├── websocket/
│   │   └── unity.websocket.ts
│   │
│   ├── database/
│   │   └── database.ts
│   │
│   └── types/
│       └── build.ts
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

## Configuração de uma montagem

O site deve enviar uma configuração utilizando IDs padronizados para os componentes.

Exemplo:

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

Os IDs dos componentes devem ser iguais no:

* Site
* Backend
* Banco de dados
* Unity

O backend transporta esses IDs. A Unity é responsável por associar cada ID ao modelo 3D correspondente.

## API

### `GET /health`

Verifica se o servidor está funcionando.

Resposta esperada:

```json
{
  "status": "ok"
}
```

---

### `POST /build`

Recebe uma nova configuração de computador.

Exemplo de requisição:

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

Resposta esperada:

```json
{
  "success": true,
  "buildId": "BUILD-001",
  "status": "WAITING",
  "position": 1
}
```

---

### `GET /build/:id`

Consulta o estado de uma montagem.

Exemplo:

```text
GET /build/BUILD-001
```

Resposta:

```json
{
  "buildId": "BUILD-001",
  "status": "BUILDING",
  "position": 0
}
```

## Status das montagens

Uma montagem pode possuir os seguintes estados:

```text
WAITING
   ↓
BUILDING
   ↓
COMPLETED
```

Em caso de erro:

```text
WAITING
   ↓
BUILDING
   ↓
ERROR
```

### `WAITING`

A montagem foi recebida e está aguardando na fila.

### `BUILDING`

A configuração foi enviada para a Unity e a montagem está sendo apresentada.

### `COMPLETED`

A apresentação da montagem foi concluída.

### `ERROR`

Ocorreu algum problema durante o processamento.

## WebSocket

A comunicação em tempo real com a Unity será realizada através de WebSocket.

Fluxo:

```text
Backend
   │
   │ NEW_BUILD
   ▼
Unity
   │
   │ BUILD_STARTED
   ▼
Backend
   │
   │ BUILD_COMPLETED
   ▼
Backend
```

Eventos previstos:

```text
NEW_BUILD
BUILD_STARTED
BUILD_COMPLETED
QUEUE_UPDATED
SERVER_STATUS
```

Exemplo de mensagem enviada para a Unity:

```json
{
  "event": "NEW_BUILD",
  "data": {
    "buildId": "BUILD-001",
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

## Fluxo completo

```text
1. Visitante acessa o site
          ↓
2. Escolhe os componentes
          ↓
3. Site envia POST /build
          ↓
4. Backend valida a configuração
          ↓
5. Backend gera BUILD-ID
          ↓
6. Configuração entra na fila
          ↓
7. Backend seleciona a próxima montagem
          ↓
8. Backend envia configuração para Unity
          ↓
9. Unity inicia a montagem
          ↓
10. Unity envia BUILD_STARTED
          ↓
11. Unity realiza a montagem 3D
          ↓
12. Unity envia BUILD_COMPLETED
          ↓
13. Backend libera a próxima montagem
```

## Desenvolvimento

### Pré-requisitos

* Node.js
* npm
* Git

### Instalação

Clone o repositório:

```bash
git clone <URL_DO_REPOSITORIO>
```

Entre na pasta:

```bash
cd fenecan-backend
```

Instale as dependências:

```bash
npm install
```

### Variáveis de ambiente

Crie um arquivo `.env`:

```env
PORT=8080
DATABASE_URL=
```

Não coloque informações sensíveis no repositório.

O arquivo `.env` deve estar no `.gitignore`.

## Execução em desenvolvimento

```bash
npm run dev
```

O servidor deverá ficar disponível em:

```text
http://localhost:8080
```

Teste:

```text
GET http://localhost:8080/health
```

## Testando o envio de uma montagem

Exemplo utilizando `curl`:

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

## Desenvolvimento por etapas

O projeto será desenvolvido de forma incremental.

### Etapa 1 — API

* [x] Criar projeto Node.js
* [ ] Configurar TypeScript
* [ ] Criar servidor Fastify
* [ ] Criar `GET /health`
* [ ] Criar `POST /build`
* [ ] Criar validação com Zod
* [ ] Gerar Build ID
* [ ] Criar `GET /build/:id`

### Etapa 2 — Fila

* [ ] Criar serviço de fila
* [ ] Controlar posição das montagens
* [ ] Controlar status
* [ ] Impedir duas montagens simultâneas

### Etapa 3 — Banco de dados

* [ ] Configurar PostgreSQL
* [ ] Criar tabela `builds`
* [ ] Persistir montagens
* [ ] Consultar status
* [ ] Integrar banco com fila

### Etapa 4 — WebSocket

* [ ] Criar conexão com Unity
* [ ] Enviar `NEW_BUILD`
* [ ] Receber `BUILD_STARTED`
* [ ] Receber `BUILD_COMPLETED`
* [ ] Atualizar fila automaticamente

### Etapa 5 — Integração

* [ ] Integrar com o site
* [ ] Integrar com Unity
* [ ] Testar múltiplos celulares
* [ ] Testar fila completa
* [ ] Testar recuperação de conexão
* [ ] Testar ambiente da apresentação

## Organização da equipe

### Pessoa 1 — API e validação

Responsável por:

* Servidor HTTP
* Rotas da API
* Recebimento das configurações
* Validação dos dados
* Geração dos Build IDs
* Respostas da API
* Health check

### Pessoa 2 — WebSocket

Responsável por:

* Comunicação Backend ↔ Unity
* Eventos em tempo real
* Conexão e reconexão da Unity
* Integração com a equipe de Unity

### Pessoa 3 — Banco e fila

Responsável por:

* PostgreSQL
* Persistência das montagens
* Fila
* Status das montagens
* Seleção da próxima montagem

## Regras de integração

### IDs dos componentes

Os IDs dos componentes devem ser padronizados.

Exemplo:

```text
ryzen-5-5600
rtx-4060
16gb
nvme-1tb
b550
650w
mid-tower
```

Não utilizar nomes diferentes para representar o mesmo componente entre os sistemas.

### Responsabilidade do Backend

O Backend não monta o computador em 3D.

Ele apenas:

```text
recebe
   ↓
valida
   ↓
organiza
   ↓
envia
```

A montagem visual é responsabilidade da Unity.

## Objetivo do MVP

O primeiro objetivo é fazer o seguinte fluxo funcionar:

```text
📱 Celular
   ↓
POST /build
   ↓
🌐 Backend
   ↓
Fila
   ↓
WebSocket
   ↓
🎮 Unity
   ↓
📺 Tela
```

Funcionalidades adicionais devem ser implementadas somente depois que esse fluxo estiver funcionando de ponta a ponta.

---

**Projeto acadêmico desenvolvido para apresentação na FENECAN.**
