const express = require('express');
const store = require('../data/store');

const trainingRouter = express.Router();

trainingRouter.get('/levels', async (req, res) => {
  const levels = await store.listTrainingLevels();
  res.json({ levels });
});

trainingRouter.get('/matches', async (req, res) => {
  const matches = await store.listTrainingMatches();
  res.json({ matches });
});

trainingRouter.post('/matches', async (req, res) => {
  try {
    const { humanPlayerId, level, humanColor } = req.body;
    const match = await store.createTrainingMatch({
      humanPlayerId: Number(humanPlayerId),
      level,
      humanColor,
    });
    return res.status(201).json({ match });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

trainingRouter.post('/matches/:id/result', async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { result, pgn } = req.body;
    const match = await store.finalizeTrainingMatch({ matchId, result, pgn });
    return res.json({ match });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

module.exports = trainingRouter;
