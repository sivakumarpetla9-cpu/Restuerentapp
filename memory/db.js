/**
 * Database Connection Module (Neon PostgreSQL / Local JSON Fallback)
 *
 * Provides a managed connection pool for PostgreSQL with Neon SSL support,
 * safe parameterization, error suppression (no credentials in logs),
 * and connection health testing.
 */

const dns = require("dns");
const net = require("net");

try {
  dns.setDefaultResultOrder("ipv4first");
} catch (_) {}

if (typeof net.setDefaultAutoSelectFamily === "function") {
  try {
    net.setDefaultAutoSelectFamily(false);
  } catch (_) {}
}

const { Pool } = require("pg");
require("dotenv").config();

let pool = null;

/**
 * Returns whether PostgreSQL is the configured database provider and has a connection string.
 */
function isPostgresConfigured() {
  const provider = (process.env.DATABASE_PROVIDER || "").toLowerCase().trim();
  const dbUrl = (process.env.DATABASE_URL || "").trim();
  return provider === "postgres" && dbUrl.length > 0;
}

function isSyncEnabled() {
  if (process.env.NODE_ENV === "test") return false;
  return isPostgresConfigured();
}

/**
 * Parses and sanitizes connection config for Neon PostgreSQL.
 */
function getPoolConfig() {
  const connectionString = (process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    return null;
  }

  // Neon requires SSL. Automatically enable rejectUnauthorized: false unless localhost.
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const ssl = isLocal ? false : { rejectUnauthorized: false };

  return {
    connectionString,
    ssl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000
  };
}

/**
 * Gets or initializes the PostgreSQL connection pool.
 */
function getPool() {
  if (!pool && isPostgresConfigured()) {
    const config = getPoolConfig();
    if (config) {
      pool = new Pool(config);
      pool.on("error", (err) => {
        // Safe server-side diagnostic without leaking credentials
        console.error("[PostgreSQL Pool Error]", err.message);
      });
    }
  }
  return pool;
}

/**
 * Executes a query using the connection pool.
 * @param {string} text - SQL query text with $1, $2 placeholders
 * @param {Array} [params] - Query parameters
 */
async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) {
    throw new Error("PostgreSQL pool is not configured or DATABASE_URL is missing.");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await activePool.query(text, params);
    } catch (err) {
      const msg = (err.message || "").toLowerCase();
      const isTransient = msg.includes("terminated") || msg.includes("timeout") || msg.includes("closed") || msg.includes("connection reset") || err.code === "08P01" || err.code === "57P01";
      if (isTransient && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Acquires a client from the pool for transactional operations.
 */
async function getClient() {
  const activePool = getPool();
  if (!activePool) {
    throw new Error("PostgreSQL pool is not configured or DATABASE_URL is missing.");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await activePool.connect();
    } catch (err) {
      const msg = (err.message || "").toLowerCase();
      const isTransient = msg.includes("terminated") || msg.includes("timeout") || msg.includes("closed") || msg.includes("connection reset") || err.code === "08P01" || err.code === "57P01";
      if (isTransient && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Tests database connectivity.
 * Returns health status object without exposing connection string or credentials.
 */
async function testConnection() {
  if (!isPostgresConfigured()) {
    return {
      connected: false,
      provider: process.env.DATABASE_PROVIDER || "json",
      configured: false,
      message: "PostgreSQL is not configured or DATABASE_URL is missing. Operating in local JSON mode."
    };
  }

  try {
    const activePool = getPool();
    if (!activePool) {
      return {
        connected: false,
        provider: "postgres",
        configured: false,
        error: "Failed to initialize PostgreSQL pool."
      };
    }

    const res = await activePool.query("SELECT 1 AS ok, current_database() AS db_name, version() AS pg_version");
    const row = res.rows[0] || {};
    const isNeon = (row.pg_version || "").toLowerCase().includes("neon") ||
      (process.env.DATABASE_URL || "").includes("neon.tech");

    return {
      connected: true,
      provider: "postgres",
      configured: true,
      database: row.db_name || "postgres",
      isNeon: Boolean(isNeon),
      neonDetected: Boolean(isNeon),
      serverVersion: row.pg_version ? row.pg_version.split(" on ")[0] : "PostgreSQL",
      message: "Successfully connected to PostgreSQL database."
    };
  } catch (err) {
    // Redact any potential connection string or credentials from the error message
    const safeError = err.message
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
      .replace(/:[^:@]+@/, ":****@");

    return {
      connected: false,
      provider: "postgres",
      configured: true,
      error: safeError,
      message: "Failed to connect to PostgreSQL database."
    };
  }
}

/**
 * Closes the connection pool gracefully.
 */
async function closePool() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

module.exports = {
  isPostgresConfigured,
  isSyncEnabled,
  getPool,
  query,
  getClient,
  testConnection,
  closePool
};
