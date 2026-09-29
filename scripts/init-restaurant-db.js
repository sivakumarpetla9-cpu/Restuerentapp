/**
 * Restaurant OS Database Schema Initialization & Validation Script
 * (npm run db:init:restaurant or node scripts/init-restaurant-db.js)
 *
 * Connects to PostgreSQL (Neon), executes restaurant-schema.sql in a non-destructive manner
 * (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS), and verifies creation of all 8 tables.
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { isPostgresConfigured, getClient, testConnection, closePool } = require("../memory/db");

const RESTAURANT_TABLES = [
  "restaurant_branches",
  "restaurant_tables",
  "table_sessions",
  "menu_categories",
  "menu_items",
  "restaurant_orders",
  "order_items",
  "restaurant_bills"
];

async function initRestaurantDb(options = {}) {
  console.log("=========================================");
  console.log("RESTAURANT OS v1 - DATABASE INITIALIZATION");
  console.log("=========================================\n");

  if (!isPostgresConfigured()) {
    console.warn("⚠️  DATABASE_PROVIDER is not 'postgres' or DATABASE_URL is missing.");
    return { success: false, reason: "NOT_CONFIGURED" };
  }

  console.log("1. Testing connection to PostgreSQL / Neon...");
  const connStatus = await testConnection();
  if (!connStatus.connected) {
    console.error("❌ Connection failed:", connStatus.error || connStatus.message);
    return { success: false, error: connStatus.error };
  }

  console.log(`✔ Connected to database: "${connStatus.database}"`);
  console.log(`  Neon detected: ${connStatus.isNeon ? "YES" : "NO"}\n`);

  const schemaPath = path.join(__dirname, "restaurant-schema.sql");
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  if (options.dryRun) {
    console.log("2. DRY RUN: Validating SQL script without execution...");
    console.log(`  Schema file length: ${schemaSql.length} bytes`);
    console.log(`  Tables to be introduced: ${RESTAURANT_TABLES.join(", ")}`);
    return { success: true, dryRun: true };
  }

  console.log("2. Executing restaurant-schema.sql non-destructive DDL...");
  const client = await getClient();
  try {
    await client.query("BEGIN;");
    await client.query(schemaSql);
    await client.query("COMMIT;");
    console.log("✔ DDL execution completed successfully.\n");

    console.log("3. Verifying created Restaurant OS tables...");
    const res = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name;`
    );

    const existingTables = res.rows.map(r => r.table_name);
    let allCreated = true;

    for (const table of RESTAURANT_TABLES) {
      if (existingTables.includes(table)) {
        console.log(`  ✔ Table [${table}] is verified present.`);
      } else {
        console.error(`  ❌ Table [${table}] is MISSING!`);
        allCreated = false;
      }
    }

    if (allCreated) {
      console.log(`\n✔ All 8 Restaurant OS tables verified successfully in Neon PostgreSQL!`);
      return { success: true, tables: RESTAURANT_TABLES };
    } else {
      console.error("\n❌ Some restaurant tables failed to verify.");
      return { success: false, reason: "MISSING_TABLES" };
    }
  } catch (err) {
    await client.query("ROLLBACK;");
    const safeError = err.message
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/:[^:@]+@/, ":****@");
    console.error("❌ Restaurant schema execution error:", safeError);
    return { success: false, error: safeError };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initRestaurantDb()
    .then(async (result) => {
      await closePool();
      if (!result.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Unexpected error:", err);
      await closePool();
      process.exit(1);
    });
}

module.exports = { initRestaurantDb, RESTAURANT_TABLES };
