const express = require('express');
const store = require('../data/store');

const playersRouter = express.Router();

playersRouter.get('/', async (req, res) => {
  const players = await store.listPlayers();
  res.json({ players });
});

playersRouter.get('/:id', async (req, res) => {
  const player = await store.getPlayerById(Number(req.params.id));
  if (!player) {
    return res.status(404).json({ message: 'Player not found.' });
  }

  return res.json({ player });
});

playersRouter.post('/', async (req, res) => {
  try {
    const { name, country, type, level, rating } = req.body;
    const player = await store.createPlayer({ name, country, type, level, rating });
    return res.status(201).json({ player });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

module.exports = playersRouter;
