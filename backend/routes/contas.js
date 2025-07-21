const express = require('express');
const router = express.Router();
const Conta = require('../models/Conta');

// Criar nova conta
router.post('/', async (req, res) => {
  try {
    const conta = await Conta.create(req.body);
    res.json(conta);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Listar todas as contas
router.get('/', async (req, res) => {
  try {
    const contas = await Conta.findAll();
    res.json(contas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar conta e adicionar histórico
router.put('/:id', async (req, res) => {
  try {
    const conta = await Conta.findByPk(req.params.id);
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada' });

    // Pega o histórico atual e adiciona nova alteração
    const historico = JSON.parse(conta.historico || '[]');
    historico.push({ data: new Date(), alteracao: req.body });

    await conta.update({ ...req.body, historico: JSON.stringify(historico) });
    res.json(conta);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
