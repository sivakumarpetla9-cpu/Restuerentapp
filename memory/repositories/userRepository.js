/**
 * User Repository (PostgreSQL)
 *
 * Handles persistent user storage, queries, and updates in PostgreSQL.
 * Strips password hashes from public returns.
 */

const { query } = require("../db");

function mapUserRow(row, includePassword = false) {
  if (!row) return null;
  const user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
  if (includePassword) {
    user.passwordHash = row.password_hash;
  }
  return user;
}

async function getUsers() {
  const res = await query(
    `SELECT id, name, email, role, status, last_login_at, created_at, updated_at
     FROM users
     ORDER BY created_at ASC;`
  );
  return res.rows.map(r => mapUserRow(r, false));
}

async function findUserById(id, includePassword = false) {
  const res = await query(
    `SELECT * FROM users WHERE id = $1 LIMIT 1;`,
    [id]
  );
  return mapUserRow(res.rows[0], includePassword);
}

async function findUserByEmail(email, includePassword = false) {
  const res = await query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;`,
    [email]
  );
  return mapUserRow(res.rows[0], includePassword);
}

async function createUser(user) {
  const res = await query(
    `INSERT INTO users (id, name, email, password_hash, role, status, last_login_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       last_login_at = EXCLUDED.last_login_at,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      user.id,
      user.name,
      user.email.toLowerCase(),
      user.passwordHash,
      user.role || "VIEWER",
      user.status || "ACTIVE",
      user.lastLoginAt ? new Date(user.lastLoginAt) : null,
      user.createdAt ? new Date(user.createdAt) : new Date(),
      user.updatedAt ? new Date(user.updatedAt) : new Date()
    ]
  );
  return mapUserRow(res.rows[0], false);
}

async function updateUser(id, updates = {}) {
  const existing = await findUserById(id, true);
  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name : existing.name;
  const role = updates.role !== undefined ? updates.role : existing.role;
  const status = updates.status !== undefined ? updates.status : existing.status;
  const passwordHash = updates.passwordHash !== undefined ? updates.passwordHash : existing.passwordHash;
  const lastLoginAt = updates.lastLoginAt !== undefined ? updates.lastLoginAt : existing.lastLoginAt;
  const updatedAt = new Date();

  const res = await query(
    `UPDATE users
     SET name = $1, role = $2, status = $3, password_hash = $4, last_login_at = $5, updated_at = $6
     WHERE id = $7
     RETURNING *;`,
    [name, role, status, passwordHash, lastLoginAt ? new Date(lastLoginAt) : null, updatedAt, id]
  );
  return mapUserRow(res.rows[0], false);
}

async function deleteUser(id) {
  const res = await query(`DELETE FROM users WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function countUsers() {
  const res = await query(`SELECT COUNT(*) AS cnt FROM users;`);
  return parseInt(res.rows[0].cnt, 10);
}

module.exports = {
  getUsers,
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  countUsers,
  mapUserRow
};
