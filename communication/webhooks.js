/**
 * Level 3 Communication Gateway - Webhook Inbound Handler
 *
 * Provider-independent webhook verification, normalization, and idempotency dispatch.
 */

const { handleEvent } = require("./gateway");
const { getProvider } = require("./providers");

/**
 * Normalizes an incoming webhook payload into a standardized event.
 */
function normalizeWebhookEvent(providerName, payload = {}, headers = {}) {
  const providerKey = String(providerName || "local").toLowerCase().trim();

  try {
    const provider = getProvider(providerKey);
    if (typeof provider.normalizeWebhookPayload === "function") {
      const normalized = provider.normalizeWebhookPayload(payload, headers);
      normalized.provider = providerKey;
      return normalized;
    }
  } catch {
    // Fall back to default mapping below
  }

  // For Local Simulator
  if (providerKey === "local" || providerKey === "simulator") {
    return {
      eventId: payload.eventId || headers["x-webhook-id"] || null,
      providerMessageId: payload.providerMessageId || payload.messageId || null,
      messageId: payload.messageId || null,
      provider: "local",
      type: (payload.type || payload.event || "DELIVERED").toUpperCase().trim(),
      text: payload.text || payload.body || null,
      sender: payload.sender || null,
      timestamp: payload.timestamp || new Date().toISOString(),
      details: payload.details || payload
    };
  }

  // Generic fallback for external providers
  return {
    eventId: payload.id || headers["x-event-id"] || null,
    providerMessageId: payload.providerMessageId || payload["message-id"] || payload.message_id || payload.sid || null,
    messageId: payload.messageId || null,
    provider: providerKey,
    type: (payload.type || payload.event || payload.status || "DELIVERED").toUpperCase().trim(),
    text: payload.text || payload.body || null,
    sender: payload.sender || payload.from || payload.email || null,
    timestamp: payload.timestamp || payload.date || new Date().toISOString(),
    details: payload
  };
}

/**
 * Processes an inbound webhook request with security verification and normalization.
 */
async function processWebhook(providerName, payload = {}, headers = {}, query = {}) {
  // 1. Verify provider is supported
  let provider;
  try {
    provider = getProvider(providerName);
  } catch (err) {
    return {
      statusCode: 400,
      body: { error: `Unsupported communication provider "${providerName}".` }
    };
  }

  // 2. Provider Webhook Security Verification (Fail-Closed if signature mismatch)
  if (typeof provider.verifyWebhook === "function") {
    const verifyResult = provider.verifyWebhook(headers, payload, query);
    if (!verifyResult.verified) {
      return {
        statusCode: 401,
        body: { error: verifyResult.error || "Unauthorized: Webhook security verification failed." }
      };
    }
  }

  // 3. Normalize event payload
  const normalized = typeof provider.normalizeWebhookPayload === "function"
    ? provider.normalizeWebhookPayload(payload, headers)
    : normalizeWebhookEvent(providerName, payload, headers);

  normalized.provider = String(providerName || "local").toLowerCase().trim();

  if (!normalized.providerMessageId && !normalized.messageId) {
    return {
      statusCode: 400,
      body: { error: "Webhook event missing message identifier (providerMessageId or messageId required)." }
    };
  }

  if (!normalized.type) {
    return {
      statusCode: 400,
      body: { error: "Webhook event missing event type." }
    };
  }

  // 4. Delegate to Communication Gateway with Idempotency Protection
  try {
    const result = await handleEvent(normalized);
    return {
      statusCode: 200,
      body: {
        success: true,
        duplicate: Boolean(result.duplicate),
        event: result.event || null
      }
    };
  } catch (err) {
    return {
      statusCode: 422,
      body: { error: err.message || "Failed to process webhook event." }
    };
  }
}

module.exports = {
  processWebhook,
  normalizeWebhookEvent
};
