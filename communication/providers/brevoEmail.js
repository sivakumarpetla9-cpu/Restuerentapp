/**
 * Brevo (formerly Sendinblue) Transactional Email Provider Adapter
 *
 * Implements the standard Communication Provider interface for real email dispatch.
 * Conforms to Brevo API v3 (POST https://api.brevo.com/v3/smtp/email).
 *
 * Cost: ₹0 / $0 on Brevo Free Plan (up to 300 emails/day, zero credit card requirement).
 */

const crypto = require("crypto");

class BrevoEmailProvider {
  constructor(options = {}) {
    this.name = "brevo";
    this.apiUrl = options.apiUrl || process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email";
    this.mockFetch = options.mockFetch || null; // For automated testing without real network calls

    // Explicit capabilities verified against Brevo API v3
    this.capabilities = {
      send: true,
      deliveryStatus: true,
      readStatus: true,       // Supported via Brevo 'opened' webhook events
      inboundMessages: false, // Inbound requires dedicated MX domain routing configuration
      attachments: false      // Text/HTML drafts supported in current version
    };
  }

  /**
   * Checks whether a capability is supported.
   */
  hasCapability(capability) {
    return Boolean(this.capabilities[capability]);
  }

  /**
   * Retrieves active configuration from environment.
   */
  getConfig() {
    return {
      apiKey: process.env.BREVO_API_KEY || "",
      senderEmail: process.env.BREVO_SENDER_EMAIL || "",
      senderName: process.env.BREVO_SENDER_NAME || "",
      webhookSecret: process.env.BREVO_WEBHOOK_SECRET || "",
      apiUrl: this.apiUrl
    };
  }

  /**
   * Validates configuration without leaking sensitive keys.
   */
  validateConfiguration(config = this.getConfig()) {
    const errors = [];

    if (!config.apiKey || typeof config.apiKey !== "string" || config.apiKey.trim().length < 8) {
      errors.push("BREVO_API_KEY is missing or invalid. An API key from Brevo dashboard is required.");
    }

    if (!config.senderEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.senderEmail.trim())) {
      errors.push("BREVO_SENDER_EMAIL is missing or invalid. A verified sender email address in Brevo is required.");
    }

    if (!config.senderName || typeof config.senderName !== "string" || config.senderName.trim().length === 0) {
      errors.push("BREVO_SENDER_NAME is missing. A sender display name is required.");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Dispatches an approved email through Brevo API v3.
   */
  async send(message, options = {}) {
    if (!message || !message.id) {
      throw new Error("Message object with a valid ID is required for sending.");
    }

    // 1. Mandatory Approval Guard: AI drafts must NEVER be sent automatically
    if (message.status !== "APPROVED") {
      throw new Error(
        `Approval Required: Cannot send message in status "${message.status}". User approval is strictly required before sending via Brevo.`
      );
    }

    // 2. Channel Guard: Brevo adapter handles EMAIL only
    const channel = String(message.channel || "").toUpperCase().trim();
    if (channel !== "EMAIL") {
      throw new Error(`BrevoEmailProvider only supports EMAIL channel (requested: ${channel || "UNKNOWN"}).`);
    }

    // 3. Recipient Check
    const recipientEmail = message.recipientAddress || message.recipient;
    if (!recipientEmail || recipientEmail === "[NOT PROVIDED]" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error(`Cannot send message: Recipient email address is missing or invalid ("${recipientEmail}").`);
    }

    // 4. Opt-Out Guard
    if (message.communicationOptOut || (message.metadata && message.metadata.communicationOptOut)) {
      throw new Error("Cannot send message: Recipient has explicitly opted out of communications.");
    }

    // 5. Configuration Validation
    const config = this.getConfig();
    const configValidation = this.validateConfiguration(config);
    if (!configValidation.valid) {
      return {
        success: false,
        provider: this.name,
        errorCode: "CONFIG_ERROR",
        errorMessage: `Brevo provider is selected but required credentials are not configured. ${configValidation.errors.join(" ")}`,
        failedAt: new Date().toISOString()
      };
    }

    // 6. Build Request Payload
    const recipientName = message.recipientName && message.recipientName !== "[NAME NOT PROVIDED]"
      ? message.recipientName
      : recipientEmail.split("@")[0];

    const subject = message.subject || `Message from ${config.senderName}`;
    const textContent = message.body || "";
    // Wrap formatted text into clean HTML
    const htmlContent = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#333;margin:0;padding:16px;"><div style="white-space:pre-wrap;">${this._escapeHtml(textContent)}</div></body></html>`;

    const payload = {
      sender: {
        name: config.senderName.trim(),
        email: config.senderEmail.trim()
      },
      to: [
        {
          email: recipientEmail.trim(),
          name: recipientName.trim()
        }
      ],
      subject: subject.trim(),
      htmlContent,
      textContent,
      tags: ["ai-business-agent", (message.purpose || "outreach").toLowerCase()],
      headers: {
        "X-Agent-Message-ID": String(message.id)
      }
    };

    // 7. Execute HTTP Request via built-in fetch or mock client
    const fetchFn = options.mockFetch || this.mockFetch || globalThis.fetch;
    if (typeof fetchFn !== "function") {
      throw new Error("No fetch implementation available. Node.js 18+ or a mock fetch is required.");
    }

    const now = new Date().toISOString();
    let response;

    try {
      // 10 second timeout for network call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        response = await fetchFn(config.apiUrl, {
          method: "POST",
          headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": config.apiKey
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (netErr) {
      const isTimeout = netErr.name === "AbortError";
      return {
        success: false,
        provider: this.name,
        errorCode: isTimeout ? "TIMEOUT_ERROR" : "NETWORK_ERROR",
        errorMessage: isTimeout
          ? "Request to Brevo API timed out after 10000ms."
          : `Network failure connecting to Brevo API: ${netErr.message || "Connection failed"}.`,
        failedAt: now
      };
    }

    // 8. Process Brevo API Response
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (response.ok && data && (data.messageId || data.id)) {
      // Real provider accepted the message
      const providerMessageId = String(data.messageId || data.id);
      return {
        success: true,
        provider: this.name,
        providerMessageId,
        status: "SENT",
        sentAt: now,
        recipient: recipientEmail
      };
    } else {
      // Map HTTP error codes to safe internal error descriptions
      const status = response.status;
      let errorCode = "SEND_FAILED";
      let errorMsg = (data && data.message) ? String(data.message) : `Brevo API returned HTTP ${status}.`;

      if (status === 400) {
        errorCode = "INVALID_REQUEST";
        errorMsg = `Brevo rejected request parameters: ${data && data.message ? data.message : "Bad Request"}`;
      } else if (status === 401) {
        errorCode = "AUTH_FAILED";
        errorMsg = "Brevo authentication failed: Invalid or expired BREVO_API_KEY.";
      } else if (status === 403) {
        errorCode = "FORBIDDEN";
        errorMsg = "Brevo authorization forbidden: Check sender verification and account permissions.";
      } else if (status === 429) {
        errorCode = "RATE_LIMITED";
        errorMsg = "Brevo rate limit exceeded (Free plan daily limit: 300 emails).";
      } else if (status >= 500) {
        errorCode = "PROVIDER_SERVER_ERROR";
        errorMsg = "Brevo service is temporarily unavailable (HTTP 5xx).";
      }

      // Safe sanitization: remove any occurrence of the API key from error strings
      const safeErrorMsg = config.apiKey ? errorMsg.split(config.apiKey).join("[REDACTED]") : errorMsg;

      return {
        success: false,
        provider: this.name,
        errorCode,
        errorMessage: safeErrorMsg,
        failedAt: now
      };
    }
  }

  /**
   * Normalizes a Brevo webhook payload into a standardized event.
   *
   * Brevo Transactional Event mapping:
   * - "request" / "sent" -> "SENT"
   * - "delivered" -> "DELIVERED"
   * - "opened" / "unique_opened" / "clicks" -> "READ"
   * - "hard_bounce" / "soft_bounce" / "blocked" / "invalid_email" / "error" / "spam" -> "FAILED"
   * - "reply" / "inbound" -> "REPLIED"
   */
  normalizeWebhookPayload(payload = {}, headers = {}) {
    const rawEvent = String(payload.event || payload.type || "").toLowerCase().trim();
    let type = "DELIVERED";

    if (rawEvent === "request" || rawEvent === "sent") {
      type = "SENT";
    } else if (rawEvent === "delivered") {
      type = "DELIVERED";
    } else if (rawEvent === "opened" || rawEvent === "unique_opened" || rawEvent === "clicks") {
      type = "READ";
    } else if (
      rawEvent === "hard_bounce" ||
      rawEvent === "soft_bounce" ||
      rawEvent === "blocked" ||
      rawEvent === "invalid_email" ||
      rawEvent === "error" ||
      rawEvent === "spam" ||
      rawEvent === "unsubscribed"
    ) {
      type = "FAILED";
    } else if (rawEvent === "reply" || rawEvent === "inbound") {
      type = "REPLIED";
    }

    const providerMessageId = payload["message-id"] || payload.messageId || payload.message_id || null;
    const eventId = payload.id ? String(payload.id) : (payload.eventId || headers["x-webhook-id"] || null);
    const timestamp = payload.date || payload.ts_event
      ? (payload.date ? new Date(payload.date).toISOString() : new Date(payload.ts_event * 1000).toISOString())
      : new Date().toISOString();

    return {
      eventId,
      providerMessageId,
      messageId: payload.messageId || (payload.tags && payload.tags[0]) || null,
      type,
      text: payload.text || payload.replyText || payload.body || null,
      sender: payload.email || payload.sender || payload.from || null,
      timestamp,
      details: {
        brevoEvent: rawEvent,
        email: payload.email || payload.to || null,
        reason: payload.reason || payload.description || null,
        subject: payload.subject || null,
        tag: payload.tag || null
      }
    };
  }

  /**
   * Verifies an inbound webhook using configured secret.
   * If BREVO_WEBHOOK_SECRET is set, fails closed on mismatch.
   */
  verifyWebhook(headers = {}, payload = {}, query = {}) {
    const secret = process.env.BREVO_WEBHOOK_SECRET;
    if (!secret) {
      // In development/local without secret configured: pass with audit note
      return { verified: true, mode: "unauthenticated_dev" };
    }

    const supplied =
      headers["x-brevo-webhook-secret"] ||
      headers["x-webhook-secret"] ||
      query.secret ||
      query.token ||
      (payload && payload.secret);

    if (!supplied) {
      return { verified: false, error: "Missing required webhook authentication secret." };
    }

    // Constant-time comparison to prevent timing attacks
    const bufA = Buffer.from(String(supplied));
    const bufB = Buffer.from(String(secret));

    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      return { verified: false, error: "Invalid webhook secret." };
    }

    return { verified: true, mode: "secret_verified" };
  }

  /**
   * HTML escape helper to prevent injection.
   */
  _escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

module.exports = {
  BrevoEmailProvider
};
