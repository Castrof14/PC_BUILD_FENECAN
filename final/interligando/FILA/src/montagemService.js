// montagemService.js
// Regras de negócio da fila de montagens.
// Cada função abaixo corresponde a um item da lista de responsabilidades
// da Pessoa 3.

const pool = require('./db');

// ------------------------------------------------------------------
// 1) Salvar cada configuração recebida
// ------------------------------------------------------------------
async function salvarMontagem(visitante, configuracao) {
  const [result] = await pool.query(
    `INSERT INTO montagens (visitante, configuracao, status)
     VALUES (?, ?, 'na_fila')`,
    [visitante, JSON.stringify(configuracao)]
  );
  return buscarMontagemPorId(result.insertId);
}

// ------------------------------------------------------------------
// Busca simples por id (usada internamente e pelas rotas)
// ------------------------------------------------------------------
async function buscarMontagemPorId(id) {
  const [rows] = await pool.query('SELECT * FROM montagens WHERE id = ?', [id]);
  return rows[0] || null;
}

// ------------------------------------------------------------------
// 2) Definir a ordem da fila
//    Ordem = FIFO por data de criação (quem chegou primeiro, roda primeiro)
// ------------------------------------------------------------------
async function listarFila() {
  const [rows] = await pool.query(
    `SELECT id, visitante, status, criado_em, iniciado_em, finalizado_em
     FROM montagens
     WHERE status IN ('na_fila', 'em_execucao')
     ORDER BY FIELD(status, 'em_execucao', 'na_fila'), criado_em ASC, id ASC`
  );
  return rows;
}

// ------------------------------------------------------------------
// 3) Selecionar a próxima montagem
// 4) Mecanismo básico para evitar duas montagens simultâneas
//
//    Tudo isso acontece dentro de UMA transação com SELECT ... FOR UPDATE,
//    que trava as linhas envolvidas até o commit. Assim, se o servidor
//    Unity (ou duas chamadas concorrentes) pedirem "próxima montagem" ao
//    mesmo tempo, apenas uma delas consegue de fato iniciar uma montagem;
//    a outra recebe null.
// ------------------------------------------------------------------
async function selecionarProximaMontagem() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Trava: existe alguma montagem em execução agora?
    const [emExecucao] = await conn.query(
      `SELECT id FROM montagens WHERE status = 'em_execucao' LIMIT 1 FOR UPDATE`
    );

    if (emExecucao.length > 0) {
      // Já tem uma montagem rodando -> não libera outra.
      await conn.commit();
      return null;
    }

    // Pega a próxima da fila (mais antiga), travando a linha.
    // SKIP LOCKED evita que a query fique esperando outra transação concorrente.
    const [rows] = await conn.query(
      `SELECT * FROM montagens
       WHERE status = 'na_fila'
       ORDER BY criado_em ASC, id ASC
       LIMIT 1 FOR UPDATE SKIP LOCKED`
    );

    if (rows.length === 0) {
      await conn.commit();
      return null; // fila vazia
    }

    const proxima = rows[0];

    await conn.query(
      `UPDATE montagens SET status = 'em_execucao', iniciado_em = NOW() WHERE id = ?`,
      [proxima.id]
    );

    await conn.commit();
    return buscarMontagemPorId(proxima.id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ------------------------------------------------------------------
// 5) Atualizar o status quando a Unity começar
//    (normalmente já é feito dentro de selecionarProximaMontagem, mas
//    fica disponível separadamente caso o fluxo de vocês precise
//    confirmar o início em uma chamada própria da Unity)
// ------------------------------------------------------------------
async function marcarInicio(id) {
  const [result] = await pool.query(
    `UPDATE montagens
     SET status = 'em_execucao', iniciado_em = NOW()
     WHERE id = ? AND status = 'na_fila'`,
    [id]
  );
  if (result.affectedRows === 0) {
    throw new Error('Montagem não encontrada ou não está na fila.');
  }
  return buscarMontagemPorId(id);
}

// ------------------------------------------------------------------
// 6) Atualizar o status quando a Unity terminar
// ------------------------------------------------------------------
async function marcarFim(id, sucesso = true) {
  const novoStatus = sucesso ? 'concluida' : 'erro';
  const [result] = await pool.query(
    `UPDATE montagens
     SET status = ?, finalizado_em = NOW()
     WHERE id = ? AND status = 'em_execucao'`,
    [novoStatus, id]
  );
  if (result.affectedRows === 0) {
    throw new Error('Montagem não encontrada ou não estava em execução.');
  }
  return buscarMontagemPorId(id);
}

// ------------------------------------------------------------------
// 7) Informar a posição de cada visitante na fila
//    posição 0 = já está em execução / concluída
// ------------------------------------------------------------------
async function posicaoNaFila(id) {
  const montagem = await buscarMontagemPorId(id);
  if (!montagem) return null;

  if (montagem.status !== 'na_fila') {
    return { id, status: montagem.status, posicao: 0 };
  }

  const [[{ posicao }]] = await pool.query(
    `SELECT COUNT(*) AS posicao
     FROM montagens
     WHERE status = 'na_fila'
       AND (criado_em < ? OR (criado_em = ? AND id <= ?))`,
    [montagem.criado_em, montagem.criado_em, id]
  );

  return { id, status: montagem.status, posicao };
}

module.exports = {
  salvarMontagem,
  buscarMontagemPorId,
  listarFila,
  selecionarProximaMontagem,
  marcarInicio,
  marcarFim,
  posicaoNaFila,
};