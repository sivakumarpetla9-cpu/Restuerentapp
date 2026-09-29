/**
 * Security Audit Repository (PostgreSQL)
 *
 * Handles persistent Security Audit log storage and querying in PostgreSQL.
 * Strictly sanitizes sensitive fields (passwords, tokens, secrets).
 */

const { query } = require("../db");

function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.event_type,
    eventType: row.event_type,
    userId: row.user_id,
    email: row.email,
    ip: row.ip_address,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    status: row.status,
    details: typeof row.details === "string" ? JSON.parse(row.details) : (row.details || {}),
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

async function getSecurityAuditLogs(filter = {}) {
  let sql = `SELECT * FROM security_audit WHERE 1=1`;
  const params = [];

  if (filter.type || filter.eventType) {
    params.push((filter.type || filter.eventType).toUpperCase().trim());
    sql += ` AND UPPER(event_type) = $${params.length}`;
  }
  if (filter.userId) {
    params.push(filter.userId);
    sql += ` AND user_id = $${params.length}`;
  }
  if (filter.email) {
    params.push(filter.email.toLowerCase().trim());
    sql += ` AND LOWER(email) = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapAuditRow);
}

async function logSecurityEvent(event = {}) {
  const safeDetails = { ...(event.details || {}) };
  delete safeDetails.password;
  delete safeDetails.passwordHash;
  delete safeDetails.token;
  delete safeDetails.secret;
  delete safeDetails.sessionSecret;

  const id = event.id || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const eventType = String(event.type || event.eventType || "ACCESS_DENIED").toUpperCase().trim();
  const createdAt = event.createdAt || event.timestamp ? new Date(event.createdAt || event.timestamp) : new Date();

  let validUserId = null;
  if (event.userId) {
    try {
      const uCheck = await query("SELECT id FROM users WHERE id = $1 LIMIT 1;", [event.userId]);
      if (uCheck.rows.length > 0) {
        validUserId = event.userId;
      }
    } catch {
      validUserId = null;
    }
  }

  const res = await query(
    `INSERT INTO security_audit (id, event_type, user_id, email, ip_address, user_agent, status, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *;`,
    [
      id,
      eventType,
      validUserId,
      event.email ? String(event.email).toLowerCase().trim() : null,
      event.ip || event.ipAddress || "127.0.0.1",
      event.userAgent || null,
      event.status || "SUCCESS",
      JSON.stringify(safeDetails),
      createdAt
    ]
  );
  return mapAuditRow(res.rows[0]);
}

async function clearSecurityAudit() {
  await query(`DELETE FROM security_audit;`);
  return true;
}

async function countSecurityAuditLogs() {
  const res = await query(`SELECT COUNT(*) AS cnt FROM security_audit;`);
  return parseInt(res.rows[0].cnt, 10);
}

module.exports = {
  getSecurityAuditLogs,
  logSecurityEvent,
  clearSecurityAudit,
  countSecurityAuditLogs,
  mapAuditRow
};
