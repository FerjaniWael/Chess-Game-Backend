const express = require('express');
const { passport, authEnabled } = require('../config/passport');

const authRouter = express.Router();

function buildAuthPayload(user) {
  if (!user) {
    return { authenticated: false, user: null };
  }

  return {
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      player: user.player_id
        ? {
            id: user.player_id,
            name: user.player_name,
            country: user.player_country,
            rating: user.player_rating,
            type: user.player_type,
            level: user.player_level,
          }
        : null,
    },
  };
}

authRouter.get('/status', (req, res) => {
  res.json({ enabled: authEnabled() });
});

authRouter.get('/me', (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.json(buildAuthPayload(null));
  }

  return res.json(buildAuthPayload(req.user));
});

authRouter.get('/google', (req, res, next) => {
  if (!authEnabled()) {
    return res.status(503).json({ message: 'Google OAuth is not configured on server.' });
  }

  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

authRouter.get('/google/callback', (req, res, next) => {
  if (!authEnabled()) {
    return res.status(503).json({ message: 'Google OAuth is not configured on server.' });
  }

  return passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}?auth=failed`,
    session: true,
  })(req, res, () => {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}?auth=success`);
  });
});

authRouter.post('/logout', (req, res) => {
  if (!req.logout) {
    return res.status(200).json({ success: true });
  }

  req.logout((error) => {
    if (error) {
      return res.status(500).json({ message: 'Logout failed.' });
    }
    req.session.destroy(() => {
      res.clearCookie('chess.sid');
      res.json({ success: true });
    });
  });

  return undefined;
});

module.exports = authRouter;
