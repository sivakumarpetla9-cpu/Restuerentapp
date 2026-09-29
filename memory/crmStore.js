const fs = require("fs");
const path = require("path");
const leadStore = require("./leadStore");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const crmRepository = require("./repositories/crmRepository");

const DATA_DIR = path.join(__dirname, "../data");
const CONTACTS_FILE = path.join(DATA_DIR, "contacts.json");
const ACTIVITIES_FILE = path.join(DATA_DIR, "activities.json");
const CLIENTS_FILE = path.join(DATA_DIR, "clients.json");

const ACTIVITY_TYPES = [
  "NOTE",
  "OUTREACH_PREPARED",
  "CONTACTED",
  "REPLIED",
  "FOLLOW_UP",
  "DEMO_SCHEDULED",
  "PROPOSAL_SENT",
  "STATUS_CHANGED",
  "CLIENT_CONVERTED",
  "PROJECT_CREATED",
  "REQUIREMENT_RECEIVED",
  "REQUIREMENT_CONFIRMED",
  "MILESTONE_COMPLETED",
  "CLIENT_REVIEW",
  "PROJECT_COMPLETED",
  "MEETING",
  "OTHER"
];

const CLIENT_STATUSES = [
  "PROSPECT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "LOST"
];

function ensureCrmStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CONTACTS_FILE)) {
    fs.writeFileSync(CONTACTS_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(ACTIVITIES_FILE)) {
    fs.writeFileSync(ACTIVITIES_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(CLIENTS_FILE)) {
    fs.writeFileSync(CLIENTS_FILE, "[]", "utf8");
  }
}

function loadJson(filePath) {
  ensureCrmStoreExists();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJson(filePath, data) {
  ensureCrmStoreExists();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/* ========================================================================= */
/* CONTACTS                                                                  */
/* ========================================================================= */

function loadContacts() {
  return loadJson(CONTACTS_FILE);
}

function saveContacts(contacts) {
  saveJson(CONTACTS_FILE, contacts);
}

function createContactRecord(data = {}) {
  const name = String(data.name || data.contactName || "Unknown Contact").trim();
  const leadId = data.leadId || null;

  return {
    id: data.id || `contact-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    leadId,
    name,
    role: data.role || data.contactRole || "RESEARCH REQUIRED",
    email: data.email || "RESEARCH REQUIRED",
    phone: data.phone || "RESEARCH REQUIRED",
    source: data.source || "lead-sync",
    evidenceType: data.evidenceType || "USER-PROVIDED", // VERIFIED, USER-PROVIDED, RESEARCH REQUIRED
    notes: data.notes ? String(data.notes).trim() : "",
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}

function createContact(contactData) {
  const contacts = loadContacts();
  const candidate = createContactRecord(contactData);

  // Check duplicate contact for same lead (by name or email)
  const existingIdx = contacts.findIndex(c => {
    if (candidate.leadId && c.leadId === candidate.leadId) {
      if (candidate.name && c.name && candidate.name.toLowerCase() === c.name.toLowerCase()) return true;
      if (candidate.email && c.email && candidate.email !== "RESEARCH REQUIRED" && candidate.email.toLowerCase() === c.email.toLowerCase()) return true;
    }
    return false;
  });

  if (existingIdx !== -1) {
    const existing = contacts[existingIdx];
    const updated = {
      ...existing,
      role: candidate.role !== "RESEARCH REQUIRED" ? candidate.role : existing.role,
      email: candidate.email !== "RESEARCH REQUIRED" ? candidate.email : existing.email,
      phone: candidate.phone !== "RESEARCH REQUIRED" ? candidate.phone : existing.phone,
      notes: [existing.notes, candidate.notes].filter(Boolean).join(" | "),
      updatedAt: new Date().toISOString()
    };
    contacts[existingIdx] = updated;
    saveContacts(contacts);

    if (isSyncEnabled()) {
      crmRepository.updateContact(updated.id, updated).catch(err => {
        console.warn("[CRMStore PG Sync Warning]", err.message);
      });
    }

    return { success: true, contact: updated, updated: true };
  }

  contacts.push(candidate);
  saveContacts(contacts);

  if (isSyncEnabled()) {
    crmRepository.createContact(candidate).catch(err => {
      console.warn("[CRMStore PG Sync Warning]", err.message);
    });
  }

  return { success: true, contact: candidate, created: true };
}

function getContact(id) {
  const contacts = loadContacts();
  return contacts.find(c => c.id === id) || null;
}

function getContacts(filter = {}) {
  const contacts = loadContacts();
  return contacts.filter(c => {
    if (filter.leadId && c.leadId !== filter.leadId) return false;
    if (filter.role && !c.role.toLowerCase().includes(filter.role.toLowerCase())) return false;
    if (filter.name && !c.name.toLowerCase().includes(filter.name.toLowerCase())) return false;
    return true;
  });
}

function getLeadContacts(leadId) {
  return getContacts({ leadId });
}

function updateContact(id, updates = {}) {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const updated = {
    ...contacts[idx],
    ...updates,
    id: contacts[idx].id,
    leadId: contacts[idx].leadId,
    createdAt: contacts[idx].createdAt,
    updatedAt: new Date().toISOString()
  };

  contacts[idx] = updated;
  saveContacts(contacts);
  return updated;
}

function deleteContact(id) {
  const contacts = loadContacts();
  const filtered = contacts.filter(c => c.id !== id);
  if (filtered.length === contacts.length) return false;
  saveContacts(filtered);
  return true;
}

/**
 * Automatically synchronizes a primary contact from a lead record if contact details exist.
 */
function syncLeadContact(lead) {
  if (!lead || !lead.id) return null;
  const contactName = lead.contactName;
  if (!contactName || contactName === "RESEARCH REQUIRED" || contactName === "Unknown Business") {
    return null;
  }

  const res = createContact({
    leadId: lead.id,
    name: contactName,
    role: lead.contactRole || "RESEARCH REQUIRED",
    email: lead.email || "RESEARCH REQUIRED",
    phone: lead.phone || "RESEARCH REQUIRED",
    source: lead.source || "lead-sync",
    evidenceType: lead.evidence && lead.evidence.includes("VERIFIED") ? "VERIFIED" : "USER-PROVIDED",
    notes: `Primary contact synced from lead ${lead.companyName}`
  });

  return res.contact;
}

/* ========================================================================= */
/* ACTIVITIES                                                                */
/* ========================================================================= */

function loadActivities() {
  return loadJson(ACTIVITIES_FILE);
}

function saveActivities(activities) {
  saveJson(ACTIVITIES_FILE, activities);
}

function addActivity(data = {}) {
  const activities = loadActivities();
  const typeCandidate = String(data.type || "NOTE").toUpperCase().trim();
  const type = ACTIVITY_TYPES.includes(typeCandidate) ? typeCandidate : "OTHER";

  const activity = {
    id: data.id || `act-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    leadId: data.leadId || null,
    type,
    description: String(data.description || "").trim() || "CRM Activity Logged",
    status: data.status || "COMPLETED", // COMPLETED, SCHEDULED, PENDING
    occurredAt: data.occurredAt || new Date().toISOString(),
    metadata: typeof data.metadata === "object" && data.metadata !== null ? { ...data.metadata } : {},
    createdAt: data.createdAt || new Date().toISOString()
  };

  activities.push(activity);
  saveActivities(activities);

  if (isSyncEnabled()) {
    crmRepository.createActivity({
      id: activity.id,
      entityType: "LEAD",
      entityId: activity.leadId || "unknown",
      type: activity.type,
      description: activity.description,
      metadata: activity.metadata,
      createdAt: activity.createdAt
    }).catch(err => {
      console.warn("[CRMStore PG Sync Warning]", err.message);
    });
  }

  return activity;
}

function getActivity(id) {
  const activities = loadActivities();
  return activities.find(a => a.id === id) || null;
}

function getActivities(filter = {}) {
  const activities = loadActivities();
  return activities.filter(a => {
    if (filter.leadId && a.leadId !== filter.leadId) return false;
    if (filter.type && a.type !== filter.type.toUpperCase().trim()) return false;
    if (filter.status && a.status !== filter.status) return false;
    return true;
  });
}

function getLeadActivities(leadId) {
  const activities = getActivities({ leadId });
  // Sort descending by occurredAt
  return activities.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

/* ========================================================================= */
/* CLIENTS                                                                   */
/* ========================================================================= */

function loadClients() {
  return loadJson(CLIENTS_FILE);
}

function saveClients(clients) {
  saveJson(CLIENTS_FILE, clients);
}

function createClientRecord(data = {}) {
  const statusCandidate = String(data.status || "ACTIVE").toUpperCase().trim();
  const status = CLIENT_STATUSES.includes(statusCandidate) ? statusCandidate : "ACTIVE";

  return {
    id: data.id || `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    leadId: data.leadId,
    companyName: String(data.companyName || "Unknown Client").trim(),
    primaryContactId: data.primaryContactId || null,
    status,
    service: data.service ? String(data.service).trim() : "Standard Business Solution",
    notes: data.notes ? String(data.notes).trim() : "",
    communicationOptOut: Boolean(data.communicationOptOut),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}

function createClient(clientData = {}) {
  if (!clientData.leadId) {
    throw new Error("Client record must reference an existing leadId.");
  }

  // Verify lead exists
  const lead = leadStore.getLead(clientData.leadId);
  if (!lead) {
    throw new Error(`Referenced lead "${clientData.leadId}" does not exist.`);
  }

  const clients = loadClients();

  // Prevent duplicate client for the same leadId
  const existingIdx = clients.findIndex(c => c.leadId === clientData.leadId);
  if (existingIdx !== -1) {
    const existing = clients[existingIdx];
    const updated = {
      ...existing,
      status: clientData.status || existing.status,
      service: clientData.service || existing.service,
      notes: [existing.notes, clientData.notes].filter(Boolean).join(" | "),
      updatedAt: new Date().toISOString()
    };
    clients[existingIdx] = updated;
    saveClients(clients);
    return { success: true, client: updated, updated: true };
  }

  const candidate = createClientRecord({
    ...clientData,
    companyName: clientData.companyName || lead.companyName
  });

  clients.push(candidate);
  saveClients(clients);

  if (isSyncEnabled()) {
    crmRepository.createClient({
      id: candidate.id,
      name: candidate.name,
      company: candidate.companyName,
      email: candidate.email,
      phone: candidate.phone,
      status: candidate.status,
      tier: candidate.tier,
      convertedFromLeadId: candidate.leadId,
      billing: candidate.billing,
      deliveryProfile: candidate.deliveryProfile,
      notes: candidate.notes,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt
    }).catch(err => {
      console.warn("[CRMStore PG Sync Warning]", err.message);
    });
  }

  return { success: true, client: candidate, created: true };
}

function getClient(id) {
  const clients = loadClients();
  return clients.find(c => c.id === id) || null;
}

function getClientByLeadId(leadId) {
  const clients = loadClients();
  return clients.find(c => c.leadId === leadId) || null;
}

function getClients(filter = {}) {
  const clients = loadClients();
  return clients.filter(c => {
    if (filter.status && c.status !== filter.status.toUpperCase().trim()) return false;
    if (filter.leadId && c.leadId !== filter.leadId) return false;
    if (filter.service && !c.service.toLowerCase().includes(filter.service.toLowerCase())) return false;
    return true;
  });
}

function updateClient(id, updates = {}) {
  const clients = loadClients();
  const idx = clients.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const updated = {
    ...clients[idx],
    ...updates,
    id: clients[idx].id,
    leadId: clients[idx].leadId,
    createdAt: clients[idx].createdAt,
    updatedAt: new Date().toISOString()
  };

  clients[idx] = updated;
  saveClients(clients);

  if (isSyncEnabled()) {
    crmRepository.updateClient(id, {
      name: updated.name,
      company: updated.companyName,
      status: updated.status,
      tier: updated.tier,
      notes: updated.notes,
      billing: updated.billing,
      deliveryProfile: updated.deliveryProfile
    }).catch(err => {
      console.warn("[CRMStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

/**
 * Controlled conversion of a lead into a client:
 * 1. Verifies the lead exists.
 * 2. Preserves the lead, its qualification, and pipeline.
 * 3. Syncs contact if available.
 * 4. Creates or updates linked client.
 * 5. Logs conversion activity.
 * 6. Avoids duplicate clients.
 */
function convertLeadToClient(leadId, options = {}) {
  if (!leadId) {
    return { success: false, error: "Lead ID or identifier must be provided." };
  }

  const lead = leadStore.getLead(leadId);
  if (!lead) {
    return { success: false, error: `Lead not found for identifier "${leadId}".` };
  }

  // 1. Ensure contact is synced
  const contact = syncLeadContact(lead);

  // 2. Create or retrieve client
  const clientRes = createClient({
    leadId: lead.id,
    companyName: lead.companyName,
    primaryContactId: contact ? contact.id : null,
    status: options.status || "ACTIVE",
    service: options.service || lead.potentialNeed || "Commercial Solution",
    notes: options.notes || `Converted to client from ${lead.pipelineStatus || "pipeline"}.`
  });

  // 3. Update lead pipeline status to WON if not already
  if (lead.pipelineStatus !== "WON") {
    leadStore.updateLeadPipeline(lead.id, {
      status: "WON",
      notes: "Lead successfully converted to active client."
    });
  }

  // 4. Log conversion activity
  const activity = addActivity({
    leadId: lead.id,
    type: "CLIENT_CONVERTED",
    description: `Converted "${lead.companyName}" to client (${clientRes.client.status}) for service: ${clientRes.client.service}`,
    status: "COMPLETED",
    metadata: {
      clientId: clientRes.client.id,
      service: clientRes.client.service,
      clientStatus: clientRes.client.status
    }
  });

  const updatedLead = leadStore.getLead(lead.id);

  return {
    success: true,
    client: clientRes.client,
    lead: updatedLead,
    contact,
    activity,
    isNewClient: Boolean(clientRes.created)
  };
}

/* ========================================================================= */
/* CRM AGGREGATIONS & LEAD PROFILES                                          */
/* ========================================================================= */

function getCRMOverview() {
  const leads = leadStore.loadLeads();
  const contacts = loadContacts();
  const activities = loadActivities();
  const clients = loadClients();

  // Lead qualification breakdown
  const qualificationCounts = {
    TOTAL: leads.length,
    QUALIFIED: leads.filter(l => l.qualificationStatus === "QUALIFIED").length,
    POSSIBLE_FIT: leads.filter(l => l.qualificationStatus === "POSSIBLE_FIT").length,
    NEEDS_RESEARCH: leads.filter(l => l.qualificationStatus === "NEEDS_RESEARCH" || !l.qualificationStatus).length,
    UNQUALIFIED: leads.filter(l => l.qualificationStatus === "UNQUALIFIED").length
  };

  // Pipeline stages breakdown
  const pipelineCounts = {};
  for (const st of leadStore.PIPELINE_STATUSES) {
    pipelineCounts[st] = leads.filter(l => l.pipelineStatus === st || (l.pipeline && l.pipeline.status === st)).length;
  }

  // Client status breakdown
  const clientCounts = {
    TOTAL: clients.length,
    ACTIVE: clients.filter(c => c.status === "ACTIVE").length,
    PROSPECT: clients.filter(c => c.status === "PROSPECT").length,
    PAUSED: clients.filter(c => c.status === "PAUSED").length,
    COMPLETED: clients.filter(c => c.status === "COMPLETED").length,
    LOST: clients.filter(c => c.status === "LOST").length
  };

  return {
    leads: qualificationCounts,
    pipeline: pipelineCounts,
    clients: clientCounts,
    contactsCount: contacts.length,
    activitiesCount: activities.length,
    generatedAt: new Date().toISOString()
  };
}

function getLeadCRMProfile(leadIdOrQuery) {
  if (!leadIdOrQuery) return null;

  // 1. Find lead by exact ID
  let lead = leadStore.getLead(leadIdOrQuery);

  // 2. If not found by ID, search by company name
  if (!lead) {
    const matches = leadStore.searchLeads(leadIdOrQuery);
    if (matches.length > 0) {
      lead = matches[0];
    }
  }

  if (!lead) return null;

  // Sync contact if present
  syncLeadContact(lead);

  const contacts = getLeadContacts(lead.id);
  const activities = getLeadActivities(lead.id);
  const client = getClientByLeadId(lead.id);

  return {
    lead,
    qualification: lead.qualification || {
      status: lead.qualificationStatus || "NEEDS_RESEARCH",
      score: "Not evaluated",
      reasoning: lead.fitReason || "No qualification recorded"
    },
    pipeline: lead.pipeline || leadStore.createDefaultPipelineRecord(lead),
    contacts,
    activities,
    client
  };
}

function clearCRM() {
  saveContacts([]);
  saveActivities([]);
  saveClients([]);

  if (isSyncEnabled()) {
    crmRepository.clearContacts().catch(() => {});
    crmRepository.clearActivities().catch(() => {});
    crmRepository.clearClients().catch(() => {});
  }
}

module.exports = {
  createContact,
  getContact,
  getContacts,
  getLeadContacts,
  updateContact,
  deleteContact,
  syncLeadContact,
  addActivity,
  getActivity,
  getActivities,
  getLeadActivities,
  createClient,
  getClient,
  getClientByLeadId,
  getClients,
  updateClient,
  convertLeadToClient,
  getCRMOverview,
  getLeadCRMProfile,
  clearCRM,
  repository: crmRepository,
  ACTIVITY_TYPES,
  CLIENT_STATUSES,
  CONTACTS_FILE,
  ACTIVITIES_FILE,
  CLIENTS_FILE
};
