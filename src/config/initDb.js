const { query, execute } = require('./database');

async function createTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(190) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      provider ENUM('google') NOT NULL,
      provider_id VARCHAR(190) NOT NULL,
      avatar_url TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME NULL,
      UNIQUE KEY uniq_user_email (email),
      UNIQUE KEY uniq_provider_account (provider, provider_id)
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS players (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(120) NOT NULL,
      country VARCHAR(80) NOT NULL DEFAULT 'Unknown',
      type ENUM('human', 'computer') NOT NULL,
      level ENUM('easy', 'medium', 'hard') NULL,
      rating INT NOT NULL DEFAULT 1200,
      user_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_player_level CHECK (
        (type = 'computer' AND level IS NOT NULL) OR (type = 'human')
      ),
      UNIQUE KEY uniq_computer_level (type, level),
      UNIQUE KEY uniq_player_user (user_id),
      CONSTRAINT fk_player_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS matches (
      id INT PRIMARY KEY AUTO_INCREMENT,
      white_player_id INT NOT NULL,
      black_player_id INT NOT NULL,
      mode ENUM('versus', 'training') NOT NULL DEFAULT 'versus',
      level ENUM('easy', 'medium', 'hard') NULL,
      result ENUM('pending', 'white', 'black', 'draw') NOT NULL DEFAULT 'pending',
      pgn TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      training_human_player_id INT NULL,
      training_computer_player_id INT NULL,
      training_human_color ENUM('white', 'black') NULL,
      white_rating_before INT NULL,
      white_rating_after INT NULL,
      black_rating_before INT NULL,
      black_rating_after INT NULL,
      CONSTRAINT fk_match_white FOREIGN KEY (white_player_id) REFERENCES players(id),
      CONSTRAINT fk_match_black FOREIGN KEY (black_player_id) REFERENCES players(id),
      CONSTRAINT fk_training_human FOREIGN KEY (training_human_player_id) REFERENCES players(id),
      CONSTRAINT fk_training_computer FOREIGN KEY (training_computer_player_id) REFERENCES players(id),
      CONSTRAINT chk_players_distinct CHECK (white_player_id <> black_player_id)
    ) ENGINE=InnoDB;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS online_games (
      id INT PRIMARY KEY AUTO_INCREMENT,
      white_player_id INT NOT NULL,
      black_player_id INT NULL,
      fen VARCHAR(200) NOT NULL,
      turn ENUM('w', 'b') NOT NULL DEFAULT 'w',
      status ENUM('waiting', 'active', 'finished') NOT NULL DEFAULT 'waiting',
      winner ENUM('white', 'black', 'draw') NULL,
      pgn TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      CONSTRAINT fk_online_white FOREIGN KEY (white_player_id) REFERENCES players(id),
      CONSTRAINT fk_online_black FOREIGN KEY (black_player_id) REFERENCES players(id),
      CONSTRAINT chk_online_distinct CHECK (black_player_id IS NULL OR white_player_id <> black_player_id)
    ) ENGINE=InnoDB;
  `);

  const userIdColumn = await query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'players'
        AND COLUMN_NAME = 'user_id'
      LIMIT 1
    `,
  );

  if (userIdColumn.length === 0) {
    await query('ALTER TABLE players ADD COLUMN user_id INT NULL');
  }

  const uniqueKey = await query(
    `
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'players'
        AND CONSTRAINT_TYPE = 'UNIQUE'
        AND CONSTRAINT_NAME = 'uniq_player_user'
      LIMIT 1
    `,
  );

  if (uniqueKey.length === 0) {
    await query('ALTER TABLE players ADD CONSTRAINT uniq_player_user UNIQUE (user_id)');
  }

  const fkKey = await query(
    `
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = 'fk_player_user'
      LIMIT 1
    `,
  );

  if (fkKey.length === 0) {
    await query('ALTER TABLE players ADD CONSTRAINT fk_player_user FOREIGN KEY (user_id) REFERENCES users(id)');
  }

  const onlineFenColumn = await query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'online_games'
        AND COLUMN_NAME = 'fen'
      LIMIT 1
    `,
  );

  if (onlineFenColumn.length === 0) {
    await query(
      "ALTER TABLE online_games ADD COLUMN fen VARCHAR(200) NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'",
    );
    await query(
      "UPDATE online_games SET fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' WHERE fen = ''",
    );
  }
}

async function seedPlayers() {
  const rows = await query('SELECT COUNT(*) AS total FROM players');
  if (rows[0].total > 0) {
    return;
  }

  const seed = [
    ['Ariane', 'France', 'human', null, 1325],
    ['Mateo', 'Spain', 'human', null, 1270],
    ['Noah', 'USA', 'human', null, 1210],
    ['Nadia', 'India', 'human', null, 1360],
  ];

  for (const [name, country, type, level, rating] of seed) {
    await execute(
      'INSERT INTO players (name, country, type, level, rating) VALUES (?, ?, ?, ?, ?)',
      [name, country, type, level, rating],
    );
  }
}

async function initDatabase() {
  await createTables();
  await seedPlayers();
}

module.exports = {
  initDatabase,
};
