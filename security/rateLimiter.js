// Lightweight local in-memory rate limiter for login attempts

const failedAttempts = new Map();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute window

function getClientIp(req) {
  if (!req) return "127.0.0.1";
  const forwarded = req.headers && (req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"]);
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || "127.0.0.1";
}

function checkRateLimit(ip) {
  const clientKey = String(ip || "127.0.0.1");
  const record = failedAttempts.get(clientKey);

  if (!record) {
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  if (now > record.resetAt) {
    failedAttempts.delete(clientKey);
    return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterSeconds: 0 };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      error: `Too many failed login attempts. Please try again in ${retryAfterSeconds} second(s).`
    };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - record.count,
    retryAfterSeconds: 0
  };
}

function recordFailedAttempt(ip) {
  const clientKey = String(ip || "127.0.0.1");
  const now = Date.now();
  const record = failedAttempts.get(clientKey);

  if (!record || now > record.resetAt) {
    failedAttempts.set(clientKey, {
      count: 1,
      resetAt: now + WINDOW_MS
    });
    return { remaining: MAX_ATTEMPTS - 1 };
  }

  record.count += 1;
  return { remaining: Math.max(0, MAX_ATTEMPTS - record.count) };
}

function resetRateLimit(ip) {
  const clientKey = String(ip || "127.0.0.1");
  failedAttempts.delete(clientKey);
}

function clearRateLimits() {
  failedAttempts.clear();
}

module.exports = {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  clearRateLimits,
  getClientIp,
  MAX_ATTEMPTS,
  WINDOW_MS
};
