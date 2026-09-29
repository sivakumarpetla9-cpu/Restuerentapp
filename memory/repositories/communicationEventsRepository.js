/**
 * Communication Events Repository (PostgreSQL)
 *
 * Handles persistent communication webhook and event storage with idempotency checks in PostgreSQL.
 */

const { query } = require("../db");

function mapEventRow(row) {
  if (!row) return null;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload || {});
  return {
    id: row.id,
    eventId: row.idempotency_key,
    idempotencyKey: row.idempotency_key,
    messageId: row.message_id,
    providerMessageId: row.provider_message_id,
    provider: row.provider,
    channel: row.channel,
    type: row.event_type,
    eventType: row.event_type,
    status: row.status,
    recipient: row.recipient,
    details: payload,
    payload,
    timestamp: row.created_at ? new Date(row.created_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

async function getEvents(filters = {}) {
  let sql = `SELECT * FROM communication_events WHERE 1=1`;
  const params = [];

  if (filters.messageId) {
    params.push(filters.messageId);
    sql += ` AND message_id = $${params.length}`;
  }
  if (filters.providerMessageId) {
    params.push(filters.providerMessageId);
    sql += ` AND provider_message_id = $${params.length}`;
  }
  if (filters.type || filters.eventType) {
    params.push((filters.type || filters.eventType).toUpperCase());
    sql += ` AND UPPER(event_type) = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapEventRow);
}

async function findEventByIdempotency(key) {
  if (!key) return null;
  const res = await query(`SELECT * FROM communication_events WHERE idempotency_key = $1 LIMIT 1;`, [key]);
  return mapEventRow(res.rows[0]);
}

async function findEventByProviderMessageId(providerMessageId, eventType) {
  if (!providerMessageId) return null;
  const res = await query(
    `SELECT * FROM communication_events WHERE provider_message_id = $1 AND UPPER(event_type) = UPPER($2) LIMIT 1;`,
    [providerMessageId, eventType]
  );
  return mapEventRow(res.rows[0]);
}

async function createEvent(event) {
  const key = event.idempotencyKey || event.eventId || event.id;
  let validMessageId = event.messageId || null;
  if (validMessageId) {
    try {
      const msgCheck = await query(`SELECT id FROM messages WHERE id = $1 LIMIT 1;`, [validMessageId]);
      if (msgCheck.rows.length === 0) validMessageId = null;
    } catch {
      validMessageId = null;
    }
  }

  const res = await query(
    `INSERT INTO communication_events (
       id, idempotency_key, event_type, message_id, provider_message_id, provider, channel, status, recipient, payload, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *;`,
    [
      event.id,
      key,
      event.eventType || event.type || "SENT",
      validMessageId,
      event.providerMessageId || null,
      event.provider || "local",
      event.channel || "EMAIL",
      event.status || event.type || null,
      event.recipient || null,
      JSON.stringify(event.payload || event.details || {}),
      event.createdAt || event.timestamp ? new Date(event.createdAt || event.timestamp) : new Date()
    ]
  );
  return mapEventRow(res.rows[0]);
}

async function clearEvents() {
  await query(`DELETE FROM communication_events;`);
  return true;
}

async function countEvents() {
  const res = await query(`SELECT COUNT(*) AS cnt FROM communication_events;`);
  return parseInt(res.rows[0].cnt, 10);
}

module.exports = {
  getEvents,
  findEventByIdempotency,
  findEventByProviderMessageId,
  createEvent,
  clearEvents,
  countEvents,
  mapEventRow
};
