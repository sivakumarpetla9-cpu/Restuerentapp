const crypto = require("crypto");

const MIN_PASSWORD_LENGTH = 8;
const SCRYPT_KEYLEN = 64;

/**
 * Securely hashes a plaintext password using Node.js built-in scrypt with a unique random salt.
 * Format: salt:derivedKeyHex
 */
function hashPassword(password) {
  if (!password || typeof password !== "string") {
    throw new Error("Password must be a non-empty string.");
  }

  const trimmed = password.trim();
  if (trimmed.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(trimmed, salt, SCRYPT_KEYLEN);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Timing-safe verification of a password against a stored salt:hash string.
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const [salt, expectedKeyHex] = parts;
  if (!salt || !expectedKeyHex) {
    return false;
  }

  try {
    const expectedKey = Buffer.from(expectedKeyHex, "hex");
    const derivedKey = crypto.scryptSync(password.trim(), salt, expectedKey.length);

    if (expectedKey.length !== derivedKey.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedKey, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically strong random token for sessions and identifiers.
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  MIN_PASSWORD_LENGTH
};
