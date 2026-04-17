const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { query, execute } = require('./database');

function normalizeProfile(profile) {
  const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
  const displayName = profile.displayName || 'Player';
  const picture = profile.photos && profile.photos[0] ? profile.photos[0].value : null;

  return {
    provider: 'google',
    providerId: profile.id,
    email,
    displayName,
    picture,
  };
}

async function findUserById(userId) {
  const rows = await query(
    `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.provider,
        u.provider_id,
        u.avatar_url,
        p.id AS player_id,
        p.name AS player_name,
        p.country AS player_country,
        p.rating AS player_rating,
        p.type AS player_type,
        p.level AS player_level
      FROM users u
      LEFT JOIN players p ON p.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId],
  );

  return rows[0] || null;
}

async function createUserAndPlayer(profileData) {
  const insert = await execute(
    `
      INSERT INTO users (email, display_name, provider, provider_id, avatar_url)
      VALUES (?, ?, ?, ?, ?)
    `,
    [profileData.email, profileData.displayName, profileData.provider, profileData.providerId, profileData.picture],
  );

  const userId = insert.insertId;

  await execute(
    `
      INSERT INTO players (name, country, type, level, rating, user_id)
      VALUES (?, 'Unknown', 'human', NULL, 1200, ?)
    `,
    [profileData.displayName, userId],
  );

  return findUserById(userId);
}

function authEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL,
  );
}

function setupPassport() {
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await findUserById(id);
      done(null, user || false);
    } catch (error) {
      done(error);
    }
  });

  if (!authEnabled()) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const normalized = normalizeProfile(profile);
          if (!normalized.email) {
            return done(new Error('Google account must include a public email.'));
          }

          const rows = await query(
            `
              SELECT id
              FROM users
              WHERE provider = ? AND provider_id = ?
              LIMIT 1
            `,
            [normalized.provider, normalized.providerId],
          );

          let user;
          if (rows[0]) {
            await execute(
              `
                UPDATE users
                SET email = ?,
                    display_name = ?,
                    avatar_url = ?,
                    last_login_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `,
              [normalized.email, normalized.displayName, normalized.picture, rows[0].id],
            );
            user = await findUserById(rows[0].id);
          } else {
            user = await createUserAndPlayer(normalized);
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );
}

module.exports = {
  passport,
  setupPassport,
  authEnabled,
};
