/**
 * Database Schema Initialization Script (npm run db:init)
 *
 * Connects to PostgreSQL (Neon), executes schema.sql,
 * verifies creation of all 14 tables, and reports status.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { isPostgresConfigured, getClient, testConnection, closePool } = require("../memory/db");

const EXPECTED_TABLES = [
  "users",
  "leads",
  "clients",
  "contacts",
  "activities",
  "projects",
  "onboarding",
  "requirements",
  "milestones",
  "project_tasks",
  "templates",
  "messages",
  "communication_events",
  "security_audit"
];

async function initDb() {
  console.log("=========================================");
  console.log("AI BUSINESS AGENT - DATABASE INITIALIZATION");
  console.log("=========================================\n");

  if (!isPostgresConfigured()) {
    console.warn("⚠️  DATABASE_PROVIDER is not 'postgres' or DATABASE_URL is missing in .env.");
    console.warn("   To initialize PostgreSQL schema:");
    console.warn("   1. Add your Neon connection string to .env: DATABASE_URL=postgresql://...");
    console.warn("   2. Set DATABASE_PROVIDER=postgres in .env");
    console.warn("   3. Re-run: npm run db:init\n");
    return { success: false, reason: "NOT_CONFIGURED" };
  }

  console.log("1. Testing connection to PostgreSQL / Neon...");
  const connStatus = await testConnection();
  if (!connStatus.connected) {
    console.error("❌ Connection failed:", connStatus.error || connStatus.message);
    return { success: false, error: connStatus.error };
  }

  console.log(`✔ Connected to database: "${connStatus.database}"`);
  console.log(`  Neon detected: ${connStatus.isNeon ? "YES" : "NO"}`);
  console.log(`  Server: ${connStatus.serverVersion}\n`);

  console.log("2. Executing schema.sql DDL...");
  const schemaPath = path.join(__dirname, "schema.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const client = await getClient();
  try {
    await client.query(schemaSql);
    console.log("✔ DDL execution completed successfully.\n");

    console.log("3. Verifying created tables...");
    const res = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name;`
    );

    const existingTables = res.rows.map(r => r.table_name);
    let allCreated = true;

    for (const table of EXPECTED_TABLES) {
      if (existingTables.includes(table)) {
        console.log(`  ✔ Table [${table}] is present.`);
      } else {
        console.error(`  ❌ Table [${table}] is MISSING!`);
        allCreated = false;
      }
    }

    if (allCreated) {
      console.log(`\n✔ All ${EXPECTED_TABLES.length} tables verified successfully in PostgreSQL!`);
      return { success: true, tables: existingTables };
    } else {
      console.error("\n❌ Some tables failed to create.");
      return { success: false, reason: "MISSING_TABLES" };
    }
  } catch (err) {
    const safeError = err.message
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/:[^:@]+@/, ":****@");
    console.error("❌ Schema initialization error:", safeError);
    return { success: false, error: safeError };
  } finally {
    client.release();
    if (require.main === module) {
      await closePool();
    }
  }
}

if (require.main === module) {
  initDb()
    .then((result) => {
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("Unhandled fatal error:", err.message);
      process.exit(1);
    });
}

module.exports = { initDb, EXPECTED_TABLES };
