/**
 * CRM Repository (PostgreSQL)
 *
 * Handles Contacts, Activities, and Clients persistence and queries in PostgreSQL.
 */

const { query } = require("../db");

// ==========================================
// 1. CONTACTS
// ==========================================

function mapContactRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    clientId: row.client_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isPrimary: Boolean(row.is_primary),
    notes: row.notes || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getContacts(filters = {}) {
  let sql = `SELECT * FROM contacts WHERE 1=1`;
  const params = [];

  if (filters.leadId) {
    params.push(filters.leadId);
    sql += ` AND lead_id = $${params.length}`;
  }
  if (filters.clientId) {
    params.push(filters.clientId);
    sql += ` AND client_id = $${params.length}`;
  }

  sql += ` ORDER BY is_primary DESC, created_at ASC;`;
  const res = await query(sql, params);
  return res.rows.map(mapContactRow);
}

async function getContactById(id) {
  const res = await query(`SELECT * FROM contacts WHERE id = $1 LIMIT 1;`, [id]);
  return mapContactRow(res.rows[0]);
}

async function createContact(contact) {
  const res = await query(
    `INSERT INTO contacts (id, lead_id, client_id, name, email, phone, role, is_primary, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *;`,
    [
      contact.id,
      contact.leadId || null,
      contact.clientId || null,
      contact.name,
      contact.email || null,
      contact.phone || null,
      contact.role || null,
      Boolean(contact.isPrimary),
      contact.notes || null,
      contact.createdAt ? new Date(contact.createdAt) : new Date(),
      contact.updatedAt ? new Date(contact.updatedAt) : new Date()
    ]
  );
  return mapContactRow(res.rows[0]);
}

async function updateContact(id, updates = {}) {
  const existing = await getContactById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE contacts SET
       lead_id = $1, client_id = $2, name = $3, email = $4, phone = $5,
       role = $6, is_primary = $7, notes = $8, updated_at = $9
     WHERE id = $10
     RETURNING *;`,
    [
      merged.leadId || null,
      merged.clientId || null,
      merged.name,
      merged.email || null,
      merged.phone || null,
      merged.role || null,
      Boolean(merged.isPrimary),
      merged.notes || null,
      new Date(),
      id
    ]
  );
  return mapContactRow(res.rows[0]);
}

async function deleteContact(id) {
  const res = await query(`DELETE FROM contacts WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearContacts() {
  await query(`DELETE FROM contacts;`);
  return true;
}

// ==========================================
// 2. ACTIVITIES
// ==========================================

function mapActivityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    type: row.type,
    description: row.description,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

async function getActivities(filters = {}) {
  let sql = `SELECT * FROM activities WHERE 1=1`;
  const params = [];

  if (filters.entityType) {
    params.push(filters.entityType);
    sql += ` AND entity_type = $${params.length}`;
  }
  if (filters.entityId) {
    params.push(filters.entityId);
    sql += ` AND entity_id = $${params.length}`;
  }
  if (filters.type) {
    params.push(filters.type);
    sql += ` AND type = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapActivityRow);
}

async function createActivity(activity) {
  const res = await query(
    `INSERT INTO activities (id, entity_type, entity_id, type, description, metadata, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *;`,
    [
      activity.id,
      activity.entityType || "LEAD",
      activity.entityId,
      activity.type || "NOTE",
      activity.description || "",
      JSON.stringify(activity.metadata || {}),
      activity.createdBy || null,
      activity.createdAt ? new Date(activity.createdAt) : new Date()
    ]
  );
  return mapActivityRow(res.rows[0]);
}

async function clearActivities() {
  await query(`DELETE FROM activities;`);
  return true;
}

// ==========================================
// 3. CLIENTS
// ==========================================

function mapClientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    companyName: row.company,
    email: row.email,
    phone: row.phone,
    status: row.status,
    tier: row.tier,
    convertedFromLeadId: row.converted_from_lead_id,
    billing: typeof row.billing === "string" ? JSON.parse(row.billing) : (row.billing || {}),
    deliveryProfile: typeof row.delivery_profile === "string" ? JSON.parse(row.delivery_profile) : (row.delivery_profile || {}),
    notes: row.notes || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getClients(filters = {}) {
  let sql = `SELECT * FROM clients WHERE 1=1`;
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  if (filters.tier) {
    params.push(filters.tier);
    sql += ` AND tier = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapClientRow);
}

async function getClientById(id) {
  const res = await query(`SELECT * FROM clients WHERE id = $1 LIMIT 1;`, [id]);
  return mapClientRow(res.rows[0]);
}

async function createClient(client) {
  const res = await query(
    `INSERT INTO clients (
       id, name, company, email, phone, status, tier,
       converted_from_lead_id, billing, delivery_profile, notes, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *;`,
    [
      client.id,
      client.name,
      client.company || client.companyName || null,
      client.email || null,
      client.phone || null,
      client.status || "ACTIVE",
      client.tier || "STANDARD",
      client.convertedFromLeadId || null,
      JSON.stringify(client.billing || {}),
      JSON.stringify(client.deliveryProfile || {}),
      client.notes || null,
      client.createdAt ? new Date(client.createdAt) : new Date(),
      client.updatedAt ? new Date(client.updatedAt) : new Date()
    ]
  );
  return mapClientRow(res.rows[0]);
}

async function updateClient(id, updates = {}) {
  const existing = await getClientById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE clients SET
       name = $1, company = $2, email = $3, phone = $4, status = $5,
       tier = $6, converted_from_lead_id = $7, billing = $8, delivery_profile = $9,
       notes = $10, updated_at = $11
     WHERE id = $12
     RETURNING *;`,
    [
      merged.name,
      merged.company || merged.companyName || null,
      merged.email || null,
      merged.phone || null,
      merged.status || "ACTIVE",
      merged.tier || "STANDARD",
      merged.convertedFromLeadId || null,
      JSON.stringify(merged.billing || {}),
      JSON.stringify(merged.deliveryProfile || {}),
      merged.notes || null,
      new Date(),
      id
    ]
  );
  return mapClientRow(res.rows[0]);
}

async function deleteClient(id) {
  const res = await query(`DELETE FROM clients WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearClients() {
  await query(`DELETE FROM clients;`);
  return true;
}

module.exports = {
  // Contacts
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  clearContacts,
  // Activities
  getActivities,
  createActivity,
  clearActivities,
  // Clients
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  clearClients,
  mapClientRow,
  mapContactRow,
  mapActivityRow
};
