const express = require('express');
const store = require('../data/store');

const matchesRouter = express.Router();

matchesRouter.get('/', async (req, res) => {
  const matches = await store.listMatches();
  res.json({ matches });
});

matchesRouter.get('/:id', async (req, res) => {
  const match = await store.getMatchById(Number(req.params.id));
  if (!match) {
    return res.status(404).json({ message: 'Match not found.' });
  }

  return res.json({ match });
});

matchesRouter.post('/', async (req, res) => {
  try {
    const { whitePlayerId, blackPlayerId, mode, level } = req.body;
    const match = await store.createMatch({
      whitePlayerId: Number(whitePlayerId),
      blackPlayerId: Number(blackPlayerId),
      mode,
      level,
    });
    return res.status(201).json({ match });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

matchesRouter.post('/random', async (req, res) => {
  const match = await store.createRandomVersusMatch();
  return res.status(201).json({ match });
});

matchesRouter.post('/:id/result', async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { result, pgn } = req.body;
    const match = await store.finalizeMatch({ matchId, result, pgn });
    return res.json({ match });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

module.exports = matchesRouter;
