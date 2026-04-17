require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const { Server } = require('socket.io');
const playersRouter = require('./routes/players');
const matchesRouter = require('./routes/matches');
const rankingsRouter = require('./routes/rankings');
const trainingRouter = require('./routes/training');
const onlineGamesRouter = require('./routes/onlineGames');
const authRouter = require('./routes/auth');
const { ensureAuthenticated } = require('./middleware/auth');
const { initDatabase } = require('./config/initDb');
const { dbConfig } = require('./config/database');
const { passport, setupPassport } = require('./config/passport');
const { registerOnlineSocket } = require('./socket/onlineSocket');

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret';
const MySQLStore = MySQLStoreFactory(session);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
});

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'chess-backend' });
});

function wrapMiddleware(middleware) {
  return (socket, next) => {
    middleware(socket.request, {}, next);
  };
}

async function startServer() {
  try {
    await initDatabase();

    const sessionStore = new MySQLStore(
      {
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        database: dbConfig.database,
        createDatabaseTable: true,
        schema: {
          tableName: 'sessions',
          columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data',
          },
        },
      },
    );

    const sessionMiddleware = session({
      key: 'chess.sid',
      secret: SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      },
    });

    app.use(sessionMiddleware);

    setupPassport();
    app.use(passport.initialize());
    app.use(passport.session());

    io.use(wrapMiddleware(sessionMiddleware));
    io.use(wrapMiddleware(passport.initialize()));
    io.use(wrapMiddleware(passport.session()));

    registerOnlineSocket(io);

    app.use('/api/auth', authRouter);

    app.use('/api/players', ensureAuthenticated, playersRouter);
    app.use('/api/matches', ensureAuthenticated, matchesRouter);
    app.use('/api/rankings', ensureAuthenticated, rankingsRouter);
    app.use('/api/training', ensureAuthenticated, trainingRouter);
    app.use('/api/online-games', ensureAuthenticated, onlineGamesRouter);

    server.listen(PORT, () => {
      console.log(`Chess backend running on http://localhost:${PORT}`);
      console.log(
        `MySQL connected: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
      );
    });
  } catch (error) {
    console.error('Failed to initialize backend:', error.message);
    process.exit(1);
  }
}

startServer();
