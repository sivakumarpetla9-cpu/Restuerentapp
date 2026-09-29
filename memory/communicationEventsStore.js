const fs = require("fs");
const path = require("path");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const communicationEventsRepository = require("./repositories/communicationEventsRepository");

const DATA_DIR = path.join(__dirname, "../data");
const EVENTS_FILE = path.join(DATA_DIR, "communication_events.json");

function ensureStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(EVENTS_FILE)) {
    fs.writeFileSync(EVENTS_FILE, "[]", "utf8");
  }
}

function loadEvents() {
  ensureStoreExists();
  try {
    const raw = fs.readFileSync(EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events) {
  ensureStoreExists();
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), "utf8");
}

/**
 * Checks whether an event has already been processed based on:
 * 1. Matching eventId (if explicitly provided)
 * 2. Or matching providerMessageId + type
 */
function isEventProcessed({ eventId, providerMessageId, type }) {
  if (!eventId && (!providerMessageId || !type)) {
    return false;
  }

  const events = loadEvents();
  const normType = String(type || "").toUpperCase().trim();

  return events.some(e => {
    if (eventId && e.eventId === eventId) return true;
    if (providerMessageId && e.providerMessageId === providerMessageId && e.type === normType) {
      return true;
    }
    return false;
  });
}

/**
 * Records a new communication event with idempotency protection.
 * Returns { processed: boolean, duplicate: boolean, event: object }
 */
function recordEvent(eventData = {}) {
  const events = loadEvents();
  const type = String(eventData.type || "SENT").toUpperCase().trim();
  const providerMessageId = eventData.providerMessageId || null;
  const eventId = eventData.eventId || null;

  // Idempotency check
  if (isEventProcessed({ eventId, providerMessageId, type })) {
    const existing = events.find(e =>
      (eventId && e.eventId === eventId) ||
      (providerMessageId && e.providerMessageId === providerMessageId && e.type === type)
    );
    return {
      processed: false,
      duplicate: true,
      event: existing
    };
  }

  const now = new Date().toISOString();
  const finalEventId = eventId || `evt-id-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Strip sensitive fields
  const safeDetails = { ...(eventData.details || eventData.payload || {}) };
  delete safeDetails.password;
  delete safeDetails.apiKey;
  delete safeDetails.token;
  delete safeDetails.secret;

  const entry = {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    eventId: finalEventId,
    messageId: eventData.messageId || null,
    providerMessageId,
    channel: String(eventData.channel || "EMAIL").toUpperCase().trim(),
    provider: String(eventData.provider || "local").toLowerCase().trim(),
    type,
    status: eventData.status ? String(eventData.status).toUpperCase().trim() : type,
    recipient: eventData.recipient || null,
    details: safeDetails,
    timestamp: eventData.timestamp || now,
    processedAt: now
  };

  events.push(entry);
  saveEvents(events);

  if (isSyncEnabled()) {
    communicationEventsRepository.createEvent(entry).catch(err => {
      console.warn("[CommEventsStore PG Sync Warning]", err.message);
    });
  }

  return {
    processed: true,
    duplicate: false,
    event: entry
  };
}

function getEvents(filter = {}) {
  const events = loadEvents();
  return events.filter(e => {
    if (filter.messageId && e.messageId !== filter.messageId) return false;
    if (filter.providerMessageId && e.providerMessageId !== filter.providerMessageId) return false;
    if (filter.channel && e.channel !== filter.channel.toUpperCase().trim()) return false;
    if (filter.provider && e.provider !== filter.provider.toLowerCase().trim()) return false;
    if (filter.type && e.type !== filter.type.toUpperCase().trim()) return false;
    return true;
  });
}

function getEventsForMessage(messageId) {
  if (!messageId) return [];
  return getEvents({ messageId });
}

function clearEvents() {
  ensureStoreExists();
  saveEvents([]);

  if (isSyncEnabled()) {
    communicationEventsRepository.clearEvents().catch(() => {});
  }
}

module.exports = {
  recordEvent,
  isEventProcessed,
  getEvents,
  getEventsForMessage,
  clearEvents,
  clearCommunicationEvents: clearEvents,
  repository: communicationEventsRepository,
  EVENTS_FILE
};
