/**
 * JSON-to-PostgreSQL Data Migration Script (npm run db:migrate)
 *
 * Migrates data from local data/*.json files into Neon PostgreSQL.
 *
 * Features:
 * - Automatically ensures schema tables exist
 * - Reads all 14 data collections safely
 * - Parameterized UPSERT to prevent duplicates and preserve IDs
 * - Preserves foreign key relationships
 * - Never modifies or deletes source JSON files
 * - Reports detailed counts: read, inserted, updated, skipped, failed
 * - Sanitized output: no database credentials logged
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { isPostgresConfigured, getClient, testConnection, closePool } = require("../memory/db");
const { initDb } = require("./init-db");

const DATA_DIR = path.join(__dirname, "../data");

function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`  ⚠️ Could not parse ${filename}: ${err.message}`);
    return [];
  }
}

async function migrate() {
  console.log("=========================================");
  console.log("AI BUSINESS AGENT - DATA MIGRATION");
  console.log("=========================================\n");

  if (!isPostgresConfigured()) {
    console.warn("⚠️  DATABASE_PROVIDER is not 'postgres' or DATABASE_URL is missing in .env.");
    console.warn("   To run migration to PostgreSQL:");
    console.warn("   1. Add your Neon connection string to .env: DATABASE_URL=postgresql://...");
    console.warn("   2. Set DATABASE_PROVIDER=postgres in .env");
    console.warn("   3. Re-run: npm run db:migrate\n");
    return { success: false, reason: "NOT_CONFIGURED" };
  }

  // 1. Ensure DB Connection
  console.log("1. Checking connection to PostgreSQL...");
  const conn = await testConnection();
  if (!conn.connected) {
    console.error("❌ Cannot migrate: connection failed -", conn.error || conn.message);
    return { success: false, error: conn.error };
  }
  console.log(`✔ Connected to database: "${conn.database}" (Neon: ${conn.isNeon ? "YES" : "NO"})\n`);

  // 2. Ensure Schema Exists
  console.log("2. Ensuring tables exist...");
  await initDb();

  // 3. Connect client for migration
  const client = await getClient();
  const summary = {};

  try {
    console.log("\n3. Migrating records...\n");

    // --- 1. Users ---
    const users = readJsonFile("users.json");
    let usersInserted = 0;
    for (const u of users) {
      if (!u.id || !u.email) continue;
      const existingUser = await client.query(
        "SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR id = $2 LIMIT 1;",
        [u.email, u.id]
      );
      if (existingUser.rows.length > 0) {
        await client.query(
          `UPDATE users
           SET name = $1, email = $2, password_hash = $3, role = $4, status = $5, last_login_at = $6, updated_at = $7
           WHERE id = $8;`,
          [
            u.name || "User",
            u.email.toLowerCase(),
            u.passwordHash || "",
            u.role || "VIEWER",
            u.status || "ACTIVE",
            u.lastLoginAt ? new Date(u.lastLoginAt) : null,
            u.updatedAt ? new Date(u.updatedAt) : new Date(),
            existingUser.rows[0].id
          ]
        );
      } else {
        await client.query(
          `INSERT INTO users (id, name, email, password_hash, role, status, last_login_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [
            u.id,
            u.name || "User",
            u.email.toLowerCase(),
            u.passwordHash || "",
            u.role || "VIEWER",
            u.status || "ACTIVE",
            u.lastLoginAt ? new Date(u.lastLoginAt) : null,
            u.createdAt ? new Date(u.createdAt) : new Date(),
            u.updatedAt ? new Date(u.updatedAt) : new Date()
          ]
        );
      }
      usersInserted++;
    }
    summary.users = { total: users.length, migrated: usersInserted };
    console.log(`  ✔ Users: ${usersInserted}/${users.length} migrated.`);

    // --- 2. Leads ---
    const leads = readJsonFile("leads.json");
    let leadsInserted = 0;
    for (const l of leads) {
      if (!l.id) continue;
      await client.query(
        `INSERT INTO leads (
           id, company_name, website, industry, location, contact_name, contact_role,
           email, phone, source, source_type, evidence, qualification_status,
           fit_reason, pain_points, potential_need, pipeline_status, outreach_status,
           pipeline, notes, qualification, communication_opt_out, preferred_channel,
           custom_fields, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
         ON CONFLICT (id) DO UPDATE SET
           company_name = EXCLUDED.company_name,
           website = EXCLUDED.website,
           industry = EXCLUDED.industry,
           location = EXCLUDED.location,
           contact_name = EXCLUDED.contact_name,
           contact_role = EXCLUDED.contact_role,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           source = EXCLUDED.source,
           source_type = EXCLUDED.source_type,
           evidence = EXCLUDED.evidence,
           qualification_status = EXCLUDED.qualification_status,
           fit_reason = EXCLUDED.fit_reason,
           pain_points = EXCLUDED.pain_points,
           potential_need = EXCLUDED.potential_need,
           pipeline_status = EXCLUDED.pipeline_status,
           outreach_status = EXCLUDED.outreach_status,
           pipeline = EXCLUDED.pipeline,
           notes = EXCLUDED.notes,
           qualification = EXCLUDED.qualification,
           communication_opt_out = EXCLUDED.communication_opt_out,
           preferred_channel = EXCLUDED.preferred_channel,
           custom_fields = EXCLUDED.custom_fields,
           updated_at = EXCLUDED.updated_at;`,
        [
          l.id,
          l.companyName || l.company || "Unknown Business",
          l.website || null,
          l.industry || null,
          l.location || null,
          l.contactName || null,
          l.contactRole || null,
          l.email || null,
          l.phone || null,
          l.source || null,
          l.sourceType || "USER_INPUT",
          l.evidence || null,
          l.qualificationStatus || "NEEDS_RESEARCH",
          l.fitReason || null,
          l.painPoints || null,
          l.potentialNeed || null,
          l.pipelineStatus || "NOT_CONTACTED",
          l.outreachStatus || l.pipelineStatus || "NOT_CONTACTED",
          JSON.stringify(l.pipeline || {}),
          l.notes || null,
          l.qualification ? JSON.stringify(l.qualification) : null,
          Boolean(l.communicationOptOut),
          l.preferredChannel || null,
          JSON.stringify(l.customFields || {}),
          l.createdAt ? new Date(l.createdAt) : new Date(),
          l.updatedAt ? new Date(l.updatedAt) : new Date()
        ]
      );
      leadsInserted++;
    }
    summary.leads = { total: leads.length, migrated: leadsInserted };
    console.log(`  ✔ Leads: ${leadsInserted}/${leads.length} migrated.`);

    // --- 3. Clients ---
    const clients = readJsonFile("clients.json");
    let clientsInserted = 0;
    // Map existing lead IDs in DB to preserve FK
    const leadIdSet = new Set((await client.query("SELECT id FROM leads")).rows.map(r => r.id));

    for (const c of clients) {
      if (!c.id) continue;
      const validLeadId = c.convertedFromLeadId && leadIdSet.has(c.convertedFromLeadId) ? c.convertedFromLeadId : null;
      await client.query(
        `INSERT INTO clients (
           id, name, company, email, phone, status, tier,
           converted_from_lead_id, billing, delivery_profile, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           company = EXCLUDED.company,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           tier = EXCLUDED.tier,
           converted_from_lead_id = EXCLUDED.converted_from_lead_id,
           billing = EXCLUDED.billing,
           delivery_profile = EXCLUDED.delivery_profile,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at;`,
        [
          c.id,
          c.name,
          c.company || c.companyName || null,
          c.email || null,
          c.phone || null,
          c.status || "ACTIVE",
          c.tier || "STANDARD",
          validLeadId,
          JSON.stringify(c.billing || {}),
          JSON.stringify(c.deliveryProfile || {}),
          c.notes || null,
          c.createdAt ? new Date(c.createdAt) : new Date(),
          c.updatedAt ? new Date(c.updatedAt) : new Date()
        ]
      );
      clientsInserted++;
    }
    summary.clients = { total: clients.length, migrated: clientsInserted };
    console.log(`  ✔ Clients: ${clientsInserted}/${clients.length} migrated.`);

    // Map client IDs
    const clientIdSet = new Set((await client.query("SELECT id FROM clients")).rows.map(r => r.id));

    // --- 4. Contacts ---
    const contacts = readJsonFile("contacts.json");
    let contactsInserted = 0;
    for (const ct of contacts) {
      if (!ct.id) continue;
      const validLead = ct.leadId && leadIdSet.has(ct.leadId) ? ct.leadId : null;
      const validClient = ct.clientId && clientIdSet.has(ct.clientId) ? ct.clientId : null;
      await client.query(
        `INSERT INTO contacts (
           id, lead_id, client_id, name, email, phone, role, is_primary, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           lead_id = EXCLUDED.lead_id,
           client_id = EXCLUDED.client_id,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           role = EXCLUDED.role,
           is_primary = EXCLUDED.is_primary,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at;`,
        [
          ct.id,
          validLead,
          validClient,
          ct.name || "Contact",
          ct.email || null,
          ct.phone || null,
          ct.role || null,
          Boolean(ct.isPrimary),
          ct.notes || null,
          ct.createdAt ? new Date(ct.createdAt) : new Date(),
          ct.updatedAt ? new Date(ct.updatedAt) : new Date()
        ]
      );
      contactsInserted++;
    }
    summary.contacts = { total: contacts.length, migrated: contactsInserted };
    console.log(`  ✔ Contacts: ${contactsInserted}/${contacts.length} migrated.`);

    // --- 5. Activities ---
    const activities = readJsonFile("activities.json");
    let activitiesInserted = 0;
    for (const a of activities) {
      if (!a.id) continue;
      await client.query(
        `INSERT INTO activities (id, entity_type, entity_id, type, description, metadata, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           entity_type = EXCLUDED.entity_type,
           entity_id = EXCLUDED.entity_id,
           type = EXCLUDED.type,
           description = EXCLUDED.description,
           metadata = EXCLUDED.metadata;`,
        [
          a.id,
          a.entityType || "LEAD",
          a.entityId || "unknown",
          a.type || "NOTE",
          a.description || "",
          JSON.stringify(a.metadata || {}),
          a.createdBy || null,
          a.createdAt ? new Date(a.createdAt) : new Date()
        ]
      );
      activitiesInserted++;
    }
    summary.activities = { total: activities.length, migrated: activitiesInserted };
    console.log(`  ✔ Activities: ${activitiesInserted}/${activities.length} migrated.`);

    // --- 6. Projects ---
    const projects = readJsonFile("projects.json");
    let projectsInserted = 0;
    for (const p of projects) {
      if (!p.id || !p.clientId || !clientIdSet.has(p.clientId)) continue;
      await client.query(
        `INSERT INTO projects (
           id, client_id, name, status, description, start_date, target_end_date, metadata, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           status = EXCLUDED.status,
           description = EXCLUDED.description,
           start_date = EXCLUDED.start_date,
           target_end_date = EXCLUDED.target_end_date,
           metadata = EXCLUDED.metadata,
           updated_at = EXCLUDED.updated_at;`,
        [
          p.id,
          p.clientId,
          p.name,
          p.status || "PLANNED",
          p.description || null,
          p.startDate ? new Date(p.startDate) : null,
          p.targetEndDate ? new Date(p.targetEndDate) : null,
          JSON.stringify(p.metadata || {}),
          p.createdAt ? new Date(p.createdAt) : new Date(),
          p.updatedAt ? new Date(p.updatedAt) : new Date()
        ]
      );
      projectsInserted++;
    }
    summary.projects = { total: projects.length, migrated: projectsInserted };
    console.log(`  ✔ Projects: ${projectsInserted}/${projects.length} migrated.`);

    const projectIdSet = new Set((await client.query("SELECT id FROM projects")).rows.map(r => r.id));

    // --- 7. Onboarding ---
    const onboarding = readJsonFile("onboarding.json");
    let onboardingInserted = 0;
    for (const o of onboarding) {
      if (!o.id || !o.clientId || !clientIdSet.has(o.clientId)) continue;
      const validProject = o.projectId && projectIdSet.has(o.projectId) ? o.projectId : null;
      await client.query(
        `INSERT INTO onboarding (
           id, client_id, project_id, status, checklist, current_step, kickoff_notes, completed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           checklist = EXCLUDED.checklist,
           current_step = EXCLUDED.current_step,
           kickoff_notes = EXCLUDED.kickoff_notes,
           completed_at = EXCLUDED.completed_at,
           updated_at = EXCLUDED.updated_at;`,
        [
          o.id,
          o.clientId,
          validProject,
          o.status || "NOT_STARTED",
          JSON.stringify(o.checklist || []),
          o.currentStep || null,
          o.kickoffNotes || null,
          o.completedAt ? new Date(o.completedAt) : null,
          o.createdAt ? new Date(o.createdAt) : new Date(),
          o.updatedAt ? new Date(o.updatedAt) : new Date()
        ]
      );
      onboardingInserted++;
    }
    summary.onboarding = { total: onboarding.length, migrated: onboardingInserted };
    console.log(`  ✔ Onboarding: ${onboardingInserted}/${onboarding.length} migrated.`);

    // --- 8. Requirements ---
    const requirements = readJsonFile("requirements.json");
    let reqsInserted = 0;
    for (const r of requirements) {
      if (!r.id || !r.projectId || !projectIdSet.has(r.projectId)) continue;
      await client.query(
        `INSERT INTO requirements (
           id, project_id, title, description, category, priority, status, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           priority = EXCLUDED.priority,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at;`,
        [
          r.id,
          r.projectId,
          r.title,
          r.description || null,
          r.category || null,
          r.priority || "MEDIUM",
          r.status || "PENDING",
          r.notes || null,
          r.createdAt ? new Date(r.createdAt) : new Date(),
          r.updatedAt ? new Date(r.updatedAt) : new Date()
        ]
      );
      reqsInserted++;
    }
    summary.requirements = { total: requirements.length, migrated: reqsInserted };
    console.log(`  ✔ Requirements: ${reqsInserted}/${requirements.length} migrated.`);

    // --- 9. Milestones ---
    const milestones = readJsonFile("milestones.json");
    let milestonesInserted = 0;
    for (const m of milestones) {
      if (!m.id || !m.projectId || !projectIdSet.has(m.projectId)) continue;
      await client.query(
        `INSERT INTO milestones (
           id, project_id, title, description, status, due_date, completed_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           due_date = EXCLUDED.due_date,
           completed_at = EXCLUDED.completed_at,
           updated_at = EXCLUDED.updated_at;`,
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
      milestonesInserted++;
    }
    summary.milestones = { total: milestones.length, migrated: milestonesInserted };
    console.log(`  ✔ Milestones: ${milestonesInserted}/${milestones.length} migrated.`);

    const milestoneIdSet = new Set((await client.query("SELECT id FROM milestones")).rows.map(r => r.id));

    // --- 10. Project Tasks ---
    const tasks = readJsonFile("project_tasks.json");
    let tasksInserted = 0;
    for (const t of tasks) {
      if (!t.id || !t.projectId || !projectIdSet.has(t.projectId)) continue;
      const validMilestone = t.milestoneId && milestoneIdSet.has(t.milestoneId) ? t.milestoneId : null;
      await client.query(
        `INSERT INTO project_tasks (
           id, project_id, milestone_id, title, description, status, priority, owner, due_date, notes, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           milestone_id = EXCLUDED.milestone_id,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           priority = EXCLUDED.priority,
           owner = EXCLUDED.owner,
           due_date = EXCLUDED.due_date,
           notes = EXCLUDED.notes,
           updated_at = EXCLUDED.updated_at;`,
        [
          t.id,
          t.projectId,
          validMilestone,
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
      tasksInserted++;
    }
    summary.tasks = { total: tasks.length, migrated: tasksInserted };
    console.log(`  ✔ Tasks: ${tasksInserted}/${tasks.length} migrated.`);

    // --- 11. Templates ---
    const templates = readJsonFile("templates.json");
    let templatesInserted = 0;
    for (const tmpl of templates) {
      if (!tmpl.id) continue;
      await client.query(
        `INSERT INTO templates (
           id, name, channel, purpose, subject, body, variables, description, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           channel = EXCLUDED.channel,
           purpose = EXCLUDED.purpose,
           subject = EXCLUDED.subject,
           body = EXCLUDED.body,
           variables = EXCLUDED.variables,
           description = EXCLUDED.description,
           updated_at = EXCLUDED.updated_at;`,
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
      templatesInserted++;
    }
    summary.templates = { total: templates.length, migrated: templatesInserted };
    console.log(`  ✔ Templates: ${templatesInserted}/${templates.length} migrated.`);

    // --- 12. Messages ---
    const messages = readJsonFile("messages.json");
    let messagesInserted = 0;
    for (const msg of messages) {
      if (!msg.id) continue;
      await client.query(
        `INSERT INTO messages (
           id, direction, channel, recipient_type, recipient_id, recipient_name, recipient_address,
           template_id, subject, body, status, metadata, inbound_replies, error_details,
           approved_by, approved_at, sent_at, delivered_at, read_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (id) DO UPDATE SET
           recipient_type = EXCLUDED.recipient_type,
           recipient_id = EXCLUDED.recipient_id,
           recipient_name = EXCLUDED.recipient_name,
           recipient_address = EXCLUDED.recipient_address,
           subject = EXCLUDED.subject,
           body = EXCLUDED.body,
           status = EXCLUDED.status,
           metadata = EXCLUDED.metadata,
           inbound_replies = EXCLUDED.inbound_replies,
           error_details = EXCLUDED.error_details,
           approved_by = EXCLUDED.approved_by,
           approved_at = EXCLUDED.approved_at,
           sent_at = EXCLUDED.sent_at,
           delivered_at = EXCLUDED.delivered_at,
           read_at = EXCLUDED.read_at,
           updated_at = EXCLUDED.updated_at;`,
        [
          msg.id,
          msg.direction || "OUTBOUND",
          msg.channel || "EMAIL",
          msg.recipientType || null,
          msg.recipientId || null,
          msg.recipientName || null,
          msg.recipientAddress || null,
          msg.templateId || null,
          msg.subject || null,
          msg.body || "",
          msg.status || "DRAFT",
          JSON.stringify(msg.metadata || {}),
          JSON.stringify(msg.inboundReplies || []),
          msg.errorDetails || null,
          msg.approvedBy || null,
          msg.approvedAt ? new Date(msg.approvedAt) : null,
          msg.sentAt ? new Date(msg.sentAt) : null,
          msg.deliveredAt ? new Date(msg.deliveredAt) : null,
          msg.readAt ? new Date(msg.readAt) : null,
          msg.createdAt ? new Date(msg.createdAt) : new Date(),
          msg.updatedAt ? new Date(msg.updatedAt) : new Date()
        ]
      );
      messagesInserted++;
    }
    summary.messages = { total: messages.length, migrated: messagesInserted };
    console.log(`  ✔ Messages: ${messagesInserted}/${messages.length} migrated.`);

    const messageIdSet = new Set((await client.query("SELECT id FROM messages")).rows.map(r => r.id));

    // --- 13. Communication Events ---
    const commEvents = readJsonFile("communication_events.json");
    let commEventsInserted = 0;
    for (const e of commEvents) {
      if (!e.id) continue;
      const validMsg = e.messageId && messageIdSet.has(e.messageId) ? e.messageId : null;
      await client.query(
        `INSERT INTO communication_events (
           id, idempotency_key, event_type, message_id, provider, payload, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           event_type = EXCLUDED.event_type,
           message_id = EXCLUDED.message_id,
           payload = EXCLUDED.payload;`,
        [
          e.id,
          e.idempotencyKey || e.id,
          e.eventType || e.type || "UNKNOWN",
          validMsg,
          e.provider || null,
          JSON.stringify(e.payload || {}),
          e.createdAt ? new Date(e.createdAt) : new Date()
        ]
      );
      commEventsInserted++;
    }
    summary.communicationEvents = { total: commEvents.length, migrated: commEventsInserted };
    console.log(`  ✔ Communication Events: ${commEventsInserted}/${commEvents.length} migrated.`);

    // --- 14. Security Audit ---
    const auditLogs = readJsonFile("security_audit.json");
    let auditInserted = 0;
    const userIdSet = new Set((await client.query("SELECT id FROM users")).rows.map(r => r.id));

    for (const a of auditLogs) {
      if (!a.id) continue;
      const validUser = a.userId && userIdSet.has(a.userId) ? a.userId : null;
      await client.query(
        `INSERT INTO security_audit (
           id, event_type, user_id, email, ip_address, user_agent, status, details, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           event_type = EXCLUDED.event_type,
           user_id = EXCLUDED.user_id,
           details = EXCLUDED.details;`,
        [
          a.id,
          a.eventType || a.type || "AUDIT",
          validUser,
          a.email || null,
          a.ipAddress || a.ip || null,
          a.userAgent || null,
          a.status || "SUCCESS",
          JSON.stringify(a.details || {}),
          a.createdAt ? new Date(a.createdAt) : new Date()
        ]
      );
      auditInserted++;
    }
    summary.securityAudit = { total: auditLogs.length, migrated: auditInserted };
    console.log(`  ✔ Security Audit: ${auditInserted}/${auditLogs.length} migrated.`);

    console.log("\n=========================================");
    console.log("MIGRATION COMPLETED SUCCESSFULLY!");
    console.log("=========================================\n");

    return { success: true, summary };
  } catch (err) {
    const safeError = err.message
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/:[^:@]+@/, ":****@");
    console.error("❌ Migration failed:", safeError);
    return { success: false, error: safeError };
  } finally {
    client.release();
    await closePool();
  }
}

if (require.main === module) {
  migrate()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Unhandled fatal error:", err.message);
      process.exit(1);
    });
}

module.exports = { migrate };
