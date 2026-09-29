const { extractToken, getSession, destroySession } = require("./session");
const { getUserById, sanitizeUser } = require("../memory/userStore");
const { hasPermission } = require("./permissions");
const { logSecurityEvent } = require("../memory/securityAuditStore");

/**
 * Resolves the tenant restaurantId for the authenticated user context.
 * Strict multi-tenant security rules:
 * 1. If user record has a fixed restaurantId, it is immutable and cannot be overridden.
 * 2. If user is ADMIN (and has no fixed restaurantId), allows scoping via x-restaurant-id header,
 *    falling back to the first client in CRM.
 * 3. Non-admin users cannot override or forge tenant context via headers or body.
 */
function resolveRestaurantContext(req, user) {
  if (!req.user) return;
  if (user && user.restaurantId) {
    req.user.restaurantId = user.restaurantId;
    return;
  }
  if (req.user.role === "ADMIN") {
    const headerTenant = req.headers && (req.headers["x-restaurant-id"] || req.headers["X-Restaurant-Id"]);
    if (headerTenant && typeof headerTenant === "string" && headerTenant.trim()) {
      req.user.restaurantId = headerTenant.trim();
      return;
    }
    if (!req.user.restaurantId) {
      try {
        const crmStore = require("../memory/crmStore");
        const clients = crmStore.getClients();
        if (clients && clients.length > 0) {
          req.user.restaurantId = clients[0].id;
        }
      } catch (e) {}
    }
  }
}

/**
 * Authenticates the incoming request via session token or cookie.
 * Attaches req.user and req.session if valid.
 */
function authenticate(req) {
  if (req.user) {
    resolveRestaurantContext(req, req.user);
    return req.user;
  }

  const token = extractToken(req);
  if (!token) {
    req.user = null;
    req.session = null;
    return null;
  }

  const session = getSession(token);
  if (!session) {
    req.user = null;
    req.session = null;
    return null;
  }

  const user = getUserById(session.userId);
  if (!user || user.status !== "ACTIVE") {
    destroySession(token);
    req.user = null;
    req.session = null;
    return null;
  }

  req.user = sanitizeUser(user);
  req.session = session;
  resolveRestaurantContext(req, user);
  return req.user;
}

/**
 * Middleware helper: Requires authentication (returns 401 if unauthenticated).
 */
function requireAuth(req, res, sendJson) {
  const user = authenticate(req);
  if (!user) {
    sendJson(res, 401, { error: "Authentication required. Please sign in." });
    return false;
  }
  return true;
}

/**
 * Middleware helper: Requires a specific permission based on the user's role (returns 403 if forbidden).
 */
function requirePermission(req, res, permission, sendJson) {
  const isAuthed = requireAuth(req, res, sendJson);
  if (!isAuthed) return false;

  const allowed = hasPermission(req.user.role, permission);
  if (!allowed) {
    logSecurityEvent({
      type: "ACCESS_DENIED",
      userId: req.user.id,
      email: req.user.email,
      details: { role: req.user.role, requiredPermission: permission, path: req.url }
    });

    sendJson(res, 403, {
      error: `Forbidden: Role "${req.user.role}" does not have permission "${permission}".`
    });
    return false;
  }

  return true;
}

/**
 * Middleware helper: Requires one of the specified roles (ADMIN is always allowed).
 */
function requireRole(req, res, allowedRoles = [], sendJson) {
  const isAuthed = requireAuth(req, res, sendJson);
  if (!isAuthed) return false;

  const userRole = req.user.role.toUpperCase();
  if (userRole === "ADMIN") return true;

  const roles = allowedRoles.map(r => r.toUpperCase());
  if (!roles.includes(userRole)) {
    logSecurityEvent({
      type: "ACCESS_DENIED",
      userId: req.user.id,
      email: req.user.email,
      details: { role: req.user.role, allowedRoles, path: req.url }
    });

    sendJson(res, 403, {
      error: `Forbidden: Requires one of [${allowedRoles.join(", ")}], but user has "${req.user.role}".`
    });
    return false;
  }

  return true;
}

module.exports = {
  authenticate,
  requireAuth,
  requirePermission,
  requireRole
};
