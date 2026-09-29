/**
 * Local Communication Simulator Provider (₹0, Local-First, Zero Paid APIs)
 *
 * Implements the standard Communication Provider interface for local testing.
 * Fully deterministic simulation of:
 * - SEND
 * - DELIVERED
 * - READ
 * - REPLIED
 * - FAILED
 */

class LocalSimulatorProvider {
  constructor() {
    this.name = "local";
    this.capabilities = [
      "send",
      "deliveryStatus",
      "readStatus",
      "inboundMessages"
    ];
  }

  hasCapability(capability) {
    return this.capabilities.includes(capability);
  }

  /**
   * Simulates sending a message.
   * If options.simulateFailure or message.metadata.simulateFailure is set, fails deterministically.
   */
  async send(message, options = {}) {
    if (!message || !message.id) {
      throw new Error("Message object with a valid ID is required for sending.");
    }

    const shouldFail = Boolean(
      options.simulateFailure ||
      (message.metadata && message.metadata.simulateFailure)
    );

    const now = new Date().toISOString();
    const providerMessageId = `sim-${(message.channel || "email").toLowerCase()}-${message.id}`;

    if (shouldFail) {
      const errorMsg = options.errorMessage || "Simulated carrier routing failure.";
      return {
        success: false,
        provider: this.name,
        providerMessageId,
        status: "FAILED",
        errorCode: "SIMULATED_SEND_FAILURE",
        errorMessage: errorMsg,
        failedAt: now
      };
    }

    return {
      success: true,
      provider: this.name,
      providerMessageId,
      status: "SENT",
      sentAt: now,
      recipient: message.recipient || message.recipientAddress
    };
  }

  /**
   * Simulates a delivery event for a providerMessageId.
   */
  simulateDelivery(providerMessageId, options = {}) {
    return {
      eventId: options.eventId || `evt-del-${providerMessageId}`,
      provider: this.name,
      providerMessageId,
      type: "DELIVERED",
      status: "DELIVERED",
      timestamp: options.timestamp || new Date().toISOString(),
      details: {
        channel: options.channel || "EMAIL",
        recipient: options.recipient || null,
        note: "Simulated carrier delivery confirmed"
      }
    };
  }

  /**
   * Simulates a read receipt event for a providerMessageId.
   */
  simulateRead(providerMessageId, options = {}) {
    return {
      eventId: options.eventId || `evt-read-${providerMessageId}`,
      provider: this.name,
      providerMessageId,
      type: "READ",
      status: "READ",
      timestamp: options.timestamp || new Date().toISOString(),
      details: {
        note: "Simulated recipient read receipt"
      }
    };
  }

  /**
   * Simulates an inbound customer reply for a providerMessageId.
   * Grounding Rule: Uses the exact text provided as the evidence.
   */
  simulateReply(providerMessageId, text, options = {}) {
    if (!text || !String(text).trim()) {
      throw new Error("Reply text is required to simulate customer reply.");
    }

    return {
      eventId: options.eventId || `evt-reply-${providerMessageId}-${Date.now()}`,
      provider: this.name,
      providerMessageId,
      type: "REPLIED",
      status: "REPLIED",
      text: String(text).trim(),
      sender: options.sender || null,
      timestamp: options.timestamp || new Date().toISOString(),
      details: {
        replyText: String(text).trim(),
        note: "Simulated customer inbound message"
      }
    };
  }

  /**
   * Simulates a failure event.
   */
  simulateFailure(providerMessageId, errorReason = "Simulated delivery failure", options = {}) {
    return {
      eventId: options.eventId || `evt-fail-${providerMessageId}`,
      provider: this.name,
      providerMessageId,
      type: "FAILED",
      status: "FAILED",
      errorCode: options.errorCode || "SIMULATED_FAILURE",
      errorMessage: errorReason,
      timestamp: options.timestamp || new Date().toISOString(),
      details: {
        reason: errorReason
      }
    };
  }
}

module.exports = {
  LocalSimulatorProvider
};
