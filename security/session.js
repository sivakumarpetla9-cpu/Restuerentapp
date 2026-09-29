const { generateToken } = require("./crypto");

// In-memory session store (can easily be backed by Redis or DB in future)
const sessions = new Map();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOKIE_NAME = "ai_biz_session";

function createSession(user) {
  if (!user || !user.id) {
    throw new Error("Valid user object required to create a session.");
  }

  const token = generateToken(32);
  const now = Date.now();
  const session = {
    token,
    userId: user.id,
    email: user.email,
    role: user.role,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };

  sessions.set(token, session);
  return session;
}

function getSession(token) {
  if (!token || typeof token !== "string") return null;

  const session = sessions.get(token);
  if (!session) return null;

  const isExpired = new Date(session.expiresAt).getTime() <= Date.now();
  if (isExpired) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function destroySession(token) {
  if (!token) return false;
  return sessions.delete(token);
}

/**
 * Extracts session token from either Authorization header or HTTP Cookie.
 */
function extractToken(req) {
  if (!req || !req.headers) return null;

  // 1. Authorization: Bearer <token>
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.trim().split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      return parts[1].trim();
    }
  }

  // 2. Cookie: ai_biz_session=<token>
  const cookieHeader = req.headers["cookie"] || req.headers["Cookie"];
  if (cookieHeader && typeof cookieHeader === "string") {
    const cookies = cookieHeader.split(";");
    for (const cookie of cookies) {
      const [name, val] = cookie.trim().split("=");
      if (name === COOKIE_NAME && val) {
        return decodeURIComponent(val.trim());
      }
    }
  }

  return null;
}

/**
 * Formats a secure HTTP-only Set-Cookie header.
 */
function buildSessionCookie(token, isProduction = process.env.NODE_ENV === "production", crossSite = Boolean(process.env.CROSS_ORIGIN_COOKIES === "true" || process.env.FRONTEND_URL)) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const sameSite = (isProduction && crossSite) ? "None" : "Lax";
  const secureFlag = (isProduction || sameSite === "None") ? "; Secure; Partitioned" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Formats an expired Set-Cookie header to clear the browser cookie.
 */
function buildClearSessionCookie(isProduction = process.env.NODE_ENV === "production", crossSite = Boolean(process.env.CROSS_ORIGIN_COOKIES === "true" || process.env.FRONTEND_URL)) {
  const sameSite = (isProduction && crossSite) ? "None" : "Lax";
  const secureFlag = (isProduction || sameSite === "None") ? "; Secure; Partitioned" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secureFlag}`;
}

function clearSessions() {
  sessions.clear();
}

module.exports = {
  createSession,
  getSession,
  destroySession,
  extractToken,
  buildSessionCookie,
  buildClearSessionCookie,
  clearSessions,
  COOKIE_NAME,
  SESSION_TTL_MS
};
