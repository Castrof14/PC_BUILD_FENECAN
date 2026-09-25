# Pessoa 3 — Banco de dados e gerenciamento da fila

Implementação em **Node.js + Express + MySQL**. Se o grupo usa outra
linguagem, a lógica (principalmente a trava em `selecionarProximaMontagem`)
é o que precisa ser replicado — o resto é só CRUD.

## Como cada função pedida foi resolvida

| Responsabilidade                        | Onde está                                                               |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Configurar o MySQL                      | `src/db.js` (pool de conexão)                                           |
| Criar tabela de montagens               | `database/schema.sql`                                                   |
| Salvar cada configuração recebida       | `montagemService.salvarMontagem()`                                      |
| Controlar estados da montagem           | coluna `status` (`na_fila`, `em_execucao`, `concluida`, `erro`)         |
| Definir ordem da fila                   | `montagemService.listarFila()` — FIFO por `criado_em`                   |
| Selecionar a próxima montagem           | `montagemService.selecionarProximaMontagem()`                           |
| Atualizar status quando a Unity começa  | feito dentro de `selecionarProximaMontagem()` (ou via `marcarInicio()`) |
| Atualizar status quando a Unity termina | `montagemService.marcarFim()`                                           |
| Posição de cada visitante na fila       | `montagemService.posicaoNaFila()`                                       |
| Evitar duas montagens simultâneas       | transação com `SELECT ... FOR UPDATE` em `selecionarProximaMontagem()`  |

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Criar o banco (ajuste usuário/senha conforme seu MySQL)
mysql -u root -p < database/schema.sql

# 3. Configurar variáveis de ambiente (ou exportar antes de rodar)
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=sua_senha
export DB_NAME=montagens_db

# 4. Rodar a API
npm start
```

## Endpoints (para as Pessoas 1 e 2 integrarem)

- `POST /montagens` — salva a configuração de um visitante e o coloca na fila.
  Body: `{ "visitante": "João", "configuracao": { ... } }`
- `GET /montagens/:id` — consulta uma montagem.
- `GET /montagens/:id/posicao` — posição do visitante na fila.
- `GET /fila` — lista completa da fila atual (em execução + aguardando).
- `POST /fila/proxima` — **chamado pela Unity** quando está livre para
  iniciar uma nova montagem. Retorna a próxima montagem e já a marca como
  `em_execucao`, ou `204 No Content` se não houver nada disponível.
- `POST /montagens/:id/finalizar` — **chamado pela Unity** ao terminar.
  Body opcional: `{ "sucesso": true }` (default `true`).

## Sobre a trava contra montagens simultâneas

Não existe uma tabela ou variável de "lock" separada. A trava é garantida
pelo próprio banco: `selecionarProximaMontagem()` abre uma transação,
verifica com `FOR UPDATE` se já existe alguma linha com
`status = 'em_execucao'` e, se não existir, seleciona e trava a próxima
linha `na_fila` antes de atualizá-la. Isso é atômico mesmo se a Unity (ou
qualquer outro cliente) fizer duas chamadas ao mesmo tempo.
