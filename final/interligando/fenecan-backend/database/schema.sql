-- ============================================================
-- FENECAN — schema do banco de dados
--
-- Tabela `builds`: substitui a antiga `montagens` (vazia), que
-- guardava a configuração como um JSON só. Agora cada componente
-- tem coluna própria, os status seguem o vocabulário único do
-- projeto (WAITING/BUILDING/COMPLETED/ERROR) e existe um
-- `build_id` público no formato BUILD-001.
--
-- Este arquivo é idempotente e é aplicado automaticamente na
-- inicialização do servidor (AUTO_MIGRATE=true), então não é
-- necessário rodar o `mysql <` manualmente no dia a dia.
--
-- O banco (schema) NÃO é criado aqui de propósito: o nome vem do
-- .env (DATABASE_URL). Crie uma vez, se ainda não existir:
--
--   CREATE DATABASE montagens_db
--     CHARACTER SET utf8mb4
--     COLLATE utf8mb4_unicode_ci;
-- ============================================================

CREATE TABLE IF NOT EXISTS builds (
  -- chave interna: usada pela fila para ordenar e travar linhas
  -- (SELECT ... FOR UPDATE SKIP LOCKED). Nunca sai para a API.
  id           INT AUTO_INCREMENT PRIMARY KEY,

  -- Identificador público da build, único (BUILD-001, BUILD-002, ...).
  --
  -- Aceita NULL de propósito: o id sai do próprio AUTO_INCREMENT, então o
  -- repositório insere a linha e preenche o build_id na mesma transação
  -- (src/repository/mysql.build.repository.ts -> create()). Ninguém
  -- enxerga a linha sem id, e o índice abaixo garante a unicidade.
  build_id     VARCHAR(16)      NULL,

  -- identificação do visitante (vinda do módulo de fila original).
  -- Opcional: o app mobile não precisa enviar.
  visitante    VARCHAR(100)     NULL,

  -- configuração enviada pelo celular. Os IDs dos componentes são
  -- gravados exatamente como chegaram, sem normalização.
  cpu          VARCHAR(100)     NOT NULL,
  gpu          VARCHAR(100)     NOT NULL,
  ram          VARCHAR(100)     NOT NULL,
  storage      VARCHAR(100)     NOT NULL,
  motherboard  VARCHAR(100)     NOT NULL,
  psu          VARCHAR(100)     NOT NULL,
  `case`       VARCHAR(100)     NOT NULL,   -- `case` é palavra reservada no MySQL

  -- cópia em JSON mantida por compatibilidade com o módulo de fila
  -- original. É sempre derivada das colunas acima, nunca editada
  -- direto, então não existe segunda fonte de verdade.
  configuracao JSON            NOT NULL,

  -- vocabulário único de status do projeto
  status       ENUM('WAITING', 'BUILDING', 'COMPLETED', 'ERROR')
                                NOT NULL DEFAULT 'WAITING',

  created_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  started_at   DATETIME         NULL,   -- quando a Unity assumiu a build
  finished_at  DATETIME         NULL,   -- quando a build terminou (ok ou erro)

  -- unicidade do id público
  UNIQUE KEY uq_builds_build_id (build_id),

  -- índice da fila: lista por status em ordem de chegada (FIFO)
  -- e localiza a próxima build rapidamente
  INDEX idx_status_created (status, created_at, id)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Sobre a trava de "uma build por vez"
-- ------------------------------------------------------------
-- Não existe tabela de lock separada. A própria coluna `status`
-- combinada com transação (SELECT ... FOR UPDATE) garante isso:
-- ver claimNextBuild() em src/repository/mysql.build.repository.ts,
-- que impede duas builds BUILDING ao mesmo tempo mesmo que duas
-- requisições cheguem juntas.
