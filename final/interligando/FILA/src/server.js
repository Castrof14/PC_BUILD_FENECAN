// server.js
// API REST que expõe a fila de montagens para:
//  - quem recebe a configuração do visitante (ex: totem/frontend)
//  - a integração com a Unity (que consome a fila e reporta início/fim)

const express = require('express');
const montagemService = require('./montagemService');

const app = express();
app.use(express.json());

// ----------------------------------------------------------------
// Criar/salvar uma nova montagem (chamado quando o visitante confirma
// sua configuração)
// POST /montagens  { "visitante": "João", "configuracao": {...} }
// ----------------------------------------------------------------
app.post('/montagens', async (req, res) => {
  try {
    const { visitante, configuracao } = req.body;
    if (!visitante || !configuracao) {
      return res.status(400).json({ erro: 'visitante e configuracao são obrigatórios' });
    }
    const montagem = await montagemService.salvarMontagem(visitante, configuracao);
    const posicao = await montagemService.posicaoNaFila(montagem.id);
    res.status(201).json({ montagem, posicao: posicao.posicao });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar montagem' });
  }
});

// ----------------------------------------------------------------
// Consultar uma montagem específica
// GET /montagens/:id
// ----------------------------------------------------------------
app.get('/montagens/:id', async (req, res) => {
  const montagem = await montagemService.buscarMontagemPorId(req.params.id);
  if (!montagem) return res.status(404).json({ erro: 'Montagem não encontrada' });
  res.json(montagem);
});

// ----------------------------------------------------------------
// Posição do visitante na fila
// GET /montagens/:id/posicao
// ----------------------------------------------------------------
app.get('/montagens/:id/posicao', async (req, res) => {
  const posicao = await montagemService.posicaoNaFila(req.params.id);
  if (!posicao) return res.status(404).json({ erro: 'Montagem não encontrada' });
  res.json(posicao);
});

// ----------------------------------------------------------------
// Listar a fila inteira (útil para telas de acompanhamento)
// GET /fila
// ----------------------------------------------------------------
app.get('/fila', async (req, res) => {
  const fila = await montagemService.listarFila();
  res.json(fila);
});

// ----------------------------------------------------------------
// Unity pede a próxima montagem a ser executada.
// Essa chamada já marca a montagem como 'em_execucao' e garante,
// via transação no banco, que nenhuma outra montagem seja liberada
// ao mesmo tempo.
// POST /fila/proxima
// ----------------------------------------------------------------
app.post('/fila/proxima', async (req, res) => {
  try {
    const proxima = await montagemService.selecionarProximaMontagem();
    if (!proxima) {
      return res.status(204).send(); // nada disponível agora
    }
    res.json(proxima);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao selecionar próxima montagem' });
  }
});

// ----------------------------------------------------------------
// Unity confirma que terminou (com sucesso ou erro)
// POST /montagens/:id/finalizar   { "sucesso": true }
// ----------------------------------------------------------------
app.post('/montagens/:id/finalizar', async (req, res) => {
  try {
    const sucesso = req.body.sucesso !== false;
    const montagem = await montagemService.marcarFim(req.params.id, sucesso);
    res.json(montagem);
  } catch (err) {
    res.status(409).json({ erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API da fila de montagens rodando na porta ${PORT}`);
});