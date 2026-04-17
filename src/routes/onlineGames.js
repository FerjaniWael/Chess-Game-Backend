const express = require('express');
const store = require('../data/store');

const onlineGamesRouter = express.Router();

function getAuthenticatedPlayerId(req) {
  return req.user && req.user.player_id ? Number(req.user.player_id) : null;
}

onlineGamesRouter.post('/', async (req, res) => {
  try {
    const playerId = getAuthenticatedPlayerId(req);
    if (!playerId) {
      return res.status(400).json({ message: 'Authenticated user has no linked player account.' });
    }

    const game = await store.createOnlineGame({ whitePlayerId: playerId });
    return res.status(201).json({ game });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

onlineGamesRouter.post('/find-match', async (req, res) => {
  try {
    const playerId = getAuthenticatedPlayerId(req);
    if (!playerId) {
      return res.status(400).json({ message: 'Authenticated user has no linked player account.' });
    }

    const game = await store.findOrCreateOnlineMatch({ playerId });
    return res.json({
      game,
      status: game.blackPlayerId ? 'matched' : 'queued',
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

onlineGamesRouter.get('/:id', async (req, res) => {
  const game = await store.getOnlineGameById(Number(req.params.id));
  if (!game) {
    return res.status(404).json({ message: 'Online game not found.' });
  }

  return res.json({ game });
});

onlineGamesRouter.post('/:id/join', async (req, res) => {
  try {
    const playerId = getAuthenticatedPlayerId(req);
    if (!playerId) {
      return res.status(400).json({ message: 'Authenticated user has no linked player account.' });
    }

    const game = await store.joinOnlineGame({ gameId: Number(req.params.id), playerId });
    return res.json({ game });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

module.exports = onlineGamesRouter;
