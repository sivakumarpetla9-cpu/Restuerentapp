const fs = require("fs");
const path = require("path");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const leadRepository = require("./repositories/leadRepository");

const DATA_DIR = path.join(__dirname, "../data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");

function ensureStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, "[]", "utf8");
  }
}

function normalizeValue(val, fallback = "RESEARCH REQUIRED") {
  if (val === undefined || val === null) return fallback;
  const str = String(val).trim();
  return str.length > 0 ? str : fallback;
}

function normalizeKey(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9]/g, "");
}

const PIPELINE_STATUSES = [
  "NOT_CONTACTED",
  "CONTACTED",
  "REPLIED",
  "INTERESTED",
  "FOLLOW_UP",
  "DEMO_SCHEDULED",
  "PROPOSAL_SENT",
  "WON",
  "LOST"
];

function createDefaultPipelineRecord(data = {}) {
  const candidate = (data.status || data.pipelineStatus || data.outreachStatus || "").toUpperCase().trim();
  const status = PIPELINE_STATUSES.includes(candidate) ? candidate : "NOT_CONTACTED";

  return {
    status,
    lastContactedAt: data.lastContactedAt || null,
    nextFollowUpAt: data.nextFollowUpAt || null,
    followUpCount: typeof data.followUpCount === "number" ? data.followUpCount : 0,
    lastResponse: data.lastResponse || null,
    nextAction: data.nextAction || null,
    notes: data.notes ? String(data.notes).trim() : "",
    updatedAt: data.updatedAt || new Date().toISOString()
  };
}

function createLeadRecord(data = {}) {
  const companyName = normalizeValue(data.companyName, "Unknown Business");

  const pipeline = data.pipeline
    ? createDefaultPipelineRecord({ ...data.pipeline, status: data.pipeline.status || data.pipelineStatus || data.outreachStatus })
    : createDefaultPipelineRecord(data);
  const pipelineStatus = pipeline.status;

  return {
    id: data.id || `lead-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    companyName,
    website: normalizeValue(data.website),
    industry: normalizeValue(data.industry),
    location: normalizeValue(data.location),
    contactName: normalizeValue(data.contactName),
    contactRole: normalizeValue(data.contactRole),
    email: normalizeValue(data.email),
    phone: normalizeValue(data.phone),
    source: normalizeValue(data.source, "User request / memory context"),
    sourceType: data.sourceType || "USER_INPUT", // FILE, URL, PASTED_TEXT, MEMORY, USER_INPUT
    evidence: normalizeValue(data.evidence, "USER-PROVIDED"),
    qualificationStatus: data.qualificationStatus || "NEEDS_RESEARCH", // UNQUALIFIED, POSSIBLE_FIT, QUALIFIED, NEEDS_RESEARCH
    fitReason: normalizeValue(data.fitReason),
    painPoints: normalizeValue(data.painPoints),
    potentialNeed: normalizeValue(data.potentialNeed),
    pipelineStatus,
    outreachStatus: pipelineStatus, // kept synced for backward compatibility
    pipeline,
    notes: data.notes ? String(data.notes).trim() : "",
    qualification: data.qualification || null,
    communicationOptOut: Boolean(data.communicationOptOut),
    preferredChannel: data.preferredChannel || null,
    createdAt: data.createdAt || new Date().toISOString()
  };
}

function loadLeads() {
  ensureStoreExists();
  try {
    const raw = fs.readFileSync(LEADS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLeads(leads) {
  ensureStoreExists();
  fs.writeFileSync(
    LEADS_FILE,
    JSON.stringify(leads, null, 2),
    "utf8"
  );
}

function isDuplicate(existing, incoming) {
  // Check company name
  const existingCompany = normalizeKey(existing.companyName);
  const incomingCompany = normalizeKey(incoming.companyName);
  if (existingCompany && incomingCompany && existingCompany === incomingCompany && existingCompany !== "unknownbusiness") {
    return true;
  }

  // Check website if real
  const existingWeb = normalizeKey(existing.website);
  const incomingWeb = normalizeKey(incoming.website);
  if (
    existingWeb &&
    incomingWeb &&
    existingWeb !== "researchrequired" &&
    incomingWeb !== "researchrequired" &&
    existingWeb === incomingWeb
  ) {
    return true;
  }

  // Check email if real
  const existingEmail = String(existing.email || "").toLowerCase().trim();
  const incomingEmail = String(incoming.email || "").toLowerCase().trim();
  if (
    existingEmail &&
    incomingEmail &&
    existingEmail !== "research required" &&
    incomingEmail !== "research required" &&
    existingEmail === incomingEmail
  ) {
    return true;
  }

  return false;
}

function addLead(leadData) {
  const leads = loadLeads();
  const candidate = createLeadRecord(leadData);

  const existingIndex = leads.findIndex(lead => isDuplicate(lead, candidate));

  if (existingIndex !== -1) {
    const existing = leads[existingIndex];
    // Merge non-empty / improved fields into existing lead
    const updated = {
      ...existing,
      website: existing.website === "RESEARCH REQUIRED" && candidate.website !== "RESEARCH REQUIRED" ? candidate.website : existing.website,
      industry: existing.industry === "RESEARCH REQUIRED" && candidate.industry !== "RESEARCH REQUIRED" ? candidate.industry : existing.industry,
      location: existing.location === "RESEARCH REQUIRED" && candidate.location !== "RESEARCH REQUIRED" ? candidate.location : existing.location,
      contactName: existing.contactName === "RESEARCH REQUIRED" && candidate.contactName !== "RESEARCH REQUIRED" ? candidate.contactName : existing.contactName,
      contactRole: existing.contactRole === "RESEARCH REQUIRED" && candidate.contactRole !== "RESEARCH REQUIRED" ? candidate.contactRole : existing.contactRole,
      email: existing.email === "RESEARCH REQUIRED" && candidate.email !== "RESEARCH REQUIRED" ? candidate.email : existing.email,
      phone: existing.phone === "RESEARCH REQUIRED" && candidate.phone !== "RESEARCH REQUIRED" ? candidate.phone : existing.phone,
      potentialNeed: existing.potentialNeed === "RESEARCH REQUIRED" && candidate.potentialNeed !== "RESEARCH REQUIRED" ? candidate.potentialNeed : existing.potentialNeed,
      fitReason: candidate.fitReason !== "RESEARCH REQUIRED" ? candidate.fitReason : existing.fitReason,
      qualificationStatus: candidate.qualificationStatus !== "NEEDS_RESEARCH" ? candidate.qualificationStatus : existing.qualificationStatus,
      qualification: candidate.qualification || existing.qualification || null,
      pipeline: candidate.pipeline || existing.pipeline || createDefaultPipelineRecord(existing),
      pipelineStatus: (candidate.pipeline && candidate.pipeline.status !== "NOT_CONTACTED") ? candidate.pipeline.status : (existing.pipelineStatus || existing.outreachStatus || "NOT_CONTACTED"),
      outreachStatus: (candidate.pipeline && candidate.pipeline.status !== "NOT_CONTACTED") ? candidate.pipeline.status : (existing.pipelineStatus || existing.outreachStatus || "NOT_CONTACTED"),
      notes: [existing.notes, candidate.notes].filter(Boolean).join(" | "),
      updatedAt: new Date().toISOString()
    };

    leads[existingIndex] = updated;
    saveLeads(leads);

    if (isSyncEnabled()) {
      leadRepository.updateLead(updated.id, updated).catch(err => {
        console.warn("[LeadStore PG Sync Warning]", err.message);
      });
    }

    return { success: true, lead: updated, updated: true };
  }

  leads.push(candidate);
  saveLeads(leads);

  if (isSyncEnabled()) {
    leadRepository.createLead(candidate).catch(err => {
      console.warn("[LeadStore PG Sync Warning]", err.message);
    });
  }

  return { success: true, lead: candidate, created: true };
}

function addLeads(leadsArray = []) {
  const results = [];
  for (const item of leadsArray) {
    results.push(addLead(item));
  }
  return results;
}

function getLead(id) {
  const leads = loadLeads();
  return leads.find(l => l.id === id) || null;
}

function getLeads(filter = {}) {
  const leads = loadLeads();

  return leads.filter(lead => {
    if (filter.qualificationStatus && lead.qualificationStatus !== filter.qualificationStatus) {
      return false;
    }
    if (filter.pipelineStatus && lead.pipelineStatus !== filter.pipelineStatus && (!lead.pipeline || lead.pipeline.status !== filter.pipelineStatus)) {
      return false;
    }
    if (filter.outreachStatus && lead.outreachStatus !== filter.outreachStatus) {
      return false;
    }
    if (filter.industry && !lead.industry.toLowerCase().includes(filter.industry.toLowerCase())) {
      return false;
    }
    if (filter.sourceType && lead.sourceType !== filter.sourceType) {
      return false;
    }
    return true;
  });
}

function updateLead(id, updates = {}) {
  const leads = loadLeads();
  const index = leads.findIndex(l => l.id === id);
  if (index === -1) {
    return null;
  }

  const updated = {
    ...leads[index],
    ...updates,
    id: leads[index].id, // protect immutable id
    createdAt: leads[index].createdAt,
    updatedAt: new Date().toISOString()
  };

  leads[index] = updated;
  saveLeads(leads);

  if (isSyncEnabled()) {
    leadRepository.updateLead(id, updated).catch(err => {
      console.warn("[LeadStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

function searchLeads(query) {
  if (!query || typeof query !== "string") return [];
  const q = query.toLowerCase().trim();
  const leads = loadLeads();

  return leads.filter(l =>
    (l.companyName && l.companyName.toLowerCase().includes(q)) ||
    (l.industry && l.industry.toLowerCase().includes(q)) ||
    (l.location && l.location.toLowerCase().includes(q)) ||
    (l.contactName && l.contactName.toLowerCase().includes(q)) ||
    (l.potentialNeed && l.potentialNeed.toLowerCase().includes(q)) ||
    (l.pipelineStatus && l.pipelineStatus.toLowerCase().includes(q)) ||
    (l.notes && l.notes.toLowerCase().includes(q))
  );
}

function deleteLead(id) {
  const leads = loadLeads();
  const filtered = leads.filter(l => l.id !== id);
  if (filtered.length === leads.length) return false;
  saveLeads(filtered);

  if (isSyncEnabled()) {
    leadRepository.deleteLead(id).catch(err => {
      console.warn("[LeadStore PG Sync Warning]", err.message);
    });
  }

  return true;
}

function clearLeads() {
  saveLeads([]);

  if (isSyncEnabled()) {
    leadRepository.clearLeads().catch(err => {
      console.warn("[LeadStore PG Sync Warning]", err.message);
    });
  }
}

function getQualifiedLeads() {
  return getLeads({ qualificationStatus: "QUALIFIED" });
}

function getPipelineLeads(status = null) {
  const leads = loadLeads();
  if (!status) return leads;
  const target = String(status).toUpperCase().trim();
  return leads.filter(l => l.pipelineStatus === target || (l.pipeline && l.pipeline.status === target));
}

function updateLeadPipeline(id, pipelineData = {}) {
  const leads = loadLeads();
  const index = leads.findIndex(l => l.id === id);
  if (index === -1) return null;

  const current = leads[index];
  const currentPipeline = current.pipeline || createDefaultPipelineRecord(current);
  const targetStatus = pipelineData.status ? pipelineData.status.toUpperCase().trim() : currentPipeline.status;
  const validStatus = PIPELINE_STATUSES.includes(targetStatus) ? targetStatus : currentPipeline.status;

  const updatedPipeline = {
    ...currentPipeline,
    ...pipelineData,
    status: validStatus,
    updatedAt: new Date().toISOString()
  };

  if (pipelineData.status && validStatus !== currentPipeline.status) {
    if (validStatus === "CONTACTED" && !updatedPipeline.lastContactedAt) {
      updatedPipeline.lastContactedAt = new Date().toISOString();
    }
    if (validStatus === "FOLLOW_UP") {
      updatedPipeline.followUpCount = (currentPipeline.followUpCount || 0) + 1;
    }
  }

  return updateLead(id, {
    pipelineStatus: validStatus,
    outreachStatus: validStatus,
    pipeline: updatedPipeline
  });
}

function getLeadsNeedingFollowUp() {
  const leads = loadLeads();
  return leads.filter(l => {
    const p = l.pipeline || createDefaultPipelineRecord(l);
    if (p.status === "FOLLOW_UP") return true;
    if (p.nextFollowUpAt) {
      const followUpTime = new Date(p.nextFollowUpAt).getTime();
      if (!isNaN(followUpTime) && followUpTime <= Date.now()) return true;
    }
    return false;
  });
}

module.exports = {
  createLeadRecord,
  createDefaultPipelineRecord,
  PIPELINE_STATUSES,
  loadLeads,
  saveLeads,
  addLead,
  addLeads,
  getLead,
  getLeads,
  getQualifiedLeads,
  getPipelineLeads,
  updateLead,
  updateLeadPipeline,
  getLeadsNeedingFollowUp,
  searchLeads,
  deleteLead,
  clearLeads,
  repository: leadRepository,
  LEADS_FILE
};
