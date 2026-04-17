const { Chess } = require('chess.js');
const store = require('../data/store');

function createRoomId(gameId) {
  return `online-game:${gameId}`;
}

function resolvePlayerColor(game, playerId) {
  if (game.whitePlayerId === playerId) {
    return 'w';
  }
  if (game.blackPlayerId === playerId) {
    return 'b';
  }
  return null;
}

function normalizeWinner(gameEngine) {
  if (gameEngine.isCheckmate()) {
    return gameEngine.turn() === 'w' ? 'black' : 'white';
  }
  if (gameEngine.isDraw()) {
    return 'draw';
  }
  return null;
}

function registerOnlineSocket(io) {
  io.on('connection', (socket) => {
    const user = socket.request.user;
    const playerId = user && user.player_id ? Number(user.player_id) : null;

    if (!playerId) {
      socket.emit('online-game:error', { message: 'Authenticated player account is required.' });
      return;
    }

    socket.on('online-game:join', async ({ gameId }) => {
      try {
        const numericGameId = Number(gameId);
        if (!numericGameId) {
          socket.emit('online-game:error', { message: 'Invalid online game id.' });
          return;
        }

        let game = await store.getOnlineGameById(numericGameId);
        if (!game) {
          socket.emit('online-game:error', { message: 'Online game not found.' });
          return;
        }

        const currentColor = resolvePlayerColor(game, playerId);
        if (!currentColor) {
          game = await store.joinOnlineGame({ gameId: numericGameId, playerId });
        }

        const updatedColor = resolvePlayerColor(game, playerId);
        if (!updatedColor) {
          socket.emit('online-game:error', { message: 'Failed to join online game.' });
          return;
        }

        socket.join(createRoomId(numericGameId));
        socket.emit('online-game:joined', {
          game,
          yourColor: updatedColor === 'w' ? 'white' : 'black',
        });

        io.to(createRoomId(numericGameId)).emit('online-game:update', {
          game,
        });
      } catch (error) {
        socket.emit('online-game:error', { message: error.message });
      }
    });

    socket.on('online-game:move', async ({ gameId, from, to, promotion = 'q' }) => {
      try {
        const numericGameId = Number(gameId);
        if (!numericGameId) {
          socket.emit('online-game:error', { message: 'Invalid online game id.' });
          return;
        }

        const game = await store.getOnlineGameById(numericGameId);
        if (!game) {
          socket.emit('online-game:error', { message: 'Online game not found.' });
          return;
        }

        if (game.status === 'finished') {
          socket.emit('online-game:error', { message: 'Online game already finished.' });
          return;
        }

        if (!game.blackPlayerId) {
          socket.emit('online-game:error', { message: 'Waiting for opponent to join.' });
          return;
        }

        const playerColor = resolvePlayerColor(game, playerId);
        if (!playerColor) {
          socket.emit('online-game:error', { message: 'You are not a participant in this game.' });
          return;
        }

        if (game.turn !== playerColor) {
          socket.emit('online-game:error', { message: 'It is not your turn.' });
          return;
        }

        const engine = new Chess(game.fen);
        const move = engine.move({ from, to, promotion });
        if (!move) {
          socket.emit('online-game:error', { message: 'Illegal move.' });
          return;
        }

        const winner = normalizeWinner(engine);
        const status = winner ? 'finished' : 'active';
        const updatedGame = await store.updateOnlineGameState({
          gameId: numericGameId,
          fen: engine.fen(),
          turn: engine.turn(),
          status,
          winner,
          pgn: engine.pgn(),
        });

        io.to(createRoomId(numericGameId)).emit('online-game:update', {
          game: updatedGame,
          lastMove: {
            from: move.from,
            to: move.to,
            san: move.san,
          },
        });
      } catch (error) {
        socket.emit('online-game:error', { message: error.message });
      }
    });
  });
}

module.exports = {
  registerOnlineSocket,
};
