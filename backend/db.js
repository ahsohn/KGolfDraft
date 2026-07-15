const { Pool } = require("pg");

const SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || "ahsohn@gmail.com"
)
  .toLowerCase()
  .trim();

let pool = null;

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to backend/.env"
    );
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  await createSchema();
  await seedSuperAdmin();
  console.log("Postgres (Neon) initialized");
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'golf',
      draft_format TEXT NOT NULL DEFAULT 'snake',
      total_rounds INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'waiting',
      is_current BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS draft_players (
      id SERIAL PRIMARY KEY,
      draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      rank INTEGER NOT NULL DEFAULT 999
    );

    CREATE TABLE IF NOT EXISTS draft_participants (
      draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      draft_order INTEGER NOT NULL,
      PRIMARY KEY (draft_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS picks (
      id SERIAL PRIMARY KEY,
      draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      pick_number INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      golfer_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      draft_id INTEGER NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      timestamp BIGINT NOT NULL
    );
  `);
}

async function seedSuperAdmin() {
  await pool.query(
    `INSERT INTO users (email, name, is_admin, is_super_admin)
     VALUES ($1, $2, TRUE, TRUE)
     ON CONFLICT (email) DO UPDATE SET is_admin = TRUE, is_super_admin = TRUE`,
    [SUPER_ADMIN_EMAIL, "Super Admin"]
  );
}

// --- Row mappers ---

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    isAdmin: row.is_admin,
    isSuperAdmin: row.is_super_admin,
  };
}

function mapDraft(row) {
  return {
    id: row.id,
    name: row.name,
    theme: row.theme,
    draftFormat: row.draft_format,
    totalRounds: row.total_rounds,
    status: row.status,
    isCurrent: row.is_current,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    pickCount: row.pick_count !== undefined ? Number(row.pick_count) : undefined,
    participantCount:
      row.participant_count !== undefined
        ? Number(row.participant_count)
        : undefined,
  };
}

function mapPick(row) {
  return {
    round: row.round,
    pickNumber: row.pick_number,
    userEmail: row.user_email,
    userName: row.user_name,
    golferName: row.golfer_name,
  };
}

// --- Users ---

async function getUserByEmail(email) {
  const res = await pool.query(`SELECT * FROM users WHERE email = $1`, [
    (email || "").toLowerCase().trim(),
  ]);
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

async function listUsers() {
  const res = await pool.query(
    `SELECT * FROM users ORDER BY is_super_admin DESC, name ASC`
  );
  return res.rows.map(mapUser);
}

async function saveUser({ id, email, name, isAdmin }) {
  const normalizedEmail = (email || "").toLowerCase().trim();
  if (id) {
    await pool.query(
      `UPDATE users SET email = $2, name = $3, is_admin = $4 WHERE id = $1`,
      [id, normalizedEmail, name, !!isAdmin]
    );
  } else {
    await pool.query(
      `INSERT INTO users (email, name, is_admin)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = $2, is_admin = $3`,
      [normalizedEmail, name, !!isAdmin]
    );
  }
}

async function deleteUser(id) {
  await pool.query(
    `DELETE FROM users WHERE id = $1 AND is_super_admin = FALSE`,
    [id]
  );
}

// --- Drafts ---

const DRAFT_SELECT = `
  SELECT d.*,
    COALESCE(p.cnt, 0) AS pick_count,
    COALESCE(dp.cnt, 0) AS participant_count
  FROM drafts d
  LEFT JOIN (SELECT draft_id, COUNT(*) AS cnt FROM picks GROUP BY draft_id) p
    ON p.draft_id = d.id
  LEFT JOIN (SELECT draft_id, COUNT(*) AS cnt FROM draft_participants GROUP BY draft_id) dp
    ON dp.draft_id = d.id
`;

async function listDrafts() {
  const res = await pool.query(`${DRAFT_SELECT} ORDER BY d.created_at DESC`);
  return res.rows.map(mapDraft);
}

async function getDraft(id) {
  const res = await pool.query(`${DRAFT_SELECT} WHERE d.id = $1`, [id]);
  return res.rows[0] ? mapDraft(res.rows[0]) : null;
}

async function getCurrentDraft() {
  const res = await pool.query(
    `SELECT * FROM drafts WHERE is_current = TRUE LIMIT 1`
  );
  return res.rows[0] ? mapDraft(res.rows[0]) : null;
}

async function createDraft({ name, theme, draftFormat, totalRounds }) {
  const res = await pool.query(
    `INSERT INTO drafts (name, theme, draft_format, total_rounds)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      name,
      theme === "worldcup" ? "worldcup" : "golf",
      draftFormat === "thirdRoundReversal" ? "thirdRoundReversal" : "snake",
      totalRounds || 10,
    ]
  );
  return res.rows[0].id;
}

async function updateDraftSettings(id, { name, theme, draftFormat, totalRounds }) {
  await pool.query(
    `UPDATE drafts SET name = $2, theme = $3, draft_format = $4, total_rounds = $5
     WHERE id = $1`,
    [
      id,
      name,
      theme === "worldcup" ? "worldcup" : "golf",
      draftFormat === "thirdRoundReversal" ? "thirdRoundReversal" : "snake",
      totalRounds || 10,
    ]
  );
}

async function updateDraftStatus(id, status, { totalRounds, draftFormat } = {}) {
  await pool.query(
    `UPDATE drafts SET
       status = $2,
       total_rounds = COALESCE($3, total_rounds),
       draft_format = COALESCE($4, draft_format),
       started_at = CASE WHEN $2 = 'active' AND started_at IS NULL THEN NOW() ELSE started_at END,
       completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE NULL END
     WHERE id = $1`,
    [id, status, totalRounds || null, draftFormat || null]
  );
}

async function deleteDraft(id) {
  await pool.query(`DELETE FROM drafts WHERE id = $1`, [id]);
}

async function setCurrentDraft(id) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE drafts SET is_current = FALSE WHERE is_current`);
    if (id) {
      await client.query(`UPDATE drafts SET is_current = TRUE WHERE id = $1`, [
        id,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- Draft players ---

async function getDraftPlayers(draftId) {
  const res = await pool.query(
    `SELECT name, rank FROM draft_players WHERE draft_id = $1 ORDER BY rank ASC, name ASC`,
    [draftId]
  );
  return res.rows.map((r) => ({ name: r.name, rank: r.rank }));
}

async function setDraftPlayers(draftId, players) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM draft_players WHERE draft_id = $1`, [
      draftId,
    ]);
    for (const p of players) {
      await client.query(
        `INSERT INTO draft_players (draft_id, name, rank) VALUES ($1, $2, $3)`,
        [draftId, p.name, p.rank || 999]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- Draft participants ---

async function getDraftParticipants(draftId) {
  const res = await pool.query(
    `SELECT u.email, u.name, u.is_admin, dp.draft_order
     FROM draft_participants dp
     JOIN users u ON u.id = dp.user_id
     WHERE dp.draft_id = $1
     ORDER BY dp.draft_order ASC`,
    [draftId]
  );
  return res.rows.map((r) => ({
    email: r.email,
    name: r.name,
    isAdmin: r.is_admin,
    draftOrder: r.draft_order,
  }));
}

async function setDraftParticipants(draftId, participants) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM draft_participants WHERE draft_id = $1`, [
      draftId,
    ]);
    for (const p of participants) {
      await client.query(
        `INSERT INTO draft_participants (draft_id, user_id, draft_order)
         SELECT $1::int, id, $3::int FROM users WHERE email = $2`,
        [draftId, (p.email || "").toLowerCase().trim(), p.draftOrder]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- Picks ---

async function getPicks(draftId) {
  const res = await pool.query(
    `SELECT * FROM picks WHERE draft_id = $1 ORDER BY pick_number ASC`,
    [draftId]
  );
  return res.rows.map(mapPick);
}

async function insertPick(draftId, pick) {
  await pool.query(
    `INSERT INTO picks (draft_id, round, pick_number, user_email, user_name, golfer_name)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      draftId,
      pick.round,
      pick.pickNumber,
      pick.userEmail,
      pick.userName,
      pick.golferName,
    ]
  );
}

async function deleteLastPick(draftId) {
  const res = await pool.query(
    `DELETE FROM picks WHERE id = (
       SELECT id FROM picks WHERE draft_id = $1 ORDER BY pick_number DESC LIMIT 1
     ) RETURNING *`,
    [draftId]
  );
  return res.rows[0] ? mapPick(res.rows[0]) : null;
}

// --- Chat ---

async function getChatMessages(draftId, limit = 200) {
  const res = await pool.query(
    `SELECT * FROM (
       SELECT * FROM chat_messages WHERE draft_id = $1 ORDER BY timestamp DESC LIMIT $2
     ) sub ORDER BY timestamp ASC`,
    [draftId, limit]
  );
  return res.rows.map((r) => ({
    id: r.id,
    sender: r.sender,
    text: r.text,
    isSystem: r.is_system,
    timestamp: Number(r.timestamp),
  }));
}

async function insertChatMessage(draftId, msg) {
  await pool.query(
    `INSERT INTO chat_messages (id, draft_id, sender, text, is_system, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [msg.id, draftId, msg.sender, msg.text, !!msg.isSystem, msg.timestamp]
  );
}

module.exports = {
  init,
  getUserByEmail,
  listUsers,
  saveUser,
  deleteUser,
  listDrafts,
  getDraft,
  getCurrentDraft,
  createDraft,
  updateDraftSettings,
  updateDraftStatus,
  deleteDraft,
  setCurrentDraft,
  getDraftPlayers,
  setDraftPlayers,
  getDraftParticipants,
  setDraftParticipants,
  getPicks,
  insertPick,
  deleteLastPick,
  getChatMessages,
  insertChatMessage,
};
