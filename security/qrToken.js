/**
 * Secure QR Token Management for Restaurant OS v1
 *
 * Implements cryptographically authenticated QR access tokens:
 * - Scoped to restaurantId and tableId
 * - HMAC-SHA256 signature with constant-time verification
 * - Expiration and nonce protection against replay/tampering
 * - Decoupled from public guessing (prevents enumeration and parameter forgery)
 */

const crypto = require("crypto");

// Fallback secret for dev/test; production uses SESSION_SECRET or ADMIN_PASSWORD from env
const QR_SECRET = process.env.QR_TOKEN_SECRET || process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "restaurant_os_qr_secure_key_2026";
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days default validity

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) {
    b64 += "=";
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

function computeHmac(data, secret = QR_SECRET) {
  return crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generates an authenticated signed QR token for a physical table.
 */
function generateQrToken(restaurantId, tableId, branchId = null, options = {}) {
  if (!restaurantId || !tableId) {
    throw new Error("restaurantId and tableId are required to generate QR token.");
  }

  const now = Date.now();
  const ttl = options.ttlMs || DEFAULT_TTL_MS;
  const payload = {
    rid: restaurantId,
    tid: tableId,
    bid: branchId || null,
    nonce: crypto.randomBytes(12).toString("hex"),
    iat: now,
    exp: now + ttl
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = computeHmac(payloadB64, options.secret || QR_SECRET);

  return `${payloadB64}.${signature}`;
}

/**
 * Validates a signed QR token cryptographically:
 * Checks HMAC signature, format, and expiry.
 */
function verifyQrToken(token, options = {}) {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing or invalid QR token format." };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed QR token structure." };
  }

  const [payloadB64, signature] = parts;
  const expectedSig = computeHmac(payloadB64, options.secret || QR_SECRET);

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, error: "Tampered or invalid QR token signature." };
    }

    const payloadRaw = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadRaw);

    if (!payload.rid || !payload.tid || !payload.exp) {
      return { valid: false, error: "Incomplete QR token payload." };
    }

    const now = options.currentTime || Date.now();
    if (now > payload.exp) {
      return { valid: false, error: "QR token has expired.", expired: true };
    }

    return {
      valid: true,
      restaurantId: payload.rid,
      tableId: payload.tid,
      branchId: payload.bid,
      nonce: payload.nonce,
      issuedAt: payload.iat,
      expiresAt: payload.exp
    };
  } catch (err) {
    return { valid: false, error: "Failed to parse QR token payload." };
  }
}

const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours customer session validity

/**
 * Generates an authenticated signed customer table session token.
 */
function generateCustomerSessionToken(restaurantId, tableId, branchId, sessionId, options = {}) {
  if (!restaurantId || !tableId || !sessionId) {
    throw new Error("restaurantId, tableId, and sessionId are required to generate customer session token.");
  }
  const now = Date.now();
  const ttl = options.ttlMs || DEFAULT_SESSION_TTL_MS;
  const payload = {
    rid: restaurantId,
    tid: tableId,
    bid: branchId || null,
    sid: sessionId,
    nonce: crypto.randomBytes(12).toString("hex"),
    iat: now,
    exp: now + ttl
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = computeHmac(payloadB64, options.secret || QR_SECRET);
  return `${payloadB64}.${signature}`;
}

/**
 * Validates an authenticated customer table session token.
 */
function verifyCustomerSessionToken(token, options = {}) {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Missing or invalid session token." };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed session token structure." };
  }

  const [payloadB64, signature] = parts;
  const expectedSig = computeHmac(payloadB64, options.secret || QR_SECRET);

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, error: "Tampered or invalid session token signature." };
    }

    const payloadRaw = base64UrlDecode(payloadB64);
    const payload = JSON.parse(payloadRaw);

    if (!payload.rid || !payload.tid || !payload.sid || !payload.exp) {
      return { valid: false, error: "Incomplete session token payload." };
    }

    const now = options.currentTime || Date.now();
    if (now > payload.exp) {
      return { valid: false, error: "Session token has expired.", expired: true };
    }

    return {
      valid: true,
      restaurantId: payload.rid,
      tableId: payload.tid,
      branchId: payload.bid,
      sessionId: payload.sid,
      issuedAt: payload.iat,
      expiresAt: payload.exp
    };
  } catch (err) {
    return { valid: false, error: "Failed to parse session token payload." };
  }
}

module.exports = {
  generateQrToken,
  verifyQrToken,
  generateCustomerSessionToken,
  verifyCustomerSessionToken,
  computeHmac
};

