const mysql = require('mysql2/promise');

const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'chess_app';
const DB_SKIP_CREATE_DATABASE = process.env.DB_SKIP_CREATE_DATABASE === 'true';
const DB_SSL = process.env.DB_SSL === 'true';
const DB_SSL_REJECT_UNAUTHORIZED = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

let pool;

function parseDatabaseUrl() {
  if (!DATABASE_URL) {
    return null;
  }

  const parsed = new URL(DATABASE_URL);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || DB_NAME),
  };
}

const urlConfig = parseDatabaseUrl();
const connectionConfig = {
  host: urlConfig?.host || DB_HOST,
  port: urlConfig?.port || DB_PORT,
  user: urlConfig?.user || DB_USER,
  password: urlConfig?.password || DB_PASSWORD,
  database: urlConfig?.database || DB_NAME,
};

if (DB_SSL) {
  connectionConfig.ssl = {
    rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED,
  };
}

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

async function ensureDatabase() {
  if (DB_SKIP_CREATE_DATABASE) {
    return;
  }

  const serverConnection = await mysql.createConnection({
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    password: connectionConfig.password,
    multipleStatements: true,
    ssl: connectionConfig.ssl,
  });

  await serverConnection.query(
    `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(connectionConfig.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await serverConnection.end();
}

async function createPool() {
  if (!pool) {
    await ensureDatabase();
    pool = mysql.createPool({
      host: connectionConfig.host,
      port: connectionConfig.port,
      user: connectionConfig.user,
      password: connectionConfig.password,
      database: connectionConfig.database,
      ssl: connectionConfig.ssl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      namedPlaceholders: true,
    });
  }

  return pool;
}

async function query(sql, params = {}) {
  const activePool = await createPool();
  const [rows] = await activePool.query(sql, params);
  return rows;
}

async function execute(sql, params = {}) {
  const activePool = await createPool();
  const [result] = await activePool.execute(sql, params);
  return result;
}

async function withTransaction(callback) {
  const activePool = await createPool();
  const connection = await activePool.getConnection();
  try {
    await connection.beginTransaction();
    const value = await callback(connection);
    await connection.commit();
    return value;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createPool,
  query,
  execute,
  withTransaction,
  dbConfig: {
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
    password: connectionConfig.password,
    database: connectionConfig.database,
    ssl: connectionConfig.ssl,
  },
};
