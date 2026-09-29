/**
 * Level 3 Communication Gateway - Lifecycle State Transitions & Rules
 */

const { isValidStatus } = require("./types");

const VALID_TRANSITIONS = {
  "DRAFT": ["READY_FOR_REVIEW", "CANCELLED"],
  "READY_FOR_REVIEW": ["APPROVED", "DRAFT", "CANCELLED"],
  "APPROVED": ["SEND_REQUESTED", "COPIED", "CANCELLED"],
  "COPIED": ["SEND_REQUESTED", "CANCELLED"],
  "SEND_REQUESTED": ["SENT", "FAILED", "CANCELLED"],
  "SENT": ["DELIVERED", "READ", "REPLIED", "FAILED"],
  "DELIVERED": ["READ", "REPLIED", "FAILED"],
  "READ": ["REPLIED"],
  "FAILED": ["SEND_REQUESTED", "CANCELLED"], // Retry or cancel
  "REPLIED": [], // Terminal for this message
  "CANCELLED": [] // Terminal
};

/**
 * Checks whether transitioning from currentStatus to nextStatus is valid.
 */
function isValidTransition(currentStatus, nextStatus) {
  if (!currentStatus || !nextStatus) return false;
  const current = String(currentStatus).toUpperCase().trim();
  const next = String(nextStatus).toUpperCase().trim();

  if (!isValidStatus(current) || !isValidStatus(next)) {
    return false;
  }

  // Idempotent re-application of same status is permitted
  if (current === next) {
    return true;
  }

  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !Array.isArray(allowed)) {
    return false;
  }

  return allowed.includes(next);
}

/**
 * Validates transition or throws an explicit domain error.
 */
function validateTransition(currentStatus, nextStatus) {
  const current = String(currentStatus || "").toUpperCase().trim();
  const next = String(nextStatus || "").toUpperCase().trim();

  if (!isValidTransition(current, next)) {
    // Specific safety message if attempting to send without approval
    if ((current === "DRAFT" || current === "READY_FOR_REVIEW") && (next === "SEND_REQUESTED" || next === "SENT")) {
      throw new Error(`Safety Violation: Message is in "${current}" status and cannot be sent without user approval (APPROVED status required).`);
    }

    throw new Error(`Invalid message lifecycle transition from "${current}" to "${next}". Allowed transitions: [${(VALID_TRANSITIONS[current] || []).join(", ")}].`);
  }
}

module.exports = {
  VALID_TRANSITIONS,
  isValidTransition,
  validateTransition
};
