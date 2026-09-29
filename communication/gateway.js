/**
 * Level 3 Communication Gateway
 *
 * Provider-independent central service managing message dispatch,
 * lifecycle state progression, provider routing, idempotency,
 * CRM activity creation, and sales pipeline advancement.
 */

const communicationStore = require("../memory/communicationStore");
const communicationEventsStore = require("../memory/communicationEventsStore");
const leadStore = require("../memory/leadStore");
const crmStore = require("../memory/crmStore");
const { getProvider } = require("./providers");
const { validateTransition } = require("./lifecycle");

/**
 * Checks if a recipient has opted out of communications.
 */
function isOptedOut(message) {
  if (message.leadId) {
    const lead = leadStore.getLead(message.leadId);
    if (lead && lead.communicationOptOut) return true;
  }
  if (message.clientId) {
    const client = crmStore.getClient(message.clientId);
    if (client && client.communicationOptOut) return true;
  }
  return false;
}

/**
 * Sends an approved communication message through the resolved provider.
 */
async function sendMessage(messageId, options = {}) {
  if (!messageId) {
    throw new Error("Message ID is required to send.");
  }

  // 1. Load the message
  const message = communicationStore.getMessage(messageId);
  if (!message) {
    throw new Error(`Message not found for ID "${messageId}".`);
  }

  // 2. Safety Rule: Verify message is APPROVED
  if (message.status !== "APPROVED") {
    throw new Error(
      `Approval Required: Cannot send message in status "${message.status}". User approval is strictly required before sending.`
    );
  }

  // 3. Verify recipient information exists
  const recipient = message.recipient || (message.recipientAddress && message.recipientAddress !== "[NOT PROVIDED]" ? message.recipientAddress : null);
  if (!recipient || recipient === "[NOT PROVIDED]") {
    throw new Error("Cannot send message: Recipient address or contact details are missing.");
  }

  // 4. Opt-Out / Preference Check
  if (isOptedOut(message)) {
    throw new Error("Cannot send message: Recipient has explicitly opted out of communications.");
  }

  // 5. Prevent duplicate sending
  if (["SEND_REQUESTED", "SENT", "DELIVERED", "READ", "REPLIED"].includes(message.status)) {
    throw new Error(`Message "${messageId}" has already been processed (Current status: ${message.status}).`);
  }

  // 6. Validate lifecycle transition to SEND_REQUESTED
  validateTransition(message.status, "SEND_REQUESTED");

  // 7. Resolve Provider Adapter
  const providerKey = options.provider ||
    message.provider ||
    (String(message.channel).toUpperCase() === "EMAIL" && process.env.EMAIL_PROVIDER ? process.env.EMAIL_PROVIDER : null) ||
    process.env.COMMUNICATION_PROVIDER ||
    "local";
  const provider = getProvider(providerKey);

  // 8. Transition to SEND_REQUESTED
  const sendRequestedAt = new Date().toISOString();
  communicationStore.updateMessage(message.id, {
    fromGateway: true,
    status: "SEND_REQUESTED",
    provider: provider.name,
    sendRequestedAt
  });

  // Record SEND_REQUESTED event
  communicationEventsStore.recordEvent({
    messageId: message.id,
    channel: message.channel,
    provider: provider.name,
    type: "SEND_REQUESTED",
    status: "SEND_REQUESTED",
    recipient,
    timestamp: sendRequestedAt,
    details: { channel: message.channel, recipient, provider: provider.name }
  });

  // 9. Call Provider Adapter
  let sendResult = null;
  try {
    sendResult = await provider.send(message, options);
  } catch (err) {
    sendResult = {
      success: false,
      errorCode: "PROVIDER_EXCEPTION",
      errorMessage: err.message || "Unexpected provider exception during send."
    };
  }

  // 10. Persist Resulting Status
  if (sendResult.success) {
    validateTransition("SEND_REQUESTED", "SENT");
    const updated = communicationStore.updateMessage(message.id, {
      fromGateway: true,
      status: "SENT",
      provider: provider.name,
      providerMessageId: sendResult.providerMessageId,
      sentAt: sendResult.sentAt || new Date().toISOString()
    });

    // Record SENT event
    communicationEventsStore.recordEvent({
      eventId: `evt-sent-${sendResult.providerMessageId}`,
      messageId: message.id,
      providerMessageId: sendResult.providerMessageId,
      channel: message.channel,
      provider: provider.name,
      type: "SENT",
      status: "SENT",
      recipient,
      timestamp: sendResult.sentAt || new Date().toISOString(),
      details: {
        provider: provider.name,
        providerMessageId: sendResult.providerMessageId,
        recipient
      }
    });

    // 11. Create CRM Activity (CONTACTED)
    if (message.leadId) {
      crmStore.addActivity({
        leadId: message.leadId,
        type: "CONTACTED",
        description: `Outbound ${message.channel} message sent via ${provider.name} provider.`,
        status: "COMPLETED",
        metadata: {
          messageId: message.id,
          providerMessageId: sendResult.providerMessageId,
          channel: message.channel,
          provider: provider.name,
          sentAt: sendResult.sentAt
        }
      });

      // 12. Advance Sales Pipeline: NOT_CONTACTED -> CONTACTED
      const lead = leadStore.getLead(message.leadId);
      if (lead) {
        const curStatus = lead.pipelineStatus || (lead.pipeline && lead.pipeline.status);
        if (curStatus === "NOT_CONTACTED") {
          leadStore.updateLead(lead.id, {
            pipelineStatus: "CONTACTED",
            pipeline: {
              ...(lead.pipeline || {}),
              status: "CONTACTED",
              lastContactedAt: sendResult.sentAt || new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          });
        }
      }
    }

    return {
      success: true,
      message: updated,
      sendResult
    };
  } else {
    // Send Failed
    const failedAt = new Date().toISOString();
    const updated = communicationStore.updateMessage(message.id, {
      fromGateway: true,
      status: "FAILED",
      errorCode: sendResult.errorCode || "SEND_FAILED",
      errorMessage: sendResult.errorMessage || "Failed to dispatch message.",
      updatedAt: failedAt
    });

    // Record FAILED event
    communicationEventsStore.recordEvent({
      messageId: message.id,
      providerMessageId: sendResult.providerMessageId || null,
      channel: message.channel,
      provider: provider.name,
      type: "FAILED",
      status: "FAILED",
      recipient,
      timestamp: failedAt,
      details: {
        errorCode: sendResult.errorCode,
        errorMessage: sendResult.errorMessage
      }
    });

    return {
      success: false,
      error: sendResult.errorMessage || "Message sending failed.",
      message: updated,
      sendResult
    };
  }
}

/**
 * Handles incoming provider lifecycle events (DELIVERED, READ, FAILED, REPLIED).
 * Guarantees idempotency and safe state progression.
 */
async function handleEvent(eventData = {}) {
  const type = String(eventData.type || "").toUpperCase().trim();
  const providerMessageId = eventData.providerMessageId;
  const eventId = eventData.eventId;

  // 1. Idempotency Check: Don't process duplicate webhooks
  if (communicationEventsStore.isEventProcessed({ eventId, providerMessageId, type })) {
    return {
      success: true,
      duplicate: true,
      message: `Event "${type}" for providerMessageId "${providerMessageId}" has already been processed.`
    };
  }

  // 2. Locate Message
  let message = null;
  if (eventData.messageId) {
    message = communicationStore.getMessage(eventData.messageId);
  }
  if (!message && providerMessageId) {
    message = communicationStore.getMessageByProviderId(providerMessageId);
  }

  if (!message) {
    throw new Error(
      `Message not found for event: messageId="${eventData.messageId}", providerMessageId="${providerMessageId}".`
    );
  }

  // 3. Validate Lifecycle Transition
  validateTransition(message.status, type);

  // 4. Record Event in Persistent Store
  const eventRecord = communicationEventsStore.recordEvent({
    eventId,
    messageId: message.id,
    providerMessageId: message.providerMessageId || providerMessageId,
    channel: message.channel,
    provider: message.provider || eventData.provider || "local",
    type,
    status: type,
    recipient: message.recipient || message.recipientAddress,
    timestamp: eventData.timestamp || new Date().toISOString(),
    details: eventData.details || {}
  });

  // 5. Update Message State based on event type
  let updatedMessage = null;
  const timestamp = eventData.timestamp || new Date().toISOString();

  if (type === "DELIVERED") {
    updatedMessage = communicationStore.updateMessage(message.id, {
      fromGateway: true,
      status: "DELIVERED",
      deliveredAt: timestamp
    });
  } else if (type === "READ") {
    updatedMessage = communicationStore.updateMessage(message.id, {
      fromGateway: true,
      status: "READ",
      readAt: timestamp
    });
  } else if (type === "FAILED") {
    updatedMessage = communicationStore.updateMessage(message.id, {
      fromGateway: true,
      status: "FAILED",
      errorCode: eventData.errorCode || "DELIVERY_FAILED",
      errorMessage: eventData.errorMessage || "Carrier reported delivery failure."
    });
  } else if (type === "REPLIED") {
    const replyText = String(eventData.text || (eventData.details && eventData.details.replyText) || "").trim();

    updatedMessage = communicationStore.recordInboundReply(message.id, {
      text: replyText,
      sender: eventData.sender || message.recipient,
      timestamp
    });

    // 6. Create CRM Activity (REPLIED)
    if (message.leadId) {
      crmStore.addActivity({
        leadId: message.leadId,
        type: "REPLIED",
        description: `Customer replied to ${message.channel}: "${replyText}"`,
        status: "COMPLETED",
        metadata: {
          messageId: message.id,
          providerMessageId: message.providerMessageId,
          channel: message.channel,
          replyText,
          repliedAt: timestamp
        }
      });

      // 7. Update Sales Pipeline to REPLIED
      // Grounding Rule: DO NOT automatically mark as INTERESTED without explicit AI analysis!
      const lead = leadStore.getLead(message.leadId);
      if (lead) {
        leadStore.updateLead(lead.id, {
          pipelineStatus: "REPLIED",
          pipeline: {
            ...(lead.pipeline || {}),
            status: "REPLIED",
            lastResponse: replyText,
            updatedAt: timestamp
          }
        });
      }
    }
  }

  return {
    success: true,
    duplicate: false,
    message: updatedMessage || message,
    event: eventRecord.event
  };
}

/**
 * Simulator helpers for deterministic testing.
 */
async function simulateDelivery(messageIdOrProviderId, options = {}) {
  const provider = getProvider("local");
  const msg = communicationStore.getMessage(messageIdOrProviderId) ||
              communicationStore.getMessageByProviderId(messageIdOrProviderId);
  if (!msg) {
    throw new Error(`Message not found for identifier "${messageIdOrProviderId}".`);
  }

  const provId = msg.providerMessageId || `sim-${msg.channel.toLowerCase()}-${msg.id}`;
  const evt = provider.simulateDelivery(provId, { ...options, messageId: msg.id });
  return handleEvent({ ...evt, messageId: msg.id });
}

async function simulateRead(messageIdOrProviderId, options = {}) {
  const provider = getProvider("local");
  const msg = communicationStore.getMessage(messageIdOrProviderId) ||
              communicationStore.getMessageByProviderId(messageIdOrProviderId);
  if (!msg) {
    throw new Error(`Message not found for identifier "${messageIdOrProviderId}".`);
  }

  const provId = msg.providerMessageId || `sim-${msg.channel.toLowerCase()}-${msg.id}`;
  const evt = provider.simulateRead(provId, { ...options, messageId: msg.id });
  return handleEvent({ ...evt, messageId: msg.id });
}

async function simulateReply(messageIdOrProviderId, replyText, options = {}) {
  const provider = getProvider("local");
  const msg = communicationStore.getMessage(messageIdOrProviderId) ||
              communicationStore.getMessageByProviderId(messageIdOrProviderId);
  if (!msg) {
    throw new Error(`Message not found for identifier "${messageIdOrProviderId}".`);
  }

  const provId = msg.providerMessageId || `sim-${msg.channel.toLowerCase()}-${msg.id}`;
  const evt = provider.simulateReply(provId, replyText, { ...options, messageId: msg.id });
  return handleEvent({ ...evt, messageId: msg.id });
}

async function simulateFailure(messageIdOrProviderId, errorReason = "Simulated delivery failure", options = {}) {
  const provider = getProvider("local");
  const msg = communicationStore.getMessage(messageIdOrProviderId) ||
              communicationStore.getMessageByProviderId(messageIdOrProviderId);
  if (!msg) {
    throw new Error(`Message not found for identifier "${messageIdOrProviderId}".`);
  }

  const provId = msg.providerMessageId || `sim-${msg.channel.toLowerCase()}-${msg.id}`;
  const evt = provider.simulateFailure(provId, errorReason, { ...options, messageId: msg.id });
  return handleEvent({ ...evt, messageId: msg.id });
}

/**
 * Returns comprehensive status and timeline for a given message.
 */
function getMessageStatus(messageId) {
  const message = communicationStore.getMessage(messageId);
  if (!message) return null;

  const events = communicationEventsStore.getEventsForMessage(message.id);
  const activities = message.leadId ? crmStore.getLeadActivities(message.leadId) : [];
  const relatedActivities = activities.filter(a => a.metadata && a.metadata.messageId === message.id);

  return {
    message,
    events,
    activities: relatedActivities
  };
}

module.exports = {
  sendMessage,
  handleEvent,
  simulateDelivery,
  simulateRead,
  simulateReply,
  simulateFailure,
  getMessageStatus,
  isOptedOut
};
