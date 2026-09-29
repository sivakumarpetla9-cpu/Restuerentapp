/**
 * Communication Repository (PostgreSQL)
 *
 * Handles persistent Template and Message storage and queries in PostgreSQL.
 */

const { query } = require("../db");

// ==========================================
// 1. TEMPLATES
// ==========================================

function mapTemplateRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    purpose: row.purpose,
    subject: row.subject,
    body: row.body || "",
    variables: typeof row.variables === "string" ? JSON.parse(row.variables) : (row.variables || []),
    description: row.description || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getTemplates() {
  const res = await query(`SELECT * FROM templates ORDER BY created_at ASC;`);
  return res.rows.map(mapTemplateRow);
}

async function getTemplateById(id) {
  const res = await query(`SELECT * FROM templates WHERE id = $1 LIMIT 1;`, [id]);
  return mapTemplateRow(res.rows[0]);
}

async function findTemplate(identifierOrPurpose, channel = null) {
  let sql = `SELECT * FROM templates WHERE (id = $1 OR purpose = $1)`;
  const params = [identifierOrPurpose];
  if (channel) {
    params.push(channel.toUpperCase());
    sql += ` AND UPPER(channel) = $${params.length}`;
  }
  sql += ` LIMIT 1;`;
  const res = await query(sql, params);
  return mapTemplateRow(res.rows[0]);
}

async function createTemplate(tmpl) {
  const res = await query(
    `INSERT INTO templates (id, name, channel, purpose, subject, body, variables, description, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *;`,
    [
      tmpl.id,
      tmpl.name,
      tmpl.channel || "EMAIL",
      tmpl.purpose || null,
      tmpl.subject || null,
      tmpl.body || "",
      JSON.stringify(tmpl.variables || []),
      tmpl.description || null,
      tmpl.createdAt ? new Date(tmpl.createdAt) : new Date(),
      tmpl.updatedAt ? new Date(tmpl.updatedAt) : new Date()
    ]
  );
  return mapTemplateRow(res.rows[0]);
}

async function updateTemplate(id, updates = {}) {
  const existing = await getTemplateById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE templates SET
       name = $1, channel = $2, purpose = $3, subject = $4,
       body = $5, variables = $6, description = $7, updated_at = $8
     WHERE id = $9
     RETURNING *;`,
    [
      merged.name,
      merged.channel,
      merged.purpose,
      merged.subject,
      merged.body,
      JSON.stringify(merged.variables || []),
      merged.description,
      new Date(),
      id
    ]
  );
  return mapTemplateRow(res.rows[0]);
}

async function deleteTemplate(id) {
  const res = await query(`DELETE FROM templates WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearTemplates() {
  await query(`DELETE FROM templates;`);
  return true;
}

// ==========================================
// 2. MESSAGES
// ==========================================

function mapMessageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    clientId: row.client_id,
    projectId: row.project_id,
    direction: row.direction,
    channel: row.channel,
    provider: row.provider,
    recipientType: row.recipient_type,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    recipientAddress: row.recipient_address,
    recipient: row.recipient,
    templateId: row.template_id,
    subject: row.subject,
    body: row.body || "",
    status: row.status,
    purpose: row.purpose,
    source: row.source,
    conversationId: row.conversation_id,
    providerMessageId: row.provider_message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    inboundReplies: typeof row.inbound_replies === "string" ? JSON.parse(row.inbound_replies) : (row.inbound_replies || []),
    errorDetails: row.error_details,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    copiedAt: row.copied_at ? new Date(row.copied_at).toISOString() : null,
    sendRequestedAt: row.send_requested_at ? new Date(row.send_requested_at).toISOString() : null,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    repliedAt: row.replied_at ? new Date(row.replied_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getMessages(filters = {}) {
  let sql = `SELECT * FROM messages WHERE 1=1`;
  const params = [];

  if (filters.leadId) {
    params.push(filters.leadId);
    sql += ` AND lead_id = $${params.length}`;
  }
  if (filters.clientId) {
    params.push(filters.clientId);
    sql += ` AND client_id = $${params.length}`;
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    sql += ` AND project_id = $${params.length}`;
  }
  if (filters.channel) {
    params.push(filters.channel.toUpperCase());
    sql += ` AND channel = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status.toUpperCase());
    sql += ` AND status = $${params.length}`;
  }
  if (filters.conversationId) {
    params.push(filters.conversationId);
    sql += ` AND conversation_id = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapMessageRow);
}

async function getMessageById(id) {
  const res = await query(`SELECT * FROM messages WHERE id = $1 LIMIT 1;`, [id]);
  return mapMessageRow(res.rows[0]);
}

async function createMessage(msg) {
  const res = await query(
    `INSERT INTO messages (
       id, lead_id, client_id, project_id, direction, channel, provider,
       recipient_type, recipient_id, recipient_name, recipient_address, recipient,
       template_id, subject, body, status, purpose, source, conversation_id,
       provider_message_id, error_code, error_message, metadata, inbound_replies,
       error_details, approved_by, approved_at, copied_at, send_requested_at,
       sent_at, delivered_at, read_at, replied_at, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24,
       $25, $26, $27, $28, $29,
       $30, $31, $32, $33, $34, $35
     ) RETURNING *;`,
    [
      msg.id,
      msg.leadId || null,
      msg.clientId || null,
      msg.projectId || null,
      msg.direction || "OUTBOUND",
      msg.channel || "EMAIL",
      msg.provider || "local",
      msg.recipientType || (msg.leadId ? "LEAD" : (msg.clientId ? "CLIENT" : (msg.projectId ? "PROJECT" : null))),
      msg.recipientId || msg.leadId || msg.clientId || msg.projectId || null,
      msg.recipientName || null,
      msg.recipientAddress || null,
      msg.recipient || null,
      msg.templateId || null,
      msg.subject || null,
      msg.body || "",
      msg.status || "DRAFT",
      msg.purpose || "GENERAL",
      msg.source || "AI-GENERATED",
      msg.conversationId || null,
      msg.providerMessageId || null,
      msg.errorCode || null,
      msg.errorMessage || null,
      JSON.stringify(msg.metadata || {}),
      JSON.stringify(msg.inboundReplies || []),
      msg.errorDetails || null,
      msg.approvedBy || null,
      msg.approvedAt ? new Date(msg.approvedAt) : null,
      msg.copiedAt ? new Date(msg.copiedAt) : null,
      msg.sendRequestedAt ? new Date(msg.sendRequestedAt) : null,
      msg.sentAt ? new Date(msg.sentAt) : null,
      msg.deliveredAt ? new Date(msg.deliveredAt) : null,
      msg.readAt ? new Date(msg.readAt) : null,
      msg.repliedAt ? new Date(msg.repliedAt) : null,
      msg.createdAt ? new Date(msg.createdAt) : new Date(),
      msg.updatedAt ? new Date(msg.updatedAt) : new Date()
    ]
  );
  return mapMessageRow(res.rows[0]);
}

async function updateMessage(id, updates = {}) {
  const existing = await getMessageById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE messages SET
       lead_id = $1, client_id = $2, project_id = $3, direction = $4,
       channel = $5, provider = $6, recipient_type = $7, recipient_id = $8,
       recipient_name = $9, recipient_address = $10, recipient = $11,
       template_id = $12, subject = $13, body = $14, status = $15,
       purpose = $16, source = $17, conversation_id = $18, provider_message_id = $19,
       error_code = $20, error_message = $21, metadata = $22, inbound_replies = $23,
       error_details = $24, approved_by = $25, approved_at = $26, copied_at = $27,
       send_requested_at = $28, sent_at = $29, delivered_at = $30, read_at = $31,
       replied_at = $32, updated_at = $33
     WHERE id = $34
     RETURNING *;`,
    [
      merged.leadId || null,
      merged.clientId || null,
      merged.projectId || null,
      merged.direction,
      merged.channel,
      merged.provider,
      merged.recipientType || null,
      merged.recipientId || null,
      merged.recipientName || null,
      merged.recipientAddress || null,
      merged.recipient || null,
      merged.templateId || null,
      merged.subject || null,
      merged.body,
      merged.status,
      merged.purpose,
      merged.source,
      merged.conversationId || null,
      merged.providerMessageId || null,
      merged.errorCode || null,
      merged.errorMessage || null,
      JSON.stringify(merged.metadata || {}),
      JSON.stringify(merged.inboundReplies || []),
      merged.errorDetails || null,
      merged.approvedBy || null,
      merged.approvedAt ? new Date(merged.approvedAt) : null,
      merged.copiedAt ? new Date(merged.copiedAt) : null,
      merged.sendRequestedAt ? new Date(merged.sendRequestedAt) : null,
      merged.sentAt ? new Date(merged.sentAt) : null,
      merged.deliveredAt ? new Date(merged.deliveredAt) : null,
      merged.readAt ? new Date(merged.readAt) : null,
      merged.repliedAt ? new Date(merged.repliedAt) : null,
      new Date(),
      id
    ]
  );
  return mapMessageRow(res.rows[0]);
}

async function deleteMessage(id) {
  const res = await query(`DELETE FROM messages WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearMessages() {
  await query(`DELETE FROM messages;`);
  return true;
}

async function countMessages() {
  const res = await query(`SELECT COUNT(*) AS cnt FROM messages;`);
  return parseInt(res.rows[0].cnt, 10);
}

module.exports = {
  // Templates
  getTemplates,
  getTemplateById,
  findTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  clearTemplates,
  // Messages
  getMessages,
  getMessageById,
  createMessage,
  updateMessage,
  deleteMessage,
  clearMessages,
  countMessages,
  mapTemplateRow,
  mapMessageRow
};
