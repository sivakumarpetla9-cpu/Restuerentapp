const fs = require("fs");
const path = require("path");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const securityAuditRepository = require("./repositories/securityAuditRepository");

const DATA_DIR = path.join(__dirname, "../data");
const AUDIT_FILE = path.join(DATA_DIR, "security_audit.json");

const AUDIT_EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DISABLED",
  "USER_ENABLED",
  "ROLE_CHANGED",
  "PASSWORD_CHANGED",
  "ACCESS_DENIED",
  "ORDER_STATUS_CHANGED",
  "BILL_CREATED",
  "PAYMENT_RECORDED",
  "BILL_VOIDED",
  "BILL_REFUNDED",
  "BILLING_SETTING_CHANGED"
];

function ensureAuditStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE, "[]", "utf8");
  }
}

function loadAuditLogs() {
  ensureAuditStoreExists();
  try {
    const raw = fs.readFileSync(AUDIT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAuditLogs(logs) {
  ensureAuditStoreExists();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), "utf8");
}

/**
 * Logs a security event.
 * NEVER stores passwords, password hashes, secrets, or raw tokens.
 */
function logSecurityEvent(event = {}) {
  const typeCandidate = String(event.type || "LOGIN_FAILED").toUpperCase().trim();
  const type = AUDIT_EVENT_TYPES.includes(typeCandidate) ? typeCandidate : "ACCESS_DENIED";

  const logs = loadAuditLogs();

  // Strip any accidental sensitive fields from details
  const safeDetails = { ...(event.details || {}) };
  delete safeDetails.password;
  delete safeDetails.passwordHash;
  delete safeDetails.token;
  delete safeDetails.secret;
  delete safeDetails.sessionSecret;

  const entry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    type,
    userId: event.userId || null,
    email: event.email ? String(event.email).toLowerCase().trim() : null,
    ip: event.ip || "127.0.0.1",
    details: safeDetails,
    timestamp: new Date().toISOString()
  };

  logs.push(entry);
  saveAuditLogs(logs);

  if (isSyncEnabled()) {
    securityAuditRepository.logSecurityEvent(entry).catch(err => {
      console.warn("[SecurityAuditStore PG Sync Warning]", err.message);
    });
  }

  return entry;
}

function getSecurityAuditLogs(filter = {}) {
  const logs = loadAuditLogs();
  return logs.filter(entry => {
    if (filter.type && entry.type !== filter.type.toUpperCase().trim()) return false;
    if (filter.userId && entry.userId !== filter.userId) return false;
    if (filter.email && entry.email !== filter.email.toLowerCase().trim()) return false;
    return true;
  }).reverse();
}

function clearSecurityAudit() {
  ensureAuditStoreExists();
  saveAuditLogs([]);

  if (isSyncEnabled()) {
    securityAuditRepository.clearSecurityAudit().catch(() => {});
  }
}

module.exports = {
  logSecurityEvent,
  getSecurityAuditLogs,
  loadAuditLogs,
  clearSecurityAudit,
  repository: securityAuditRepository,
  AUDIT_EVENT_TYPES,
  AUDIT_FILE
};
