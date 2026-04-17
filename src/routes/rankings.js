const express = require('express');
const store = require('../data/store');

const rankingsRouter = express.Router();

rankingsRouter.get('/mondial', async (req, res) => {
  const rankings = await store.getMondialRankings();
  res.json({ rankings });
});

module.exports = rankingsRouter;
