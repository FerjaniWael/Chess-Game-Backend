function expectedScore(playerRating, opponentRating) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function calculateElo(playerRating, opponentRating, score, kFactor = 32) {
  const expected = expectedScore(playerRating, opponentRating);
  const nextRating = playerRating + kFactor * (score - expected);
  return Math.round(nextRating);
}

module.exports = {
  calculateElo,
};
