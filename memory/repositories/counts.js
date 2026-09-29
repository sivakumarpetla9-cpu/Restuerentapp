/**
 * Database Counts Helper
 *
 * Reads actual row counts from all 14 tables in PostgreSQL.
 */

const { query, isPostgresConfigured } = require("../db");

async function getDatabaseCounts() {
  if (!isPostgresConfigured()) {
    return { configured: false, counts: null };
  }

  const tables = [
    { key: "users", table: "users" },
    { key: "leads", table: "leads" },
    { key: "contacts", table: "contacts" },
    { key: "activities", table: "activities" },
    { key: "clients", table: "clients" },
    { key: "projects", table: "projects" },
    { key: "onboarding", table: "onboarding" },
    { key: "requirements", table: "requirements" },
    { key: "milestones", table: "milestones" },
    { key: "tasks", table: "project_tasks" },
    { key: "templates", table: "templates" },
    { key: "messages", table: "messages" },
    { key: "communicationEvents", table: "communication_events" },
    { key: "securityAudit", table: "security_audit" }
  ];

  const counts = {};
  for (const { key, table } of tables) {
    try {
      const res = await query(`SELECT COUNT(*) AS cnt FROM ${table};`);
      counts[key] = parseInt(res.rows[0].cnt, 10);
    } catch {
      counts[key] = 0;
    }
  }

  return { configured: true, counts };
}

module.exports = { getDatabaseCounts };
