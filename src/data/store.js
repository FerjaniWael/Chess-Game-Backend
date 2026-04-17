const { calculateElo } = require('../utils/rating');
const { query, execute, withTransaction } = require('../config/database');
const { Chess } = require('chess.js');

const RANDOM_NAMES = [
  'Magnus',
  'Hikaru',
  'Alireza',
  'Anand',
  'Judith',
  'Karpov',
  'Kasparov',
  'Polgar',
  'Mikhail',
  'Tal',
  'Fischer',
  'Capablanca',
];

const RANDOM_COUNTRIES = [
  'Norway',
  'India',
  'USA',
  'France',
  'Hungary',
  'Russia',
  'Cuba',
  'China',
  'Brazil',
  'Germany',
];

const TRAINING_LEVELS = {
  easy: { label: 'Easy', rating: 900, kFactor: 20 },
  medium: { label: 'Medium', rating: 1300, kFactor: 28 },
  hard: { label: 'Hard', rating: 1700, kFactor: 36 },
};

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function mapPlayer(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    country: row.country,
    type: row.type,
    level: row.level,
    rating: row.rating,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function mapMatch(row) {
  if (!row) {
    return null;
  }

  const match = {
    id: row.id,
    whitePlayerId: row.white_player_id,
    blackPlayerId: row.black_player_id,
    mode: row.mode,
    level: row.level,
    result: row.result,
    pgn: row.pgn,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at,
  };

  if (row.mode === 'training' && row.training_human_player_id) {
    match.training = {
      humanPlayerId: row.training_human_player_id,
      computerPlayerId: row.training_computer_player_id,
      humanColor: row.training_human_color,
    };
  }

  if (row.white_rating_before !== null && row.black_rating_before !== null) {
    match.ratingChange = {
      white: {
        before: row.white_rating_before,
        after: row.white_rating_after,
      },
      black: {
        before: row.black_rating_before,
        after: row.black_rating_after,
      },
    };
  }

  return match;
}

function mapOnlineGame(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    whitePlayerId: row.white_player_id,
    blackPlayerId: row.black_player_id,
    fen: row.fen,
    turn: row.turn,
    status: row.status,
    winner: row.winner,
    pgn: row.pgn,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    finishedAt: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at,
  };
}

async function listPlayers() {
  const rows = await query('SELECT * FROM players ORDER BY id ASC');
  return rows.map(mapPlayer);
}

async function getPlayerById(id) {
  const rows = await query('SELECT * FROM players WHERE id = ? LIMIT 1', [id]);
  return mapPlayer(rows[0]);
}

async function getPlayerByUserId(userId) {
  const rows = await query('SELECT * FROM players WHERE user_id = ? LIMIT 1', [userId]);
  return mapPlayer(rows[0]);
}

async function createPlayer({ name, country = 'Unknown', type = 'human', level = null, rating = 1200 }) {
  if (!name || typeof name !== 'string') {
    throw new Error('Player name is required.');
  }

  if (!['human', 'computer'].includes(type)) {
    throw new Error('Player type must be either human or computer.');
  }

  if (type === 'computer' && !TRAINING_LEVELS[level]) {
    throw new Error('Computer player requires a valid level (easy/medium/hard).');
  }

  const normalizedLevel = type === 'computer' ? level : null;
  const result = await execute(
    'INSERT INTO players (name, country, type, level, rating) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), country, type, normalizedLevel, Number(rating)],
  );

  return getPlayerById(result.insertId);
}

async function ensureAtLeastTwoHumans() {
  const humans = await query("SELECT * FROM players WHERE type = 'human' ORDER BY id ASC");
  while (humans.length < 2) {
    const player = await createPlayer({
      name: `${randomItem(RANDOM_NAMES)} ${Math.floor(100 + Math.random() * 900)}`,
      country: randomItem(RANDOM_COUNTRIES),
      type: 'human',
      rating: 1000 + Math.floor(Math.random() * 500),
    });
    humans.push({
      id: player.id,
      name: player.name,
      country: player.country,
      type: player.type,
      level: player.level,
      rating: player.rating,
      created_at: player.createdAt,
    });
  }

  return humans.map(mapPlayer);
}

async function listMatches() {
  const rows = await query('SELECT * FROM matches ORDER BY id DESC');
  return rows.map(mapMatch);
}

async function getMatchById(id) {
  const rows = await query('SELECT * FROM matches WHERE id = ? LIMIT 1', [id]);
  return mapMatch(rows[0]);
}

async function createMatch({ whitePlayerId, blackPlayerId, mode = 'versus', level = null }) {
  if (whitePlayerId === blackPlayerId) {
    throw new Error('White and black players must be different.');
  }

  const white = await getPlayerById(whitePlayerId);
  const black = await getPlayerById(blackPlayerId);

  if (!white || !black) {
    throw new Error('Both players must exist.');
  }

  const result = await execute(
    'INSERT INTO matches (white_player_id, black_player_id, mode, level, result, pgn) VALUES (?, ?, ?, ?, ?, ?)',
    [whitePlayerId, blackPlayerId, mode, level, 'pending', null],
  );

  return getMatchById(result.insertId);
}

function listTrainingLevels() {
  return Object.entries(TRAINING_LEVELS).map(([key, value]) => ({
    key,
    label: value.label,
    estimatedRating: value.rating,
  }));
}

function getTrainingConfig(level) {
  const config = TRAINING_LEVELS[level];
  if (!config) {
    throw new Error('Training level must be easy, medium, or hard.');
  }

  return config;
}

async function getOrCreateComputer(level) {
  const config = getTrainingConfig(level);
  const rows = await query(
    "SELECT * FROM players WHERE type = 'computer' AND level = ? LIMIT 1",
    [level],
  );
  const existing = mapPlayer(rows[0]);
  if (existing) {
    return existing;
  }

  return createPlayer({
    name: `Bot ${config.label}`,
    country: 'Engine',
    type: 'computer',
    level,
    rating: config.rating,
  });
}

async function createTrainingMatch({ humanPlayerId, level, humanColor = 'white' }) {
  if (!['white', 'black'].includes(humanColor)) {
    throw new Error('Human color must be white or black.');
  }

  const human = await getPlayerById(humanPlayerId);
  if (!human || human.type !== 'human') {
    throw new Error('Human player must exist and have type human.');
  }

  const computer = await getOrCreateComputer(level);

  const match = await createMatch({
    whitePlayerId: humanColor === 'white' ? human.id : computer.id,
    blackPlayerId: humanColor === 'black' ? human.id : computer.id,
    mode: 'training',
    level,
  });

  await execute(
    `
      UPDATE matches
      SET training_human_player_id = ?,
          training_computer_player_id = ?,
          training_human_color = ?
      WHERE id = ?
    `,
    [human.id, computer.id, humanColor, match.id],
  );

  return getMatchById(match.id);
}

async function listTrainingMatches() {
  const rows = await query("SELECT * FROM matches WHERE mode = 'training' ORDER BY id DESC");
  return rows.map(mapMatch);
}

async function createRandomVersusMatch() {
  const humans = await ensureAtLeastTwoHumans();
  const first = randomItem(humans);
  let second = randomItem(humans);

  while (second.id === first.id) {
    second = randomItem(humans);
  }

  return createMatch({
    whitePlayerId: first.id,
    blackPlayerId: second.id,
    mode: 'versus',
  });
}

async function finalizeMatch({ matchId, result, pgn = null }) {
  if (!['white', 'black', 'draw'].includes(result)) {
    throw new Error('Result must be white, black, or draw.');
  }

  await withTransaction(async (connection) => {
    const [matchRows] = await connection.execute('SELECT * FROM matches WHERE id = ? LIMIT 1 FOR UPDATE', [matchId]);
    const match = matchRows[0];
    if (!match) {
      throw new Error('Match not found.');
    }

    if (match.result !== 'pending') {
      throw new Error('Match result is already finalized.');
    }

    const [playerRows] = await connection.execute(
      'SELECT * FROM players WHERE id IN (?, ?) FOR UPDATE',
      [match.white_player_id, match.black_player_id],
    );

    const white = playerRows.find((player) => player.id === match.white_player_id);
    const black = playerRows.find((player) => player.id === match.black_player_id);
    if (!white || !black) {
      throw new Error('Players for this match are invalid.');
    }

    const whiteScore = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
    const blackScore = result === 'black' ? 1 : result === 'draw' ? 0.5 : 0;

    const whiteBefore = white.rating;
    const blackBefore = black.rating;
    const whiteK = white.type === 'computer' ? getTrainingConfig(white.level).kFactor : 32;
    const blackK = black.type === 'computer' ? getTrainingConfig(black.level).kFactor : 32;

    const whiteAfter = calculateElo(white.rating, black.rating, whiteScore, whiteK);
    const blackAfter = calculateElo(black.rating, whiteBefore, blackScore, blackK);

    await connection.execute('UPDATE players SET rating = ? WHERE id = ?', [whiteAfter, white.id]);
    await connection.execute('UPDATE players SET rating = ? WHERE id = ?', [blackAfter, black.id]);

    await connection.execute(
      `
        UPDATE matches
        SET result = ?,
            pgn = ?,
            finished_at = CURRENT_TIMESTAMP,
            white_rating_before = ?,
            white_rating_after = ?,
            black_rating_before = ?,
            black_rating_after = ?
        WHERE id = ?
      `,
      [result, pgn, whiteBefore, whiteAfter, blackBefore, blackAfter, matchId],
    );
  });

  return getMatchById(matchId);
}

async function finalizeTrainingMatch({ matchId, result, pgn = null }) {
  const match = await getMatchById(matchId);
  if (!match) {
    throw new Error('Match not found.');
  }

  if (match.mode !== 'training') {
    throw new Error('Match is not a training match.');
  }

  return finalizeMatch({ matchId, result, pgn });
}

async function getMondialRankings() {
  const rows = await query(
    `
      SELECT
        p.id,
        p.name,
        p.country,
        p.rating,
        p.type,
        p.level,
        COUNT(CASE WHEN m.result <> 'pending' THEN 1 END) AS matches_played
      FROM players p
      LEFT JOIN matches m
        ON m.white_player_id = p.id OR m.black_player_id = p.id
      GROUP BY p.id, p.name, p.country, p.rating, p.type, p.level
      ORDER BY p.rating DESC, p.id ASC
    `,
  );

  return rows.map((player, index) => ({
    rank: index + 1,
    playerId: player.id,
    name: player.name,
    country: player.country,
    rating: player.rating,
    type: player.type,
    level: player.level,
    matchesPlayed: Number(player.matches_played),
  }));
}

async function getOnlineGameById(id) {
  const rows = await query('SELECT * FROM online_games WHERE id = ? LIMIT 1', [id]);
  return mapOnlineGame(rows[0]);
}

async function createOnlineGame({ whitePlayerId }) {
  const white = await getPlayerById(whitePlayerId);
  if (!white || white.type !== 'human') {
    throw new Error('White player must be an existing human player.');
  }

  const initialFen = new Chess().fen();
  const insert = await execute(
    `
      INSERT INTO online_games (white_player_id, black_player_id, fen, turn, status, winner, pgn)
      VALUES (?, NULL, ?, 'w', 'waiting', NULL, NULL)
    `,
    [whitePlayerId, initialFen],
  );

  return getOnlineGameById(insert.insertId);
}

async function findOrCreateOnlineMatch({ playerId }) {
  const player = await getPlayerById(playerId);
  if (!player || player.type !== 'human') {
    throw new Error('Matchmaking player must be an existing human player.');
  }

  return withTransaction(async (connection) => {
    const [existingRows] = await connection.execute(
      `
        SELECT *
        FROM online_games
        WHERE status IN ('waiting', 'active')
          AND (white_player_id = ? OR black_player_id = ?)
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `,
      [playerId, playerId],
    );

    const existing = existingRows[0];
    if (existing) {
      return mapOnlineGame(existing);
    }

    const [waitingRows] = await connection.execute(
      `
        SELECT *
        FROM online_games
        WHERE status = 'waiting'
          AND black_player_id IS NULL
          AND white_player_id <> ?
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        FOR UPDATE
      `,
      [playerId],
    );

    const waiting = waitingRows[0];
    if (waiting) {
      await connection.execute(
        `
          UPDATE online_games
          SET black_player_id = ?,
              status = 'active'
          WHERE id = ?
        `,
        [playerId, waiting.id],
      );

      const [updatedRows] = await connection.execute(
        'SELECT * FROM online_games WHERE id = ? LIMIT 1',
        [waiting.id],
      );
      return mapOnlineGame(updatedRows[0]);
    }

    const initialFen = new Chess().fen();
    const [insertResult] = await connection.execute(
      `
        INSERT INTO online_games (white_player_id, black_player_id, fen, turn, status, winner, pgn)
        VALUES (?, NULL, ?, 'w', 'waiting', NULL, NULL)
      `,
      [playerId, initialFen],
    );

    const [createdRows] = await connection.execute(
      'SELECT * FROM online_games WHERE id = ? LIMIT 1',
      [insertResult.insertId],
    );

    return mapOnlineGame(createdRows[0]);
  });
}

async function joinOnlineGame({ gameId, playerId }) {
  return withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      'SELECT * FROM online_games WHERE id = ? LIMIT 1 FOR UPDATE',
      [gameId],
    );

    const game = rows[0];
    if (!game) {
      throw new Error('Online game not found.');
    }

    if (game.status === 'finished') {
      throw new Error('Online game already finished.');
    }

    if (game.white_player_id === playerId || game.black_player_id === playerId) {
      return mapOnlineGame(game);
    }

    if (game.black_player_id) {
      throw new Error('Online game is full.');
    }

    await connection.execute(
      `
        UPDATE online_games
        SET black_player_id = ?,
            status = 'active'
        WHERE id = ?
      `,
      [playerId, gameId],
    );

    const [updatedRows] = await connection.execute('SELECT * FROM online_games WHERE id = ? LIMIT 1', [gameId]);
    return mapOnlineGame(updatedRows[0]);
  });
}

async function updateOnlineGameState({ gameId, fen, turn, status, winner = null, pgn = null }) {
  await execute(
    `
      UPDATE online_games
      SET fen = ?,
          turn = ?,
          status = ?,
          winner = ?,
          pgn = ?,
          finished_at = CASE WHEN ? = 'finished' THEN CURRENT_TIMESTAMP ELSE finished_at END
      WHERE id = ?
    `,
    [fen, turn, status, winner, pgn, status, gameId],
  );

  const game = await getOnlineGameById(gameId);
  if (game && status === 'finished' && game.whitePlayerId && game.blackPlayerId) {
    const result = winner === 'white' ? 'white' : winner === 'black' ? 'black' : 'draw';
    await withTransaction(async (connection) => {
      const [players] = await connection.execute(
        'SELECT * FROM players WHERE id IN (?, ?) FOR UPDATE',
        [game.whitePlayerId, game.blackPlayerId],
      );

      const white = players.find((player) => player.id === game.whitePlayerId);
      const black = players.find((player) => player.id === game.blackPlayerId);
      if (!white || !black) {
        return;
      }

      const whiteScore = result === 'white' ? 1 : result === 'draw' ? 0.5 : 0;
      const blackScore = result === 'black' ? 1 : result === 'draw' ? 0.5 : 0;

      const whiteAfter = calculateElo(white.rating, black.rating, whiteScore, 32);
      const blackAfter = calculateElo(black.rating, white.rating, blackScore, 32);

      await connection.execute('UPDATE players SET rating = ? WHERE id = ?', [whiteAfter, white.id]);
      await connection.execute('UPDATE players SET rating = ? WHERE id = ?', [blackAfter, black.id]);
    });
  }

  return game;
}

module.exports = {
  listPlayers,
  getPlayerById,
  getPlayerByUserId,
  createPlayer,
  listMatches,
  getMatchById,
  createMatch,
  listTrainingLevels,
  createTrainingMatch,
  listTrainingMatches,
  createRandomVersusMatch,
  finalizeMatch,
  finalizeTrainingMatch,
  getMondialRankings,
  getOnlineGameById,
  createOnlineGame,
  findOrCreateOnlineMatch,
  joinOnlineGame,
  updateOnlineGameState,
};
