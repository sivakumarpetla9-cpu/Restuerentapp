const fs = require("fs");
const path = require("path");
const { hashPassword, verifyPassword } = require("../security/crypto");
const { logSecurityEvent } = require("./securityAuditStore");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const userRepository = require("./repositories/userRepository");

const DATA_DIR = path.join(__dirname, "../data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const ROLES = ["ADMIN", "SALES", "DELIVERY", "VIEWER"];
const USER_STATUSES = ["ACTIVE", "DISABLED"];

function ensureUserStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]", "utf8");
  }
}

function loadUsers() {
  ensureUserStoreExists();
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  ensureUserStoreExists();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

/**
 * Sanitizes a user object for public/API consumption, strictly stripping passwordHash.
 */
function sanitizeUser(user) {
  if (!user || typeof user !== "object") return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

/**
 * Validates email format.
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@([^\s@]+\.[^\s@]+|localhost)$/i.test(email.trim());
}

/**
 * Creates a new user record with a hashed password.
 */
function createUser(userData = {}) {
  const users = loadUsers();

  const name = String(userData.name || "").trim();
  if (!name) {
    throw new Error("User name is required.");
  }

  const rawEmail = String(userData.email || "").trim().toLowerCase();
  if (!isValidEmail(rawEmail)) {
    throw new Error("A valid email address is required.");
  }

  // Duplicate email check
  const duplicate = users.find(u => u.email.toLowerCase() === rawEmail);
  if (duplicate) {
    throw new Error(`A user with email "${rawEmail}" already exists.`);
  }

  const password = userData.password;
  const passwordHash = userData.passwordHash || hashPassword(password);

  const roleCandidate = String(userData.role || "VIEWER").toUpperCase().trim();
  const role = ROLES.includes(roleCandidate) ? roleCandidate : "VIEWER";

  const statusCandidate = String(userData.status || "ACTIVE").toUpperCase().trim();
  const status = USER_STATUSES.includes(statusCandidate) ? statusCandidate : "ACTIVE";

  const now = new Date().toISOString();
  const user = {
    id: userData.id || `usr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name,
    email: rawEmail,
    passwordHash,
    role,
    status,
    restaurantId: userData.restaurantId || null,
    createdAt: userData.createdAt || now,
    updatedAt: userData.updatedAt || now,
    lastLoginAt: userData.lastLoginAt || null
  };

  users.push(user);
  saveUsers(users);

  if (isSyncEnabled()) {
    userRepository.createUser(user).catch(err => {
      console.warn("[UserStore PG Sync Warning]", err.message);
    });
  }

  logSecurityEvent({
    type: "USER_CREATED",
    userId: user.id,
    email: user.email,
    details: { role: user.role, status: user.status }
  });

  return sanitizeUser(user);
}

function getUserById(id) {
  if (!id) return null;
  const users = loadUsers();
  return users.find(u => u.id === id) || null;
}

function getUserByEmail(email) {
  if (!email) return null;
  const normalized = String(email).trim().toLowerCase();
  const users = loadUsers();
  return users.find(u => u.email.toLowerCase() === normalized) || null;
}

function getUsers() {
  const users = loadUsers();
  return users.map(sanitizeUser);
}

/**
 * Updates a user record. Protects the final active admin from being disabled or de-escalated.
 */
function updateUser(id, updates = {}) {
  const users = loadUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) {
    throw new Error(`User not found for ID "${id}".`);
  }

  const current = users[index];

  // Protect the last active admin
  if (current.role === "ADMIN" && current.status === "ACTIVE") {
    const isDeactivating = updates.status && updates.status.toUpperCase().trim() === "DISABLED";
    const isChangingRole = updates.role && updates.role.toUpperCase().trim() !== "ADMIN";

    if (isDeactivating || isChangingRole) {
      const activeAdmins = users.filter(u => u.id !== current.id && u.role === "ADMIN" && u.status === "ACTIVE");
      if (activeAdmins.length === 0) {
        throw new Error("Cannot disable or remove the ADMIN role of the only active administrator in the system.");
      }
    }
  }

  // Handle email update uniqueness
  if (updates.email) {
    const newEmail = String(updates.email).trim().toLowerCase();
    if (!isValidEmail(newEmail)) {
      throw new Error("A valid email address is required.");
    }
    const duplicate = users.find(u => u.id !== id && u.email.toLowerCase() === newEmail);
    if (duplicate) {
      throw new Error(`Email "${newEmail}" is already in use by another user.`);
    }
    current.email = newEmail;
  }

  if (updates.name) {
    current.name = String(updates.name).trim();
  }

  if (updates.role) {
    const roleCandidate = String(updates.role).toUpperCase().trim();
    if (ROLES.includes(roleCandidate)) {
      if (current.role !== roleCandidate) {
        logSecurityEvent({
          type: "ROLE_CHANGED",
          userId: current.id,
          email: current.email,
          details: { oldRole: current.role, newRole: roleCandidate }
        });
      }
      current.role = roleCandidate;
    }
  }

  if (updates.status) {
    const statusCandidate = String(updates.status).toUpperCase().trim();
    if (USER_STATUSES.includes(statusCandidate)) {
      if (current.status !== statusCandidate) {
        logSecurityEvent({
          type: statusCandidate === "DISABLED" ? "USER_DISABLED" : "USER_ENABLED",
          userId: current.id,
          email: current.email
        });
      }
      current.status = statusCandidate;
    }
  }

  if (updates.password) {
    current.passwordHash = hashPassword(updates.password);
    logSecurityEvent({
      type: "PASSWORD_CHANGED",
      userId: current.id,
      email: current.email
    });
  }

  if (updates.restaurantId !== undefined) {
    current.restaurantId = updates.restaurantId;
  }

  current.updatedAt = new Date().toISOString();
  users[index] = current;
  saveUsers(users);

  if (isSyncEnabled()) {
    userRepository.updateUser(id, current).catch(err => {
      console.warn("[UserStore PG Sync Warning]", err.message);
    });
  }

  return sanitizeUser(current);
}

function disableUser(id) {
  return updateUser(id, { status: "DISABLED" });
}

function enableUser(id) {
  return updateUser(id, { status: "ACTIVE" });
}

/**
 * Authenticates user credentials.
 * Timing-safe, returns sanitized user on success, null on failure.
 */
function verifyUserCredentials(email, password, ip = "127.0.0.1") {
  if (!email || !password) {
    logSecurityEvent({
      type: "LOGIN_FAILED",
      email: email ? String(email).toLowerCase() : null,
      ip,
      details: { reason: "Missing credentials" }
    });
    return null;
  }

  const user = getUserByEmail(email);
  if (!user || user.status !== "ACTIVE") {
    logSecurityEvent({
      type: "LOGIN_FAILED",
      email: String(email).toLowerCase(),
      ip,
      details: { reason: !user ? "User not found" : "User disabled" }
    });
    return null;
  }

  const isMatch = verifyPassword(password, user.passwordHash);
  if (!isMatch) {
    logSecurityEvent({
      type: "LOGIN_FAILED",
      userId: user.id,
      email: user.email,
      ip,
      details: { reason: "Invalid credentials" }
    });
    return null;
  }

  // Update lastLoginAt
  const users = loadUsers();
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    users[idx].lastLoginAt = new Date().toISOString();
    saveUsers(users);
  }

  logSecurityEvent({
    type: "LOGIN_SUCCESS",
    userId: user.id,
    email: user.email,
    ip,
    details: { role: user.role }
  });

  return sanitizeUser(user);
}

/**
 * Safe local development bootstrap mechanism.
 * Creates an initial admin user ONLY if no users exist in the database.
 * Credentials MUST be provided via ADMIN_EMAIL and ADMIN_PASSWORD.
 */
function bootstrapAdmin() {
  const users = loadUsers();
  if (users.length > 0) {
    return { created: false, message: "Users already exist. Bootstrap skipped." };
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return {
      created: false,
      message: "No admin account configured. Set ADMIN_EMAIL and ADMIN_PASSWORD."
    };
  }

  const admin = createUser({
    name: "System Administrator",
    email: adminEmail,
    password: adminPassword,
    role: "ADMIN",
    status: "ACTIVE"
  });

  return {
    created: true,
    user: admin,
    message: "Initial admin account bootstrapped successfully."
  };
}

function clearUsers() {
  ensureUserStoreExists();
  saveUsers([]);
}

module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
  getUsers,
  updateUser,
  disableUser,
  enableUser,
  verifyUserCredentials,
  bootstrapAdmin,
  sanitizeUser,
  clearUsers,
  repository: userRepository,
  ROLES,
  USER_STATUSES,
  USERS_FILE
};
