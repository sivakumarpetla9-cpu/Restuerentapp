const fs = require("fs");
const path = require("path");
const leadStore = require("./leadStore");
const crmStore = require("./crmStore");
const serviceDeliveryStore = require("./serviceDeliveryStore");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const communicationRepository = require("./repositories/communicationRepository");

const DATA_DIR = path.join(__dirname, "../data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");

const CHANNELS = ["EMAIL", "WHATSAPP", "SMS"];
const DIRECTIONS = ["OUTBOUND", "INBOUND"];
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

const MESSAGE_PURPOSES = [
  "INITIAL_OUTREACH",
  "FOLLOW_UP",
  "DEMO_INVITATION",
  "PROPOSAL_FOLLOW_UP",
  "CLIENT_WELCOME",
  "REQUIREMENT_REQUEST",
  "PROJECT_UPDATE",
  "MILESTONE_UPDATE",
  "CLIENT_REVIEW",
  "PROJECT_COMPLETED",
  "GENERAL"
];

function getDefaultTemplates() {
  return [
    {
      id: "tmpl-initial-outreach-email",
      name: "Initial Outreach (Email)",
      channel: "EMAIL",
      purpose: "INITIAL_OUTREACH",
      subject: "Connecting regarding {{company}}'s operations",
      body: `Hi {{contact_name}},

I noticed {{company}}'s presence in {{industry}} and wanted to reach out. We specialize in helping businesses solve challenges with {{potential_need}}.

Would you be open to a brief 10-minute introductory conversation this week to see if this could be valuable for {{company}}?

Best regards,
Business Development Team`
    },
    {
      id: "tmpl-initial-outreach-whatsapp",
      name: "Initial Outreach (WhatsApp)",
      channel: "WHATSAPP",
      purpose: "INITIAL_OUTREACH",
      subject: null,
      body: `Hi {{contact_name}}, hope you're having a good week! I came across {{company}} and wanted to check if you might be interested in solutions for {{potential_need}}. Would love to share a quick 2-minute overview if you're open to it.`
    },
    {
      id: "tmpl-follow-up-email",
      name: "Follow-up (Email)",
      channel: "EMAIL",
      purpose: "FOLLOW_UP",
      subject: "Following up: {{company}} & {{potential_need}}",
      body: `Hi {{contact_name}},

Following up on my previous note regarding {{potential_need}} for {{company}}. I know schedules get busy, so I wanted to see if this is currently on your radar.

If so, I'd be glad to share how similar teams address this.

Best regards,
Business Development Team`
    },
    {
      id: "tmpl-demo-invitation-email",
      name: "Demo Invitation (Email)",
      channel: "EMAIL",
      purpose: "DEMO_INVITATION",
      subject: "Walkthrough tailored for {{company}}",
      body: `Hi {{contact_name}},

Following our conversation regarding {{potential_need}}, I would love to walk you through a brief 15-minute demonstration of how this works in practice for {{company}}.

Do you have any availability this Wednesday or Thursday?

Best regards,
Commercial Solutions Team`
    },
    {
      id: "tmpl-proposal-followup-email",
      name: "Proposal Follow-up (Email)",
      channel: "EMAIL",
      purpose: "PROPOSAL_FOLLOW_UP",
      subject: "Checking in on proposal for {{company}}",
      body: `Hi {{contact_name}},

I wanted to follow up on the proposal we shared for {{company}}. Have you or your team had a chance to review the details?

Please let me know if any questions came up or if any adjustments are needed.

Best regards,
Commercial Solutions Team`
    },
    {
      id: "tmpl-client-welcome-email",
      name: "Client Welcome (Email)",
      channel: "EMAIL",
      purpose: "CLIENT_WELCOME",
      subject: "Welcome to our partnership, {{company}}!",
      body: `Dear {{contact_name}},

Welcome aboard! We are excited to collaborate with {{company}} on {{service}}.

We are currently preparing your project environment ({{project_name}}) and will share the kickoff agenda and requirements checklist shortly.

Best regards,
Client Success Team`
    },
    {
      id: "tmpl-requirement-request-email",
      name: "Requirements Request (Email)",
      channel: "EMAIL",
      purpose: "REQUIREMENT_REQUEST",
      subject: "Pending items for {{project_name}}",
      body: `Hi {{contact_name}},

To keep {{project_name}} moving smoothly, we need confirmation on the following items:
{{pending_requirements}}

Please let us know once these can be shared or if you would like a quick sync to review them together.

Best regards,
Project Delivery Team`
    },
    {
      id: "tmpl-project-update-email",
      name: "Project Status Update (Email)",
      channel: "EMAIL",
      purpose: "PROJECT_UPDATE",
      subject: "Update: {{project_name}} ({{project_status}})",
      body: `Hi {{contact_name}},

Here is a quick status update on {{project_name}}:
- Status: {{project_status}}
- Progress: {{progress_percentage}}%
- Active Milestone: {{current_milestone}}

Next action: {{next_action}}

Please feel free to reach out if you have any questions or feedback.

Best regards,
Project Delivery Team`
    },
    {
      id: "tmpl-milestone-update-email",
      name: "Milestone Completed (Email)",
      channel: "EMAIL",
      purpose: "MILESTONE_UPDATE",
      subject: "Milestone Completed: {{milestone_name}} ({{project_name}})",
      body: `Hi {{contact_name}},

We are pleased to inform you that we have completed milestone "{{milestone_name}}" for {{project_name}}.

We are now advancing into the next delivery phase.

Best regards,
Project Delivery Team`
    },
    {
      id: "tmpl-client-review-email",
      name: "Client Review Request (Email)",
      channel: "EMAIL",
      purpose: "CLIENT_REVIEW",
      subject: "Review ready: {{project_name}}",
      body: `Hi {{contact_name}},

{{project_name}} has reached the review stage and is ready for your evaluation.

Please test the deliverables when convenient and share any comments or required revisions.

Best regards,
Project Delivery Team`
    },
    {
      id: "tmpl-project-completed-email",
      name: "Project Completion (Email)",
      channel: "EMAIL",
      purpose: "PROJECT_COMPLETED",
      subject: "Project Completed: {{project_name}}",
      body: `Dear {{contact_name}},

We are delighted to share that {{project_name}} has been completed.

Thank you for your partnership throughout the delivery. Please let us know if there is anything else you need.

Best regards,
Client Success Team`
    },
    {
      id: "tmpl-general-whatsapp",
      name: "General Update (WhatsApp)",
      channel: "WHATSAPP",
      purpose: "GENERAL",
      subject: null,
      body: `Hi {{contact_name}}, quick note regarding {{company}}: {{custom_message}}. Let me know if you have any questions!`
    }
  ];
}

function ensureCommunicationStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeFileSync(MESSAGES_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(TEMPLATES_FILE)) {
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(getDefaultTemplates(), null, 2), "utf8");
  }
}

function loadJson(filePath, defaultVal = []) {
  ensureCommunicationStoreExists();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultVal;
  } catch {
    return defaultVal;
  }
}

function saveJson(filePath, data) {
  ensureCommunicationStoreExists();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/* ========================================================================= */
/* TEMPLATES                                                                 */
/* ========================================================================= */

function loadTemplates() {
  const templates = loadJson(TEMPLATES_FILE, []);
  if (templates.length === 0) {
    const defaults = getDefaultTemplates();
    saveTemplates(defaults);
    return defaults;
  }
  return templates;
}

function saveTemplates(templates) {
  saveJson(TEMPLATES_FILE, templates);
}

function getTemplates(filter = {}) {
  const templates = loadTemplates();
  return templates.filter(t => {
    if (filter.channel && t.channel !== filter.channel.toUpperCase().trim()) return false;
    if (filter.purpose && t.purpose !== filter.purpose.toUpperCase().trim()) return false;
    return true;
  });
}

function getTemplate(idOrPurpose, channel = null) {
  const templates = loadTemplates();
  if (!idOrPurpose) return null;
  const q = String(idOrPurpose).trim().toLowerCase();

  // 1. Direct ID match
  const byId = templates.find(t => t.id.toLowerCase() === q);
  if (byId) return byId;

  // 2. Purpose & optional channel match
  const byPurpose = templates.find(t => {
    const matchPurpose = t.purpose.toLowerCase() === q || t.purpose.replace(/_/g, " ").toLowerCase() === q;
    if (!matchPurpose) return false;
    if (channel) {
      return t.channel.toLowerCase() === channel.toLowerCase().trim();
    }
    return true;
  });

  return byPurpose || null;
}

/**
 * Renders template content safely.
 * Strict Grounding Rule: Never fabricates names, dates, or metrics.
 * Missing context falls back safely to [NOT PROVIDED] or clean defaults.
 */
function renderTemplate(templateOrIdOrPurpose, context = {}, channel = null) {
  let template = null;
  if (typeof templateOrIdOrPurpose === "object" && templateOrIdOrPurpose !== null) {
    template = templateOrIdOrPurpose;
  } else {
    template = getTemplate(templateOrIdOrPurpose, channel);
  }

  if (!template) {
    throw new Error(`Template not found for identifier or purpose: "${templateOrIdOrPurpose}"`);
  }

  const safeCompany = context.company || context.companyName || "[COMPANY NOT PROVIDED]";
  const rawContact = context.contactName;
  const safeContact = (rawContact && rawContact !== "RESEARCH REQUIRED" && rawContact !== "Unknown Business")
    ? String(rawContact).trim()
    : "[NAME NOT PROVIDED]";
  const safeIndustry = context.industry || "[INDUSTRY NOT PROVIDED]";
  const safeNeed = context.potentialNeed || context.service || "[NEED NOT SPECIFIED]";
  const safeService = context.service || context.potentialNeed || "[SERVICE NOT SPECIFIED]";
  const safeProjectName = context.projectName || "[PROJECT NOT SPECIFIED]";
  const safeProjectStatus = context.projectStatus || "IN_PROGRESS";
  const safeProgress = typeof context.progress === "number" ? context.progress : 0;
  const safeMilestone = context.currentMilestone || context.milestoneName || "Initial Phase";
  const safeMilestoneName = context.milestoneName || context.currentMilestone || "Initial Phase";
  const safeNextAction = context.nextAction || "Awaiting review";
  const safePendingReqs = context.pendingRequirements && String(context.pendingRequirements).trim().length > 0
    ? String(context.pendingRequirements).trim()
    : "- None pending";
  const safeCustomMessage = context.customMessage || "[MESSAGE NOT PROVIDED]";

  const replacements = {
    "{{company}}": safeCompany,
    "{{contact_name}}": safeContact,
    "{{industry}}": safeIndustry,
    "{{potential_need}}": safeNeed,
    "{{service}}": safeService,
    "{{project_name}}": safeProjectName,
    "{{project_status}}": safeProjectStatus,
    "{{progress_percentage}}": String(safeProgress),
    "{{current_milestone}}": safeMilestone,
    "{{milestone_name}}": safeMilestoneName,
    "{{next_action}}": safeNextAction,
    "{{pending_requirements}}": safePendingReqs,
    "{{custom_message}}": safeCustomMessage
  };

  let renderedSubject = template.subject ? String(template.subject) : null;
  if (renderedSubject) {
    for (const [key, val] of Object.entries(replacements)) {
      renderedSubject = renderedSubject.split(key).join(val);
    }
  }

  let renderedBody = template.body ? String(template.body) : "";
  for (const [key, val] of Object.entries(replacements)) {
    renderedBody = renderedBody.split(key).join(val);
  }

  return {
    templateId: template.id,
    templateName: template.name,
    channel: template.channel,
    purpose: template.purpose,
    subject: renderedSubject,
    body: renderedBody
  };
}

/* ========================================================================= */
/* MESSAGES                                                                  */
/* ========================================================================= */

function loadMessages() {
  return loadJson(MESSAGES_FILE, []);
}

function saveMessages(messages) {
  saveJson(MESSAGES_FILE, messages);
}

function createMessageRecord(data = {}) {
  const channelCandidate = String(data.channel || "EMAIL").toUpperCase().trim();
  const channel = CHANNELS.includes(channelCandidate) ? channelCandidate : "EMAIL";

  const directionCandidate = String(data.direction || "OUTBOUND").toUpperCase().trim();
  const direction = DIRECTIONS.includes(directionCandidate) ? directionCandidate : "OUTBOUND";

  const statusCandidate = String(data.status || "READY_FOR_REVIEW").toUpperCase().trim();
  const status = MESSAGE_STATUSES.includes(statusCandidate) ? statusCandidate : "READY_FOR_REVIEW";

  const purposeCandidate = String(data.purpose || "GENERAL").toUpperCase().trim();
  const purpose = MESSAGE_PURPOSES.includes(purposeCandidate) ? purposeCandidate : "GENERAL";

  const sourceCandidate = String(data.source || "AI-GENERATED").toUpperCase().trim();
  const source = ["USER-PROVIDED", "VERIFIED", "AI-GENERATED"].includes(sourceCandidate) ? sourceCandidate : "AI-GENERATED";

  let body = String(data.body || "").trim();
  // Ensure every AI-generated draft is explicitly tagged with the required safety header
  const DRAFT_HEADER = "[AI DRAFT — USER REVIEW REQUIRED]";
  if ((source === "AI-GENERATED" || status === "DRAFT" || status === "READY_FOR_REVIEW") && !body.startsWith(DRAFT_HEADER)) {
    body = `${DRAFT_HEADER}\n\n${body}`;
  }

  const now = new Date().toISOString();
  const id = data.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const recipient = data.recipient || (data.recipientAddress && data.recipientAddress !== "[NOT PROVIDED]" ? data.recipientAddress : null);
  const conversationId = data.conversationId || (data.leadId ? `conv-lead-${data.leadId}` : (data.clientId ? `conv-client-${data.clientId}` : `conv-${id}`));

  return {
    id,
    leadId: data.leadId || null,
    clientId: data.clientId || null,
    projectId: data.projectId || null,
    recipientName: data.recipientName ? String(data.recipientName).trim() : "[NAME NOT PROVIDED]",
    recipientAddress: data.recipientAddress ? String(data.recipientAddress).trim() : "[NOT PROVIDED]",
    recipient,
    channel,
    provider: String(data.provider || "local").toLowerCase().trim(),
    direction,
    status,
    purpose,
    source,
    subject: channel === "WHATSAPP" ? null : (data.subject !== undefined ? data.subject : null),
    body,
    templateId: data.templateId || null,
    providerMessageId: data.providerMessageId || null,
    conversationId,
    errorCode: data.errorCode || null,
    errorMessage: data.errorMessage || null,
    metadata: typeof data.metadata === "object" && data.metadata !== null ? { ...data.metadata } : {},
    inboundReplies: Array.isArray(data.inboundReplies) ? data.inboundReplies : [],
    approvedAt: data.approvedAt || null,
    copiedAt: data.copiedAt || null,
    sendRequestedAt: data.sendRequestedAt || null,
    sentAt: data.sentAt || null,
    deliveredAt: data.deliveredAt || null,
    readAt: data.readAt || null,
    repliedAt: data.repliedAt || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

function createMessage(messageData = {}) {
  const messages = loadMessages();
  const candidate = createMessageRecord(messageData);

  messages.push(candidate);
  saveMessages(messages);

  if (isSyncEnabled()) {
    communicationRepository.createMessage(candidate).catch(err => {
      console.warn("[CommunicationStore PG Sync Warning]", err.message);
    });
  }

  return { success: true, message: candidate };
}

function getMessage(id) {
  const messages = loadMessages();
  return messages.find(m => m.id === id) || null;
}

function getMessageByProviderId(providerMessageId) {
  if (!providerMessageId) return null;
  const messages = loadMessages();
  return messages.find(m => m.providerMessageId === providerMessageId) || null;
}

function getMessagesByConversationId(conversationId) {
  if (!conversationId) return [];
  const messages = loadMessages();
  return messages.filter(m => m.conversationId === conversationId);
}

function getMessages(filter = {}) {
  const messages = loadMessages();
  return messages.filter(m => {
    if (filter.leadId && m.leadId !== filter.leadId) return false;
    if (filter.clientId && m.clientId !== filter.clientId) return false;
    if (filter.projectId && m.projectId !== filter.projectId) return false;
    if (filter.channel && m.channel !== filter.channel.toUpperCase().trim()) return false;
    if (filter.provider && m.provider !== filter.provider.toLowerCase().trim()) return false;
    if (filter.status && m.status !== filter.status.toUpperCase().trim()) return false;
    if (filter.purpose && m.purpose !== filter.purpose.toUpperCase().trim()) return false;
    if (filter.conversationId && m.conversationId !== filter.conversationId) return false;
    return true;
  });
}

function updateMessage(id, updates = {}) {
  const messages = loadMessages();
  const idx = messages.findIndex(m => m.id === id);
  if (idx === -1) return null;

  const current = messages[idx];

  // Safety check: Prevent marking as SENT directly without going through the gateway
  if (!updates.fromGateway && updates.status && updates.status.toUpperCase().trim() === "SENT") {
    throw new Error("Direct sending is disabled in local-first ₹0 mode. Messages are for preparation and review only; mark as APPROVED or COPIED.");
  }

  const updated = {
    ...current,
    ...updates,
    id: current.id,
    leadId: current.leadId,
    clientId: current.clientId,
    projectId: current.projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (updates.status) {
    const s = String(updates.status).toUpperCase().trim();
    if (MESSAGE_STATUSES.includes(s)) {
      updated.status = s;
      const now = new Date().toISOString();
      if (s === "APPROVED" && !updated.approvedAt) {
        updated.approvedAt = now;
      }
      if (s === "COPIED" && !updated.copiedAt) {
        updated.copiedAt = now;
      }
      if (s === "SEND_REQUESTED" && !updated.sendRequestedAt) {
        updated.sendRequestedAt = now;
      }
      if (s === "SENT" && !updated.sentAt) {
        updated.sentAt = now;
      }
      if (s === "DELIVERED" && !updated.deliveredAt) {
        updated.deliveredAt = now;
      }
      if (s === "READ" && !updated.readAt) {
        updated.readAt = now;
      }
      if (s === "REPLIED" && !updated.repliedAt) {
        updated.repliedAt = now;
      }
    }
  }

  delete updated.fromGateway;

  messages[idx] = updated;
  saveMessages(messages);

  if (isSyncEnabled()) {
    communicationRepository.updateMessage(id, updated).catch(err => {
      console.warn("[CommunicationStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

function recordInboundReply(originalMessageId, replyData = {}) {
  const original = getMessage(originalMessageId);
  if (!original) {
    throw new Error(`Original message not found for ID "${originalMessageId}".`);
  }

  const replyEntry = {
    id: `reply-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    text: String(replyData.text || replyData.body || "").trim(),
    sender: replyData.sender || original.recipientAddress || original.recipientName,
    channel: original.channel,
    timestamp: replyData.timestamp || new Date().toISOString()
  };

  const updatedReplies = [...(original.inboundReplies || []), replyEntry];
  return updateMessage(original.id, {
    fromGateway: true,
    status: "REPLIED",
    repliedAt: replyEntry.timestamp,
    inboundReplies: updatedReplies
  });
}

function deleteMessage(id) {
  const messages = loadMessages();
  const filtered = messages.filter(m => m.id !== id);
  if (filtered.length === messages.length) return false;
  saveMessages(filtered);
  return true;
}

function markMessageApproved(id) {
  return updateMessage(id, { status: "APPROVED" });
}

function markMessageCopied(id) {
  return updateMessage(id, { status: "COPIED" });
}

/* ========================================================================= */
/* DRAFT PREPARATION ENGINE (GROUNDED IN REAL DATA ONLY)                     */
/* ========================================================================= */

/**
 * Prepares an outreach/followup message draft for an existing Lead.
 * Grounding Rule: Uses only data present in the lead & CRM records.
 * Automatically logs OUTREACH_PREPARED CRM activity.
 */
function prepareDraftForLead(leadIdOrQuery, purpose = "INITIAL_OUTREACH", channel = "EMAIL", options = {}) {
  if (!leadIdOrQuery) {
    return { success: false, error: "Lead ID or query must be provided." };
  }

  // Find lead by exact ID or search
  let lead = leadStore.getLead(leadIdOrQuery);
  if (!lead) {
    let results = leadStore.searchLeads(leadIdOrQuery);
    if (results.length === 0) {
      const norm = String(leadIdOrQuery).replace(/['’"]/g, "").toLowerCase().trim();
      const allLeads = leadStore.loadLeads();
      results = allLeads.filter(l =>
        (l.companyName && l.companyName.replace(/['’"]/g, "").toLowerCase().includes(norm)) ||
        (l.id && l.id.toLowerCase() === norm)
      );
    }
    if (results.length > 0) {
      lead = results[0];
    }
  }

  if (!lead) {
    return { success: false, error: `Lead not found for query "${leadIdOrQuery}".` };
  }

  const contacts = crmStore.getLeadContacts(lead.id);
  const primaryContact = contacts[0] || null;

  const rawContactName = primaryContact?.name || (lead.contactName !== "RESEARCH REQUIRED" ? lead.contactName : null);
  const contactName = rawContactName || "[NAME NOT PROVIDED]";

  const address = channel.toUpperCase() === "WHATSAPP"
    ? (primaryContact?.phone || lead.phone || "[PHONE NOT PROVIDED]")
    : (primaryContact?.email || lead.email || "[EMAIL NOT PROVIDED]");

  // Context assembly
  const context = {
    company: lead.companyName,
    companyName: lead.companyName,
    contactName,
    industry: lead.industry,
    potentialNeed: lead.potentialNeed || lead.fitReason || "Commercial Solutions",
    service: lead.potentialNeed || "Commercial Solutions",
    customMessage: options.customMessage || lead.fitReason || "",
    ...options.context
  };

  const rendered = renderTemplate(options.templateId || purpose, context, channel);

  const res = createMessage({
    leadId: lead.id,
    clientId: null,
    projectId: null,
    recipientName: contactName !== "[NAME NOT PROVIDED]" ? contactName : lead.companyName,
    recipientAddress: address,
    channel: rendered.channel,
    direction: "OUTBOUND",
    status: "READY_FOR_REVIEW",
    purpose: rendered.purpose,
    source: lead.evidence && lead.evidence.includes("VERIFIED") ? "VERIFIED" : "AI-GENERATED",
    subject: rendered.subject,
    body: rendered.body,
    templateId: rendered.templateId,
    metadata: {
      leadCompany: lead.companyName,
      qualificationStatus: lead.qualificationStatus || "UNRATED",
      pipelineStatus: lead.pipelineStatus || "NOT_CONTACTED"
    }
  });

  // Log CRM Activity
  try {
    crmStore.addActivity({
      leadId: lead.id,
      type: "OUTREACH_PREPARED",
      description: `Prepared ${rendered.channel} draft (${rendered.purpose}) for ${lead.companyName}`,
      metadata: {
        messageId: res.message.id,
        channel: rendered.channel,
        purpose: rendered.purpose
      }
    });
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    message: res.message,
    lead
  };
}

/**
 * Prepares a communication draft for an active Client.
 */
function prepareDraftForClient(clientIdOrQuery, purpose = "CLIENT_WELCOME", channel = "EMAIL", options = {}) {
  if (!clientIdOrQuery) {
    return { success: false, error: "Client ID or query must be provided." };
  }

  const client = serviceDeliveryStore.findClient(clientIdOrQuery);
  if (!client) {
    return { success: false, error: `Client not found for query "${clientIdOrQuery}".` };
  }

  const contacts = client.leadId ? crmStore.getLeadContacts(client.leadId) : [];
  const primaryContact = contacts[0] || null;
  const rawContactName = primaryContact?.name || null;
  const contactName = rawContactName || "[NAME NOT PROVIDED]";

  const address = channel.toUpperCase() === "WHATSAPP"
    ? (primaryContact?.phone || "[PHONE NOT PROVIDED]")
    : (primaryContact?.email || "[EMAIL NOT PROVIDED]");

  const project = serviceDeliveryStore.getProjectByClientId(client.id);

  const context = {
    company: client.companyName,
    companyName: client.companyName,
    contactName,
    service: client.service || "Standard Business Solution",
    projectName: project ? project.projectName : `${client.companyName} Project`,
    projectStatus: project ? project.status : "PLANNED",
    progress: project ? project.progress : 0,
    customMessage: options.customMessage || "",
    ...options.context
  };

  const rendered = renderTemplate(options.templateId || purpose, context, channel);

  const res = createMessage({
    leadId: client.leadId || null,
    clientId: client.id,
    projectId: project ? project.id : null,
    recipientName: contactName !== "[NAME NOT PROVIDED]" ? contactName : client.companyName,
    recipientAddress: address,
    channel: rendered.channel,
    direction: "OUTBOUND",
    status: "READY_FOR_REVIEW",
    purpose: rendered.purpose,
    source: "AI-GENERATED",
    subject: rendered.subject,
    body: rendered.body,
    templateId: rendered.templateId,
    metadata: {
      clientCompany: client.companyName,
      clientStatus: client.status,
      service: client.service
    }
  });

  if (client.leadId) {
    try {
      crmStore.addActivity({
        leadId: client.leadId,
        type: "OUTREACH_PREPARED",
        description: `Prepared ${rendered.channel} draft (${rendered.purpose}) for client ${client.companyName}`,
        metadata: {
          messageId: res.message.id,
          channel: rendered.channel,
          purpose: rendered.purpose,
          clientId: client.id
        }
      });
    } catch {
      // Non-blocking
    }
  }

  return {
    success: true,
    message: res.message,
    client,
    project
  };
}

/**
 * Prepares a communication draft for a Project (e.g. status updates, milestone completion, client review).
 */
function prepareDraftForProject(projectId, purpose = "PROJECT_UPDATE", channel = "EMAIL", options = {}) {
  if (!projectId) {
    return { success: false, error: "Project ID must be provided." };
  }

  const project = serviceDeliveryStore.getProject(projectId);
  if (!project) {
    return { success: false, error: `Project not found for ID "${projectId}".` };
  }

  const client = crmStore.getClient(project.clientId);
  const contacts = project.leadId ? crmStore.getLeadContacts(project.leadId) : [];
  const primaryContact = contacts[0] || null;
  const rawContactName = primaryContact?.name || null;
  const contactName = rawContactName || "[NAME NOT PROVIDED]";

  const address = channel.toUpperCase() === "WHATSAPP"
    ? (primaryContact?.phone || "[PHONE NOT PROVIDED]")
    : (primaryContact?.email || "[EMAIL NOT PROVIDED]");

  const milestones = serviceDeliveryStore.getMilestones(project.id);
  const activeMilestone = milestones.find(m => m.status === "IN_PROGRESS") || milestones[0] || null;

  const reqs = serviceDeliveryStore.getRequirements({ projectId: project.id, status: "PENDING" });
  const pendingReqText = reqs.length > 0
    ? reqs.map(r => `- ${r.title}`).join("\n")
    : "- None pending";

  const context = {
    company: client ? client.companyName : "Client",
    companyName: client ? client.companyName : "Client",
    contactName,
    projectName: project.projectName,
    projectStatus: project.status,
    progress: project.progress,
    currentMilestone: activeMilestone ? activeMilestone.name : "None",
    milestoneName: options.milestoneName || (activeMilestone ? activeMilestone.name : "Core Phase"),
    pendingRequirements: pendingReqText,
    nextAction: options.nextAction || (activeMilestone ? `Complete ${activeMilestone.name}` : "Proceed with scheduled deliverables"),
    service: project.serviceType,
    customMessage: options.customMessage || "",
    ...options.context
  };

  const rendered = renderTemplate(options.templateId || purpose, context, channel);

  const res = createMessage({
    leadId: project.leadId || null,
    clientId: project.clientId,
    projectId: project.id,
    recipientName: contactName !== "[NAME NOT PROVIDED]" ? contactName : (client ? client.companyName : "Client"),
    recipientAddress: address,
    channel: rendered.channel,
    direction: "OUTBOUND",
    status: "READY_FOR_REVIEW",
    purpose: rendered.purpose,
    source: "AI-GENERATED",
    subject: rendered.subject,
    body: rendered.body,
    templateId: rendered.templateId,
    metadata: {
      projectId: project.id,
      projectName: project.projectName,
      projectStatus: project.status
    }
  });

  if (project.leadId) {
    try {
      crmStore.addActivity({
        leadId: project.leadId,
        type: "OUTREACH_PREPARED",
        description: `Prepared ${rendered.channel} draft (${rendered.purpose}) for project "${project.projectName}"`,
        metadata: {
          messageId: res.message.id,
          channel: rendered.channel,
          purpose: rendered.purpose,
          projectId: project.id
        }
      });
    } catch {
      // Non-blocking
    }
  }

  return {
    success: true,
    message: res.message,
    project,
    client
  };
}

function getCommunicationOverview() {
  const messages = loadMessages();
  const templates = loadTemplates();

  const byStatus = {
    DRAFT: 0,
    READY_FOR_REVIEW: 0,
    APPROVED: 0,
    SEND_REQUESTED: 0,
    SENT: 0,
    DELIVERED: 0,
    READ: 0,
    FAILED: 0,
    REPLIED: 0,
    COPIED: 0,
    CANCELLED: 0
  };

  const byChannel = {
    EMAIL: 0,
    WHATSAPP: 0,
    SMS: 0
  };

  const byPurpose = {};

  for (const m of messages) {
    if (byStatus[m.status] !== undefined) byStatus[m.status]++;
    if (byChannel[m.channel] !== undefined) byChannel[m.channel]++;
    byPurpose[m.purpose] = (byPurpose[m.purpose] || 0) + 1;
  }

  return {
    totalMessages: messages.length,
    totalTemplates: templates.length,
    byStatus,
    byChannel,
    byPurpose,
    recentMessages: messages.slice(-10).reverse()
  };
}

function clearCommunicationStore() {
  saveMessages([]);
  saveTemplates(getDefaultTemplates());

  if (isSyncEnabled()) {
    communicationRepository.clearMessages().catch(() => {});
  }
}

module.exports = {
  // Constants
  CHANNELS,
  DIRECTIONS,
  MESSAGE_STATUSES,
  MESSAGE_PURPOSES,
  MESSAGES_FILE,
  TEMPLATES_FILE,

  // Templates
  getDefaultTemplates,
  loadTemplates,
  saveTemplates,
  getTemplates,
  getTemplate,
  renderTemplate,

  // Messages CRUD
  createMessageRecord,
  createMessage,
  getMessage,
  getMessageByProviderId,
  getMessagesByConversationId,
  getMessages,
  updateMessage,
  recordInboundReply,
  deleteMessage,
  markMessageApproved,
  approveMessage: markMessageApproved,
  markMessageCopied,
  copyMessage: markMessageCopied,

  // Grounded Draft Preparation Engines
  prepareDraftForLead,
  prepareDraftForClient,
  prepareDraftForProject,

  // Overview & Maintenance
  getCommunicationOverview,
  clearCommunicationStore,
  repository: communicationRepository
};
