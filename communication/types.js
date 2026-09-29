/**
 * Level 3 Communication Gateway - Domain Types & Constants
 */

const CHANNELS = ["WHATSAPP", "EMAIL", "SMS"];

const MESSAGE_STATUSES = [
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "SEND_REQUESTED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "REPLIED",
  "CANCELLED",
  "COPIED"
];

const COMMUNICATION_EVENTS = [
  "SEND_REQUESTED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "REPLIED"
];

const PROVIDER_CAPABILITIES = [
  "send",
  "deliveryStatus",
  "readStatus",
  "inboundMessages",
  "attachments"
];

function isValidChannel(channel) {
  if (!channel || typeof channel !== "string") return false;
  return CHANNELS.includes(channel.toUpperCase().trim());
}

function isValidStatus(status) {
  if (!status || typeof status !== "string") return false;
  return MESSAGE_STATUSES.includes(status.toUpperCase().trim());
}

function isValidEvent(event) {
  if (!event || typeof event !== "string") return false;
  return COMMUNICATION_EVENTS.includes(event.toUpperCase().trim());
}

module.exports = {
  CHANNELS,
  MESSAGE_STATUSES,
  COMMUNICATION_EVENTS,
  PROVIDER_CAPABILITIES,
  isValidChannel,
  isValidStatus,
  isValidEvent
};
