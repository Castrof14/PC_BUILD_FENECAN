-- ============================================================
-- Banco de dados e tabela de montagens
-- Pessoa 3: Banco de dados e gerenciamento da fila
-- ============================================================

CREATE DATABASE IF NOT EXISTS montagens_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE montagens_db;

CREATE TABLE IF NOT EXISTS montagens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  visitante      VARCHAR(100)      NOT NULL,          -- nome/identificação do visitante
  configuracao   JSON              NOT NULL,           -- dados da montagem enviados pelo cliente
  status         ENUM('na_fila', 'em_execucao', 'concluida', 'erro')
                                   NOT NULL DEFAULT 'na_fila',
  criado_em      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  iniciado_em    DATETIME         NULL,
  finalizado_em  DATETIME         NULL,

  -- índice usado para ordenar a fila (FIFO) e localizar a próxima rapidamente
  INDEX idx_status_criado (status, criado_em)
) ENGINE=InnoDB;

-- Observação sobre a trava de "uma montagem por vez":
-- Não é necessária uma tabela extra de lock: a própria coluna `status`
-- combinada com transações (SELECT ... FOR UPDATE) garante isso.
-- Veja src/montagemService.js -> selecionarProximaMontagem().