# PC Build Simulator — como rodar e testar

Guia para qualquer pessoa da equipe subir o sistema completo na própria máquina
e conferir se está tudo funcionando.

## Como o sistema funciona

```text
 Visitante                 API + WebSocket                    O.S. (operador)
┌──────────────┐  POST   ┌───────────────────────────┐  WS   ┌──────────────────┐  HTTP  ┌──────────────┐
│ SITE Html/   │ /build  │ interligando/             │/ws/os │ O.S/ (backend)   │/orders │ O.S/web      │
│ index.html   ├────────▶│ fenecan-backend  :3000    ├──────▶│ API local :4100  ├───────▶│ (tela) :5173 │
│ os-client.js │◀────────┤ fila + builds             │       └──────────────────┘        └──────┬───────┘
└──────────────┘ posição └─────────────┬─────────────┘                                          │
                                       │ WS /ws                                         janela do Tauri
                                       ▼
                                 Unity (simulador)
```

1. O visitante escolhe as peças no site e clica em **Continuar**.
2. O `fenecan-backend` salva a build (`BUILD-001`, `BUILD-002`...) e coloca na fila.
3. O backend avisa a O.S. pelo WebSocket `/ws/os`, e a build vira uma O.S. `PENDING`.
4. O operador vê a O.S. na tela (janela do Tauri) e muda o status:
   Aceitar → Iniciar montagem → Concluir.
5. Se houver uma Unity conectada em `/ws`, a fila anda sozinha e o site mostra
   o andamento da montagem.

| Pasta | O que é | Porta |
| --- | --- | --- |
| `SITE Html/` | Site do visitante | — |
| `interligando/fenecan-backend/` | API HTTP, fila e WebSocket. **É o único backend que roda.** `API/`, `FILA/` e `websocket/` são o código original, só para consulta. | 3000 |
| `O.S/` | Backend da O.S. (API local) e tela do operador (`web/`) | 4100 e 5173 |
| `Tauri/` | Janela desktop que abre a tela da O.S. | — |

---

## 1. Instalar (uma vez só)

### Requisitos

| Ferramenta | Para quê | Como conferir |
| --- | --- | --- |
| Node.js 20 ou mais novo | tudo | `node --version` |
| Rust | só para abrir no Tauri | `cargo --version` |

**Rust no macOS/Linux:**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Escolha a opção 1 e **abra um terminal novo** depois.

**Rust no Windows:** instale o [rustup](https://rustup.rs) e o
"Desktop development with C++" do Visual Studio Build Tools. O WebView2 já vem
no Windows 10/11. Guia oficial: https://tauri.app/start/prerequisites/

> Sem Rust dá para testar tudo no navegador (veja o passo 2B).

### Dependências e configuração

Os arquivos `.env` **não vão para o Git**. Cada pessoa cria o seu a partir do
`.env.example`:

```bash
# API
cd interligando/fenecan-backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run build

# O.S.
cd ../../O.S
npm install
cp .env.example .env          # Windows: copy .env.example .env

# Tauri
cd ../Tauri
npm install
```

Os valores do `.env.example` já funcionam sem banco de dados
(`BUILD_STORAGE=memory`). Não precisa mudar nada para testar.

---

## 2. Rodar

Use **dois terminais** e abra o site no navegador.

### Terminal 1: API

```bash
cd interligando/fenecan-backend
npm start
```

Pronto quando aparecer `FENECAN backend no ar`. Para conferir, abra
http://localhost:3000/health e veja se responde `{"status":"ok"}`.

### Terminal 2: O.S.

**A) No Tauri (janela desktop):**

```bash
cd Tauri
npm run tauri dev
```

Esse comando sobe o backend da O.S. e a tela, e abre a janela. A primeira vez
demora alguns minutos porque o Rust compila tudo; nas próximas é rápido.

**B) Sem Rust (no navegador):**

```bash
cd O.S
npm run app:dev
```

Abre a mesma tela em http://localhost:5173.

Nos dois casos, o terminal deve mostrar:

```text
  BACKEND O.S. INICIADO
  Origem pedidos  fenecan
  API da O.S.     http://127.0.0.1:4100/orders
[fenecan] conectado (ws://localhost:3000/ws/os)
```

Se aparecer `desconectado, tentando de novo...`, o Terminal 1 não está rodando.
A O.S. reconecta sozinha assim que a API subir.

### Site

Abra o arquivo `SITE Html/index.html` direto no navegador, ou sirva a pasta:

```bash
cd "SITE Html"
python3 -m http.server 8080     # depois abra http://localhost:8080
```

O site procura a API em `http://<mesmo endereço da página>:3000`. Para usar uma
API em outra máquina (ex.: celular na mesma rede):

```text
http://IP-DO-SITE:8080/index.html?api=http://IP-DA-API:3000
```

---

## 3. Testar

### Teste completo (manual, ~2 minutos)

Com tudo rodando:

| # | Faça | Deve acontecer |
| --- | --- | --- |
| 1 | No site: **Começar**, escolha as peças e clique em **Continuar** | Vai para a tela de fila com o número da build (ex.: `#001`) e a posição |
| 2 | Olhe a tela da O.S. (até 2 s) | Aparece o card `BUILD-001 · VISITANTE` com as peças escolhidas, em **Pendente** |
| 3 | Na O.S., clique em **Aceitar pedido** | O card muda para **Aceito** e o contador do quadro atualiza |
| 4 | Clique em **Iniciar montagem** e depois em **Concluir** | O card passa por **Em montagem** e termina em **Concluído** |
| 5 | Envie mais duas builds pelo site | O site mostra posições `02` e `03`; a O.S. mostra as novas O.S. |

Sem Unity conectada, o site fica em "Aguardando o simulador ficar disponível".
Isso é o esperado: a build chegou na O.S. mesmo assim.

### Testar a fila com a Unity simulada (opcional)

```bash
cd interligando/fenecan-backend
npm run unity:sim
```

A fila anda sozinha e o site mostra "em montagem" e depois "Montagem
concluída!".

> No macOS esse comando pode travar (o `tsx` não funciona em algumas versões).
> Se travar, feche com Ctrl+C e teste com a Unity de verdade ou em outra máquina.

### Conferir pela linha de comando

```bash
# criar uma build como o site faz
curl -X POST http://localhost:3000/build -H "Content-Type: application/json" \
  -d '{"cpu":"ryzen-5-5600","gpu":"rtx-4060","ram":"ram-16-ddr4","storage":"ssd-512","motherboard":"b550","psu":"650w","case":"mid-tower"}'

curl http://localhost:3000/queue          # fila no backend
curl http://127.0.0.1:4100/orders         # O.S. recebidas

# mudar status como a tela faz
curl -X PATCH http://127.0.0.1:4100/orders/BUILD-001/status \
  -H "Content-Type: application/json" -d '{"status":"ACCEPTED"}'
```

### Testes automáticos

```bash
cd O.S
npm test              # 77 testes da O.S. (não precisa de nada rodando)
npm run typecheck     # tipos da tela

cd ../interligando/fenecan-backend
npm run typecheck
npm test              # ATENÇÃO: precisa de um MySQL rodando (veja a seção 5)
```

---

## 4. Problemas comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| `failed to run 'cargo metadata' ... No such file or directory` | Rust não instalado ou terminal antigo | Instale o Rust (seção 1) e **abra um terminal novo**. Confira com `cargo --version`. |
| `npm run dev` da API não sobe nada | `tsx` trava em alguns macOS | Use `npm run build && npm start`. |
| Site: "Não foi possível enviar ... Failed to fetch" | API desligada ou endereço errado | Confira o Terminal 1 e http://localhost:3000/health. Em outra máquina, use `?api=`. |
| Tela da O.S.: "O.S. fora do ar (http://127.0.0.1:4100)" | Backend da O.S. não subiu | Veja o erro no Terminal 2. Rode `npm run os:start` dentro de `O.S/` para ver só ele. |
| `Port 5173 is already in use` ou `EADDRINUSE` | Sobrou um processo de antes | Feche os terminais antigos. macOS/Linux: `lsof -i :5173` (ou `:3000`, `:4100`) e `kill <PID>`. |
| O.S. mostra `[fenecan] ATENCAO: chegou outra build com o id BUILD-001...` | A API foi reiniciada sem banco e a numeração voltou para `BUILD-001` | Reinicie a O.S. também (Ctrl+C e subir de novo). Com MySQL isso não acontece. |
| Status do operador voltou para "Pendente" | A O.S. foi reiniciada; o estado do operador fica só em memória | Esperado por enquanto (veja a seção 5). |

---

## 5. Banco de dados (MySQL)

Hoje tudo roda **em memória**: ao reiniciar, as builds somem. Para ligar o
banco é só configuração, sem mexer em código:

1. Crie o banco (uma vez):

   ```sql
   CREATE DATABASE montagens_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. Em `interligando/fenecan-backend/.env`:

   ```env
   DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/montagens_db
   BUILD_STORAGE=mysql
   ```

3. Suba a API de novo. A tabela `builds` é criada sozinha (`AUTO_MIGRATE=true`).

Com o banco ligado, as builds sobrevivem a reinícios e a O.S. recebe todas de
novo quando reconecta. O **status do operador** (aceito, em montagem...) ainda
fica em memória dentro da O.S. Para salvá-lo no banco, siga o
`O.S/BACKEND.md`, seção "Guia: conectar o banco de dados oficial".

> Nunca coloque senha no `.env.example` nem suba o `.env` para o Git.

---

## 6. Limitações conhecidas

- **O site tem 4 categorias, mas a API exige 7 componentes.** Placa-mãe, fonte
  e gabinete são escolhidos automaticamente pelo `os-client.js`, compatíveis
  com o que o visitante escolheu. Quando o site ganhar esses campos
  (`name="motherboard"`, `"psu"`, `"case"`), eles passam a valer.
- **Os dois fluxos de status são separados.** O da fila da Unity
  (`WAITING → BUILDING → COMPLETED/ERROR`) e o do operador
  (`PENDING → ACCEPTED → BUILDING → COMPLETED`) não se atualizam entre si.
- **Tauri empacotado:** `npm run tauri build` gera o app, mas ele não sobe o
  backend da O.S. sozinho. Rode `npm run os:start` em `O.S/` antes de abrir.

## 7. Onde mexer

| Quero... | Arquivo |
| --- | --- |
| Mudar o envio do site ou a tela de fila | `SITE Html/os-client.js` |
| Endpoints da API | `interligando/fenecan-backend/src/routes/` e `docs/API.md` |
| Mensagens do WebSocket (Unity e O.S.) | `interligando/fenecan-backend/docs/WEBSOCKET.md` |
| Como a O.S. recebe as builds | `O.S/src/infrastructure/integrations/external-api/fenecan/` |
| Regras de status da O.S. | `O.S/src/domain/rules/status-transitions.ts` e `O.S/BACKEND.md` |
| Tela do operador | `O.S/web/src/` |
| Janela do Tauri (tamanho, título) | `Tauri/src-tauri/tauri.conf.json` |
