/**
 * Lead Repository (PostgreSQL)
 *
 * Provides CRUD operations, status filtering, deduplication,
 * and JSONB mapping for Leads in PostgreSQL.
 */

const { query } = require("../db");

function mapLeadRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyName: row.company_name,
    website: row.website,
    industry: row.industry,
    location: row.location,
    contactName: row.contact_name,
    contactRole: row.contact_role,
    email: row.email,
    phone: row.phone,
    source: row.source,
    sourceType: row.source_type,
    evidence: row.evidence,
    qualificationStatus: row.qualification_status,
    fitReason: row.fit_reason,
    painPoints: row.pain_points,
    potentialNeed: row.potential_need,
    pipelineStatus: row.pipeline_status,
    outreachStatus: row.outreach_status,
    pipeline: typeof row.pipeline === "string" ? JSON.parse(row.pipeline) : (row.pipeline || {}),
    notes: row.notes || "",
    qualification: typeof row.qualification === "string" ? JSON.parse(row.qualification) : row.qualification,
    communicationOptOut: Boolean(row.communication_opt_out),
    preferredChannel: row.preferred_channel,
    customFields: typeof row.custom_fields === "string" ? JSON.parse(row.custom_fields) : (row.custom_fields || {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getLeads(filters = {}) {
  let sql = `SELECT * FROM leads WHERE 1=1`;
  const params = [];

  if (filters.pipelineStatus) {
    params.push(filters.pipelineStatus);
    sql += ` AND pipeline_status = $${params.length}`;
  }
  if (filters.qualificationStatus) {
    params.push(filters.qualificationStatus);
    sql += ` AND qualification_status = $${params.length}`;
  }
  if (filters.industry) {
    params.push(filters.industry);
    sql += ` AND LOWER(industry) = LOWER($${params.length})`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapLeadRow);
}

async function getLeadById(id) {
  const res = await query(`SELECT * FROM leads WHERE id = $1 LIMIT 1;`, [id]);
  return mapLeadRow(res.rows[0]);
}

async function findLeadByCompanyOrContact(companyName, email = null) {
  let sql = `SELECT * FROM leads WHERE LOWER(company_name) = LOWER($1)`;
  const params = [companyName];
  if (email) {
    params.push(email.toLowerCase());
    sql += ` OR LOWER(email) = $${params.length}`;
  }
  sql += ` LIMIT 1;`;
  const res = await query(sql, params);
  return mapLeadRow(res.rows[0]);
}

async function createLead(lead) {
  const res = await query(
    `INSERT INTO leads (
       id, company_name, website, industry, location, contact_name, contact_role,
       email, phone, source, source_type, evidence, qualification_status,
       fit_reason, pain_points, potential_need, pipeline_status, outreach_status,
       pipeline, notes, qualification, communication_opt_out, preferred_channel,
       custom_fields, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
     RETURNING *;`,
    [
      lead.id,
      lead.companyName || lead.company || "Unknown Business",
      lead.website || null,
      lead.industry || null,
      lead.location || null,
      lead.contactName || null,
      lead.contactRole || null,
      lead.email || null,
      lead.phone || null,
      lead.source || null,
      lead.sourceType || "USER_INPUT",
      lead.evidence || null,
      lead.qualificationStatus || "NEEDS_RESEARCH",
      lead.fitReason || null,
      lead.painPoints || null,
      lead.potentialNeed || null,
      lead.pipelineStatus || "NOT_CONTACTED",
      lead.outreachStatus || lead.pipelineStatus || "NOT_CONTACTED",
      JSON.stringify(lead.pipeline || {}),
      lead.notes || null,
      lead.qualification ? JSON.stringify(lead.qualification) : null,
      Boolean(lead.communicationOptOut),
      lead.preferredChannel || null,
      JSON.stringify(lead.customFields || {}),
      lead.createdAt ? new Date(lead.createdAt) : new Date(),
      lead.updatedAt ? new Date(lead.updatedAt) : new Date()
    ]
  );
  return mapLeadRow(res.rows[0]);
}

async function updateLead(id, updates = {}) {
  const existing = await getLeadById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  if (updates.pipeline) {
    merged.pipeline = { ...(existing.pipeline || {}), ...updates.pipeline };
  }
  if (updates.pipelineStatus) {
    merged.pipelineStatus = updates.pipelineStatus;
    merged.outreachStatus = updates.pipelineStatus;
  }

  const res = await query(
    `UPDATE leads SET
       company_name = $1, website = $2, industry = $3, location = $4,
       contact_name = $5, contact_role = $6, email = $7, phone = $8,
       source = $9, source_type = $10, evidence = $11, qualification_status = $12,
       fit_reason = $13, pain_points = $14, potential_need = $15, pipeline_status = $16,
       outreach_status = $17, pipeline = $18, notes = $19, qualification = $20,
       communication_opt_out = $21, preferred_channel = $22, custom_fields = $23, updated_at = $24
     WHERE id = $25
     RETURNING *;`,
    [
      merged.companyName,
      merged.website,
      merged.industry,
      merged.location,
      merged.contactName,
      merged.contactRole,
      merged.email,
      merged.phone,
      merged.source,
      merged.sourceType,
      merged.evidence,
      merged.qualificationStatus,
      merged.fitReason,
      merged.painPoints,
      merged.potentialNeed,
      merged.pipelineStatus,
      merged.outreachStatus,
      JSON.stringify(merged.pipeline || {}),
      merged.notes,
      merged.qualification ? JSON.stringify(merged.qualification) : null,
      Boolean(merged.communicationOptOut),
      merged.preferredChannel,
      JSON.stringify(merged.customFields || {}),
      new Date(),
      id
    ]
  );
  return mapLeadRow(res.rows[0]);
}

async function deleteLead(id) {
  const res = await query(`DELETE FROM leads WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearLeads() {
  await query(`DELETE FROM leads;`);
  return true;
}

async function countLeads() {
  const res = await query(`SELECT COUNT(*) AS cnt FROM leads;`);
  return parseInt(res.rows[0].cnt, 10);
}

module.exports = {
  getLeads,
  getLeadById,
  findLeadByCompanyOrContact,
  createLead,
  updateLead,
  deleteLead,
  clearLeads,
  countLeads,
  mapLeadRow
};
