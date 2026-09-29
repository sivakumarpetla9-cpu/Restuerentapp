/**
 * Service Delivery Repository (PostgreSQL)
 *
 * Handles Projects, Onboarding, Requirements, Milestones, and Project Tasks in PostgreSQL.
 */

const { query } = require("../db");

// ==========================================
// 1. PROJECTS
// ==========================================

function mapProjectRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    status: row.status,
    description: row.description || "",
    startDate: row.start_date ? new Date(row.start_date).toISOString().split("T")[0] : null,
    targetEndDate: row.target_end_date ? new Date(row.target_end_date).toISOString().split("T")[0] : null,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getProjects(filters = {}) {
  let sql = `SELECT * FROM projects WHERE 1=1`;
  const params = [];

  if (filters.clientId) {
    params.push(filters.clientId);
    sql += ` AND client_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY created_at DESC;`;
  const res = await query(sql, params);
  return res.rows.map(mapProjectRow);
}

async function getProjectById(id) {
  const res = await query(`SELECT * FROM projects WHERE id = $1 LIMIT 1;`, [id]);
  return mapProjectRow(res.rows[0]);
}

async function createProject(project) {
  const res = await query(
    `INSERT INTO projects (
       id, client_id, name, status, description, start_date, target_end_date, metadata, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *;`,
    [
      project.id,
      project.clientId,
      project.name,
      project.status || "PLANNED",
      project.description || null,
      project.startDate ? new Date(project.startDate) : null,
      project.targetEndDate ? new Date(project.targetEndDate) : null,
      JSON.stringify(project.metadata || {}),
      project.createdAt ? new Date(project.createdAt) : new Date(),
      project.updatedAt ? new Date(project.updatedAt) : new Date()
    ]
  );
  return mapProjectRow(res.rows[0]);
}

async function updateProject(id, updates = {}) {
  const existing = await getProjectById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE projects SET
       client_id = $1, name = $2, status = $3, description = $4,
       start_date = $5, target_end_date = $6, metadata = $7, updated_at = $8
     WHERE id = $9
     RETURNING *;`,
    [
      merged.clientId,
      merged.name,
      merged.status,
      merged.description || null,
      merged.startDate ? new Date(merged.startDate) : null,
      merged.targetEndDate ? new Date(merged.targetEndDate) : null,
      JSON.stringify(merged.metadata || {}),
      new Date(),
      id
    ]
  );
  return mapProjectRow(res.rows[0]);
}

async function deleteProject(id) {
  const res = await query(`DELETE FROM projects WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearProjects() {
  await query(`DELETE FROM projects;`);
  return true;
}

// ==========================================
// 2. ONBOARDING
// ==========================================

function mapOnboardingRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    projectId: row.project_id,
    status: row.status,
    checklist: typeof row.checklist === "string" ? JSON.parse(row.checklist) : (row.checklist || []),
    currentStep: row.current_step,
    kickoffNotes: row.kickoff_notes || "",
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getOnboardingRecords() {
  const res = await query(`SELECT * FROM onboarding ORDER BY created_at DESC;`);
  return res.rows.map(mapOnboardingRow);
}

async function getOnboardingByClientId(clientId) {
  const res = await query(`SELECT * FROM onboarding WHERE client_id = $1 LIMIT 1;`, [clientId]);
  return mapOnboardingRow(res.rows[0]);
}

async function createOnboarding(record) {
  const res = await query(
    `INSERT INTO onboarding (
       id, client_id, project_id, status, checklist, current_step, kickoff_notes, completed_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *;`,
    [
      record.id,
      record.clientId,
      record.projectId || null,
      record.status || "NOT_STARTED",
      JSON.stringify(record.checklist || []),
      record.currentStep || null,
      record.kickoffNotes || null,
      record.completedAt ? new Date(record.completedAt) : null,
      record.createdAt ? new Date(record.createdAt) : new Date(),
      record.updatedAt ? new Date(record.updatedAt) : new Date()
    ]
  );
  return mapOnboardingRow(res.rows[0]);
}

async function updateOnboarding(id, updates = {}) {
  const resPrev = await query(`SELECT * FROM onboarding WHERE id = $1 LIMIT 1;`, [id]);
  const existing = mapOnboardingRow(resPrev.rows[0]);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE onboarding SET
       client_id = $1, project_id = $2, status = $3, checklist = $4,
       current_step = $5, kickoff_notes = $6, completed_at = $7, updated_at = $8
     WHERE id = $9
     RETURNING *;`,
    [
      merged.clientId,
      merged.projectId || null,
      merged.status,
      JSON.stringify(merged.checklist || []),
      merged.currentStep || null,
      merged.kickoffNotes || null,
      merged.completedAt ? new Date(merged.completedAt) : null,
      new Date(),
      id
    ]
  );
  return mapOnboardingRow(res.rows[0]);
}

async function clearOnboarding() {
  await query(`DELETE FROM onboarding;`);
  return true;
}

// ==========================================
// 3. REQUIREMENTS
// ==========================================

function mapRequirementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    category: row.category,
    priority: row.priority,
    status: row.status,
    notes: row.notes || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getRequirements(filters = {}) {
  let sql = `SELECT * FROM requirements WHERE 1=1`;
  const params = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    sql += ` AND project_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY created_at ASC;`;
  const res = await query(sql, params);
  return res.rows.map(mapRequirementRow);
}

async function getRequirementById(id) {
  const res = await query(`SELECT * FROM requirements WHERE id = $1 LIMIT 1;`, [id]);
  return mapRequirementRow(res.rows[0]);
}

async function createRequirement(req) {
  const res = await query(
    `INSERT INTO requirements (
       id, project_id, title, description, category, priority, status, notes, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *;`,
    [
      req.id,
      req.projectId,
      req.title,
      req.description || null,
      req.category || null,
      req.priority || "MEDIUM",
      req.status || "PENDING",
      req.notes || null,
      req.createdAt ? new Date(req.createdAt) : new Date(),
      req.updatedAt ? new Date(req.updatedAt) : new Date()
    ]
  );
  return mapRequirementRow(res.rows[0]);
}

async function updateRequirement(id, updates = {}) {
  const existing = await getRequirementById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE requirements SET
       project_id = $1, title = $2, description = $3, category = $4,
       priority = $5, status = $6, notes = $7, updated_at = $8
     WHERE id = $9
     RETURNING *;`,
    [
      merged.projectId,
      merged.title,
      merged.description || null,
      merged.category || null,
      merged.priority || "MEDIUM",
      merged.status || "PENDING",
      merged.notes || null,
      new Date(),
      id
    ]
  );
  return mapRequirementRow(res.rows[0]);
}

async function deleteRequirement(id) {
  const res = await query(`DELETE FROM requirements WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearRequirements() {
  await query(`DELETE FROM requirements;`);
  return true;
}

// ==========================================
// 4. MILESTONES
// ==========================================

function mapMilestoneRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    dueDate: row.due_date ? new Date(row.due_date).toISOString().split("T")[0] : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getMilestones(filters = {}) {
  let sql = `SELECT * FROM milestones WHERE 1=1`;
  const params = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    sql += ` AND project_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY due_date ASC NULLS LAST, created_at ASC;`;
  const res = await query(sql, params);
  return res.rows.map(mapMilestoneRow);
}

async function getMilestoneById(id) {
  const res = await query(`SELECT * FROM milestones WHERE id = $1 LIMIT 1;`, [id]);
  return mapMilestoneRow(res.rows[0]);
}

async function createMilestone(m) {
  const res = await query(
    `INSERT INTO milestones (
       id, project_id, title, description, status, due_date, completed_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *;`,
    [
      m.id,
      m.projectId,
      m.title,
      m.description || null,
      m.status || "PENDING",
      m.dueDate ? new Date(m.dueDate) : null,
      m.completedAt ? new Date(m.completedAt) : null,
      m.createdAt ? new Date(m.createdAt) : new Date(),
      m.updatedAt ? new Date(m.updatedAt) : new Date()
    ]
  );
  return mapMilestoneRow(res.rows[0]);
}

async function updateMilestone(id, updates = {}) {
  const existing = await getMilestoneById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE milestones SET
       project_id = $1, title = $2, description = $3, status = $4,
       due_date = $5, completed_at = $6, updated_at = $7
     WHERE id = $8
     RETURNING *;`,
    [
      merged.projectId,
      merged.title,
      merged.description || null,
      merged.status,
      merged.dueDate ? new Date(merged.dueDate) : null,
      merged.completedAt ? new Date(merged.completedAt) : null,
      new Date(),
      id
    ]
  );
  return mapMilestoneRow(res.rows[0]);
}

async function deleteMilestone(id) {
  const res = await query(`DELETE FROM milestones WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearMilestones() {
  await query(`DELETE FROM milestones;`);
  return true;
}

// ==========================================
// 5. PROJECT TASKS
// ==========================================

function mapTaskRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    priority: row.priority,
    owner: row.owner || "",
    dueDate: row.due_date ? new Date(row.due_date).toISOString().split("T")[0] : null,
    notes: row.notes || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getTasks(filters = {}) {
  let sql = `SELECT * FROM project_tasks WHERE 1=1`;
  const params = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    sql += ` AND project_id = $${params.length}`;
  }
  if (filters.milestoneId) {
    params.push(filters.milestoneId);
    sql += ` AND milestone_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ` ORDER BY due_date ASC NULLS LAST, created_at ASC;`;
  const res = await query(sql, params);
  return res.rows.map(mapTaskRow);
}

async function getTaskById(id) {
  const res = await query(`SELECT * FROM project_tasks WHERE id = $1 LIMIT 1;`, [id]);
  return mapTaskRow(res.rows[0]);
}

async function createTask(t) {
  const res = await query(
    `INSERT INTO project_tasks (
       id, project_id, milestone_id, title, description, status, priority, owner, due_date, notes, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *;`,
    [
      t.id,
      t.projectId,
      t.milestoneId || null,
      t.title,
      t.description || null,
      t.status || "TODO",
      t.priority || "MEDIUM",
      t.owner || null,
      t.dueDate ? new Date(t.dueDate) : null,
      t.notes || null,
      t.createdAt ? new Date(t.createdAt) : new Date(),
      t.updatedAt ? new Date(t.updatedAt) : new Date()
    ]
  );
  return mapTaskRow(res.rows[0]);
}

async function updateTask(id, updates = {}) {
  const existing = await getTaskById(id);
  if (!existing) return null;

  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  const res = await query(
    `UPDATE project_tasks SET
       project_id = $1, milestone_id = $2, title = $3, description = $4,
       status = $5, priority = $6, owner = $7, due_date = $8, notes = $9, updated_at = $10
     WHERE id = $11
     RETURNING *;`,
    [
      merged.projectId,
      merged.milestoneId || null,
      merged.title,
      merged.description || null,
      merged.status,
      merged.priority,
      merged.owner || null,
      merged.dueDate ? new Date(merged.dueDate) : null,
      merged.notes || null,
      new Date(),
      id
    ]
  );
  return mapTaskRow(res.rows[0]);
}

async function deleteTask(id) {
  const res = await query(`DELETE FROM project_tasks WHERE id = $1 RETURNING id;`, [id]);
  return res.rowCount > 0;
}

async function clearTasks() {
  await query(`DELETE FROM project_tasks;`);
  return true;
}

module.exports = {
  // Projects
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  clearProjects,
  // Onboarding
  getOnboardingRecords,
  getOnboardingByClientId,
  createOnboarding,
  updateOnboarding,
  clearOnboarding,
  // Requirements
  getRequirements,
  getRequirementById,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  clearRequirements,
  // Milestones
  getMilestones,
  getMilestoneById,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  clearMilestones,
  // Tasks
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  clearTasks,
  mapProjectRow,
  mapOnboardingRow,
  mapRequirementRow,
  mapMilestoneRow,
  mapTaskRow
};
