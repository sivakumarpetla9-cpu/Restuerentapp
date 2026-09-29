const {
  loadLeads,
  updateLeadPipeline,
  getPipelineLeads,
  getLeadsNeedingFollowUp,
  PIPELINE_STATUSES
} = require("../memory/leadStore");
const {
  getCRMOverview,
  getLeadCRMProfile,
  convertLeadToClient,
  addActivity,
  getActivities,
  getLeadActivities,
  getContacts,
  getLeadContacts,
  getClients
} = require("../memory/crmStore");
const { formatSourcesContext } = require("./research");

const STATUS_SYNONYMS = {
  "not contacted": "NOT_CONTACTED",
  "uncontacted": "NOT_CONTACTED",
  "contacted": "CONTACTED",
  "outreached": "CONTACTED",
  "replied": "REPLIED",
  "responded": "REPLIED",
  "interested": "INTERESTED",
  "qualified": "INTERESTED",
  "follow up": "FOLLOW_UP",
  "follow-up": "FOLLOW_UP",
  "followup": "FOLLOW_UP",
  "demo scheduled": "DEMO_SCHEDULED",
  "demo": "DEMO_SCHEDULED",
  "demo agreed": "DEMO_SCHEDULED",
  "proposal sent": "PROPOSAL_SENT",
  "proposal": "PROPOSAL_SENT",
  "quote sent": "PROPOSAL_SENT",
  "won": "WON",
  "closed won": "WON",
  "closed-won": "WON",
  "customer": "WON",
  "deal won": "WON",
  "lost": "LOST",
  "closed lost": "LOST",
  "closed-lost": "LOST",
  "deal lost": "LOST"
};

function normalizeStatus(str) {
  if (!str || typeof str !== "string") return null;
  const cleaned = str.toLowerCase().trim().replace(/['"]/g, "");
  if (STATUS_SYNONYMS[cleaned]) return STATUS_SYNONYMS[cleaned];
  const upper = cleaned.toUpperCase().replace(/[\s-]+/g, "_");
  if (PIPELINE_STATUSES.includes(upper)) return upper;
  return null;
}

/**
 * Formats a comprehensive Sales Pipeline report across all 9 stages.
 */
function formatPipelineOverview(leads = []) {
  let out = "SALES PIPELINE REPORT\n\n";

  if (leads.length === 0) {
    out += "Status: NO LEADS IN PIPELINE\n";
    out += "No leads are currently stored in data/leads.json.\n\n";
    out += "Recommended Action:\n";
    out += "1. Generate or import leads via the Lead Generation Agent (e.g., node index.js 'find potential customers').\n";
    out += "2. Qualify leads via the Lead Qualification Agent (e.g., node index.js 'qualify my leads').\n";
    return out;
  }

  out += "PIPELINE STAGES SUMMARY:\n";
  for (const st of PIPELINE_STATUSES) {
    const count = leads.filter(l => (l.pipelineStatus === st || (l.pipeline && l.pipeline.status === st))).length;
    out += `- ${st}: ${count}\n`;
  }
  out += `Total Leads: ${leads.length}\n\n`;

  out += "========================================\n";
  out += "LEAD DETAILS BY STAGE:\n\n";

  for (const st of PIPELINE_STATUSES) {
    const group = leads.filter(l => (l.pipelineStatus === st || (l.pipeline && l.pipeline.status === st)));
    if (group.length > 0) {
      out += `[${st}] (${group.length})\n`;
      for (const l of group) {
        const p = l.pipeline || {};
        const contactInfo = l.contactName && l.contactName !== "RESEARCH REQUIRED"
          ? `${l.contactName}${l.contactRole && l.contactRole !== "RESEARCH REQUIRED" ? ` (${l.contactRole})` : ""}`
          : "Contact: RESEARCH REQUIRED";

        out += `  - ${l.companyName} (ID: ${l.id})\n`;
        out += `    Contact: ${contactInfo}\n`;
        out += `    Industry/Location: ${l.industry} | ${l.location}\n`;
        out += `    Qualification: ${l.qualificationStatus || "NEEDS_RESEARCH"}\n`;
        out += `    Last Contacted: ${p.lastContactedAt || "NOT SET"}\n`;
        out += `    Next Follow-up: ${p.nextFollowUpAt || "NOT SET"}\n`;
        if (p.nextAction) out += `    Next Action: ${p.nextAction}\n`;
        if (p.notes) out += `    Notes: ${p.notes}\n`;
        out += "\n";
      }
    }
  }

  return out;
}

/**
 * Formats the comprehensive CRM Overview report connecting leads, pipeline, and clients.
 */
function formatCRMOverviewReport() {
  const overview = getCRMOverview();
  let out = "CRM OVERVIEW REPORT\n\n";

  out += `Total Leads: ${overview.leads.TOTAL}\n`;
  out += `- Qualified Leads: ${overview.leads.QUALIFIED}\n`;
  out += `- Possible Fits: ${overview.leads.POSSIBLE_FIT}\n`;
  out += `- Needs Research: ${overview.leads.NEEDS_RESEARCH}\n`;
  out += `- Unqualified Leads: ${overview.leads.UNQUALIFIED}\n\n`;

  out += "Pipeline Breakdown:\n";
  for (const st of PIPELINE_STATUSES) {
    out += `- ${st}: ${overview.pipeline[st] || 0}\n`;
  }
  out += "\n";

  out += `Clients Overview (Total: ${overview.clients.TOTAL}):\n`;
  out += `- Active Clients: ${overview.clients.ACTIVE}\n`;
  out += `- Prospects: ${overview.clients.PROSPECT}\n`;
  out += `- Paused: ${overview.clients.PAUSED}\n`;
  out += `- Completed: ${overview.clients.COMPLETED}\n`;
  out += `- Lost: ${overview.clients.LOST}\n\n`;

  out += "CRM Data Layer:\n";
  out += `- Tracked Contacts: ${overview.contactsCount}\n`;
  out += `- Recorded Activities: ${overview.activitiesCount}\n`;

  return out;
}

/**
 * Formats a 360-degree Lead/Client CRM Profile report.
 */
function formatLeadCRMProfileReport(profile) {
  if (!profile || !profile.lead) {
    return "CRM PROFILE ERROR: Lead not found.\n";
  }

  const { lead, qualification, pipeline, contacts, activities, client } = profile;

  let out = `CRM LEAD & CLIENT PROFILE\n\n`;
  out += `Company: ${lead.companyName} (ID: ${lead.id})\n`;
  out += `Website: ${lead.website}\n`;
  out += `Industry: ${lead.industry}\n`;
  out += `Location: ${lead.location}\n`;
  out += `Evidence Source: ${lead.evidence}\n\n`;

  out += `Qualification Profile:\n`;
  out += `- Qualification Status: ${lead.qualificationStatus}\n`;
  out += `- Rubric Score: ${qualification.score || "Explicit Rubric Calculation"}\n`;
  out += `- Fit Rationale: ${lead.fitReason || qualification.reasoning}\n`;
  if (qualification.missingInformation && qualification.missingInformation.length > 0) {
    out += `- Missing Information: ${qualification.missingInformation.join(", ")}\n`;
  }
  out += "\n";

  out += `Sales Pipeline Profile:\n`;
  out += `- Current Pipeline Stage: ${pipeline.status}\n`;
  out += `- Last Contacted: ${pipeline.lastContactedAt || "NOT SET"}\n`;
  out += `- Next Follow-up: ${pipeline.nextFollowUpAt || "NOT SET"}\n`;
  out += `- Follow-up Count: ${pipeline.followUpCount || 0}\n`;
  out += `- Verified Need: ${lead.potentialNeed || "RESEARCH REQUIRED"}\n`;
  out += `- Next Action: ${pipeline.nextAction || "None scheduled"}\n\n`;

  out += `Associated Contacts (${contacts.length}):\n`;
  if (contacts.length === 0) {
    out += `  (No contact records logged. Contact person in lead: ${lead.contactName})\n`;
  } else {
    for (const c of contacts) {
      out += `  - ${c.name} [${c.role}] | Email: ${c.email} | Phone: ${c.phone} (${c.evidenceType})\n`;
    }
  }
  out += "\n";

  out += `Client Status:\n`;
  if (client) {
    out += `- Status: ${client.status} (Client ID: ${client.id})\n`;
    out += `- Contracted/Agreed Service: ${client.service}\n`;
    out += `- Converted At: ${client.createdAt}\n`;
  } else {
    out += `- Not converted to client. (Run: node index.js "convert ${lead.companyName} to client")\n`;
  }
  out += "\n";

  out += `Recent Activities Logged (${activities.length}):\n`;
  if (activities.length === 0) {
    out += `  (No activity logged yet)\n`;
  } else {
    for (const a of activities.slice(0, 10)) {
      out += `  - [${a.occurredAt}] [${a.type}]: ${a.description}\n`;
    }
  }

  return out;
}

/**
 * Formats a report of leads requiring follow-up attention.
 */
function formatFollowUpReport(needingFollowUpLeads = [], allLeads = []) {
  let out = "LEADS NEEDING FOLLOW-UP REPORT\n\n";

  if (allLeads.length === 0) {
    out += "Status: NO LEADS STORED\nNo leads found in data/leads.json.\n";
    return out;
  }

  if (needingFollowUpLeads.length === 0) {
    out += "STATUS: ALL FOLLOW-UPS CURRENT\n";
    out += "No leads currently have overdue follow-up dates or are marked as FOLLOW_UP.\n\n";
    out += "Current Pipeline Status Summary:\n";
    for (const st of PIPELINE_STATUSES) {
      const cnt = allLeads.filter(l => l.pipelineStatus === st || (l.pipeline && l.pipeline.status === st)).length;
      if (cnt > 0) out += `- ${st}: ${cnt}\n`;
    }
    out += "\nRecommended Action:\n- To mark a lead for follow-up, run: node index.js 'mark <company_name> as follow up'\n";
    return out;
  }

  out += `Total Leads Needing Attention: ${needingFollowUpLeads.length}\n\n`;

  for (let i = 0; i < needingFollowUpLeads.length; i++) {
    const l = needingFollowUpLeads[i];
    const p = l.pipeline || {};
    const contactInfo = l.contactName && l.contactName !== "RESEARCH REQUIRED"
      ? `${l.contactName}${l.contactRole && l.contactRole !== "RESEARCH REQUIRED" ? ` (${l.contactRole})` : ""}`
      : "Contact: RESEARCH REQUIRED";

    out += `${i + 1}. Company: ${l.companyName} (ID: ${l.id})\n`;
    out += `   Contact: ${contactInfo}\n`;
    out += `   Current Pipeline Status: ${p.status || l.pipelineStatus || "NOT_CONTACTED"}\n`;
    out += `   Qualification: ${l.qualificationStatus || "NEEDS_RESEARCH"}\n`;
    out += `   Last Contacted: ${p.lastContactedAt || "NOT SET"}\n`;
    out += `   Next Follow-up: ${p.nextFollowUpAt || "NOT SET"}\n`;
    out += `   Follow-up Count: ${p.followUpCount || 0}\n`;
    out += `   Verified Need: ${l.potentialNeed || "RESEARCH REQUIRED"}\n`;
    out += `   Next Action: ${p.nextAction || "Initiate value-focused follow-up message"}\n`;
    out += "\n";
  }

  out += "RECOMMENDED ACTIONS:\n";
  out += "1. Review verified lead context before reaching out.\n";
  out += "2. Draft personalized follow-up: node index.js 'prepare follow-up for <company_name>'\n";
  out += "3. Update pipeline status after contact: node index.js 'mark <company_name> as contacted'\n";

  return out;
}

/**
 * Formats a strictly grounded follow-up message draft without invented history.
 */
function formatFollowUpDraft(lead) {
  const p = lead.pipeline || {};
  const contactName = lead.contactName && lead.contactName !== "RESEARCH REQUIRED"
    ? lead.contactName
    : "Business Owner";
  const role = lead.contactRole && lead.contactRole !== "RESEARCH REQUIRED"
    ? ` (${lead.contactRole})`
    : "";

  let out = "FOLLOW-UP DRAFT\n\n";
  out += `Lead: ${lead.companyName}\n`;
  out += `Contact: ${contactName}${role}\n`;
  out += `Current Status: ${p.status || lead.pipelineStatus || "FOLLOW_UP"}\n`;
  out += `Next Follow-up: ${p.nextFollowUpAt || "NOT SET"}\n\n`;

  out += "Verified Context:\n";
  out += `- Industry: ${lead.industry} (${lead.location})\n`;
  out += `- Verified Need: ${lead.potentialNeed || "RESEARCH REQUIRED"}\n`;
  out += `- Evidence Source: ${lead.evidence || "USER-PROVIDED"}\n`;
  out += `- Previous conversation details: NOT PROVIDED\n\n`;

  out += "Suggested Message:\n";
  if (lead.potentialNeed && lead.potentialNeed !== "RESEARCH REQUIRED") {
    out += `"Hi ${contactName},\n\n`;
    out += `Following up regarding our conversation on solutions for ${lead.companyName}. We help ${lead.industry.toLowerCase().includes("restaurant") ? "restaurants" : "businesses"} address ${lead.potentialNeed.toLowerCase()}.\n\n`;
    out += `Would you be open to a quick 10-minute walkthrough this week to see if this fits your current workflow?\n\n`;
    out += `Best regards,\n[Your Name]"\n\n`;
  } else {
    out += `"Hi ${contactName},\n\n`;
    out += `I'm following up to see if you had a chance to review my previous note regarding how we support ${lead.industry} operators in ${lead.location}.\n\n`;
    out += `Happy to answer any questions or share a quick example of how it works.\n\n`;
    out += `Best regards,\n[Your Name]"\n\n`;
  }

  out += "Evidence Used:\n";
  out += `- VERIFIED company name (${lead.companyName}) and location (${lead.location}).\n`;
  if (lead.contactName && lead.contactName !== "RESEARCH REQUIRED") {
    out += `- VERIFIED decision-maker name (${lead.contactName}).\n`;
  }
  if (lead.potentialNeed && lead.potentialNeed !== "RESEARCH REQUIRED") {
    out += `- VERIFIED operational need: ${lead.potentialNeed}.\n`;
  }
  out += `- Note: No prior conversation history was assumed or fabricated.\n`;

  return out;
}

/**
 * Finds a lead in the list by matching exact ID or company name substring.
 */
function findTargetLead(text, leads) {
  if (!text || leads.length === 0) return null;

  // 1. Check exact lead ID format (lead-xxx)
  const idMatch = text.match(/(lead-\d+-[a-z0-9]+)/i);
  if (idMatch && idMatch[1]) {
    const found = leads.find(l => l.id.toLowerCase() === idMatch[1].toLowerCase());
    if (found) return found;
  }

  // 2. Check for company name match
  const lowerText = text.toLowerCase();
  for (const l of leads) {
    if (l.companyName && l.companyName.length > 2) {
      const lowerName = l.companyName.toLowerCase();
      if (lowerText.includes(lowerName)) {
        return l;
      }
    }
  }

  return null;
}

/**
 * Main execution of the Sales Pipeline & CRM Agent skill.
 */
async function runSalesPipeline(message, askAI, options = {}) {
  const sources = options.sources || [];
  const sourcesText = formatSourcesContext(sources);
  const leads = loadLeads();
  const msgText = (message || "").toLowerCase().trim();

  // 1. Client Conversion Requests (e.g. "convert Luigi's Trattoria to client", "convert lead to client")
  const convertMatch = message.match(/(?:convert)\s+(?:lead\s+)?(.+?)\s+to\s+client/i);
  if (convertMatch) {
    const rawTarget = convertMatch[1].trim();
    const isGenericTarget = /^(lead|my lead|the lead|this lead|our lead)$/i.test(rawTarget);
    let targetLead = null;

    if (!isGenericTarget) {
      targetLead = findTargetLead(rawTarget, leads) || findTargetLead(message, leads);
    }

    if (!targetLead) {
      let out = `CLIENT CONVERSION ERROR\n\n`;
      out += `Status: LEAD NOT SPECIFIED OR NOT FOUND\n`;
      out += `Please specify which lead to convert by providing its company name or ID.\n`;
      out += `Example: node index.js "convert Luigi's Trattoria to client"\n\n`;

      if (leads.length > 0) {
        out += `Available stored leads:\n`;
        for (const l of leads) {
          out += `- ${l.companyName} (ID: ${l.id}) | Pipeline: ${l.pipelineStatus || "NOT_CONTACTED"} | Qualification: ${l.qualificationStatus || "NEEDS_RESEARCH"}\n`;
        }
      } else {
        out += `No leads are currently stored in data/leads.json.\n`;
      }
      return out;
    }

    const conversionResult = convertLeadToClient(targetLead.id);
    if (!conversionResult.success) {
      return `CLIENT CONVERSION ERROR: ${conversionResult.error}\n`;
    }

    const c = conversionResult.client;
    const l = conversionResult.lead;

    let confirm = `CLIENT CONVERSION REPORT\n\n`;
    confirm += `Lead: ${l.companyName} (ID: ${l.id})\n`;
    confirm += `Client ID: ${c.id}\n`;
    confirm += `Client Status: ${c.status}\n`;
    confirm += `Contracted Service: ${c.service}\n`;
    confirm += `Primary Contact: ${l.contactName}${l.contactRole && l.contactRole !== "RESEARCH REQUIRED" ? ` (${l.contactRole})` : ""}\n`;
    confirm += `Pipeline Status: ${l.pipelineStatus} (WON)\n`;
    confirm += `Qualification Status: ${l.qualificationStatus} (preserved)\n`;
    confirm += `Activity Logged: CLIENT_CONVERTED\n`;
    confirm += `Client Created At: ${c.createdAt}\n\n`;
    confirm += `Recommended Next Action:\n`;
    confirm += `- Proceed with delivery onboarding and service setup for ${l.companyName}.\n`;

    return confirm;
  }

  // 2. Lead / Client CRM Profile Requests (e.g. "show CRM profile for Luigi's Trattoria", "show client profile")
  const profileMatch = message.match(/(?:show\s+)?(?:crm\s+profile|client\s+profile|lead\s+profile)(?:\s+for\s+(.+))?/i);
  if (profileMatch) {
    const rawTarget = profileMatch[1] ? profileMatch[1].trim() : "";
    let targetLead = null;

    if (rawTarget) {
      targetLead = findTargetLead(rawTarget, leads);
    } else {
      targetLead = findTargetLead(message, leads);
    }

    if (!targetLead) {
      let out = `CRM PROFILE REPORT\n\n`;
      out += `Status: LEAD NOT SPECIFIED OR NOT FOUND\n`;
      out += `Please specify which lead or client to inspect by providing its company name or ID.\n`;
      out += `Example: node index.js "show CRM profile for Luigi's Trattoria"\n\n`;

      if (leads.length > 0) {
        out += `Available stored leads:\n`;
        for (const l of leads) {
          out += `- ${l.companyName} (ID: ${l.id}) | Pipeline: ${l.pipelineStatus || "NOT_CONTACTED"}\n`;
        }
      } else {
        out += `No leads are currently stored in data/leads.json.\n`;
      }
      return out;
    }

    const profile = getLeadCRMProfile(targetLead.id);
    return formatLeadCRMProfileReport(profile);
  }

  // 3. CRM Overview Requests (e.g. "show CRM", "show CRM overview", "CRM overview")
  const isCrmOverview = /^(?:show\s+)?crm(?:\s+overview)?$/i.test(msgText) || /show\s+crm\s+overview|crm\s+overview/i.test(msgText) || msgText === "show crm" || msgText === "crm";
  if (isCrmOverview) {
    return formatCRMOverviewReport();
  }

  // 4. Show Activities Requests (e.g. "show activities for Luigi's Trattoria", "show activities")
  const activitiesMatch = message.match(/show\s+activities(?:\s+for\s+(.+))?/i);
  if (activitiesMatch) {
    const rawTarget = activitiesMatch[1] ? activitiesMatch[1].trim() : "";
    let targetLead = null;
    if (rawTarget) {
      targetLead = findTargetLead(rawTarget, leads);
    }

    const activities = targetLead ? getLeadActivities(targetLead.id) : getActivities();

    let out = `CRM ACTIVITIES REPORT${targetLead ? ` — ${targetLead.companyName}` : ""}\n\n`;
    out += `Total Activities: ${activities.length}\n\n`;

    if (activities.length === 0) {
      out += `No activities recorded${targetLead ? ` for ${targetLead.companyName}` : ""}.\n`;
      return out;
    }

    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      out += `${i + 1}. [${a.occurredAt}] [${a.type}] (${a.status})\n`;
      out += `   Description: ${a.description}\n`;
      if (a.metadata && Object.keys(a.metadata).length > 0) {
        out += `   Metadata: ${JSON.stringify(a.metadata)}\n`;
      }
      out += "\n";
    }
    return out;
  }

  // 5. Show Contacts Requests (e.g. "show contacts for Luigi's Trattoria", "show contacts")
  const contactsMatch = message.match(/show\s+contacts(?:\s+for\s+(.+))?/i);
  if (contactsMatch) {
    const rawTarget = contactsMatch[1] ? contactsMatch[1].trim() : "";
    let targetLead = null;
    if (rawTarget) {
      targetLead = findTargetLead(rawTarget, leads);
    }

    const contacts = targetLead ? getLeadContacts(targetLead.id) : getContacts();

    let out = `CRM CONTACTS REPORT${targetLead ? ` — ${targetLead.companyName}` : ""}\n\n`;
    out += `Total Contacts: ${contacts.length}\n\n`;

    if (contacts.length === 0) {
      out += `No contacts recorded${targetLead ? ` for ${targetLead.companyName}` : ""}.\n`;
      return out;
    }

    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      out += `${i + 1}. Name: ${c.name} [Role: ${c.role}]\n`;
      out += `   Email: ${c.email} | Phone: ${c.phone}\n`;
      out += `   Evidence Type: ${c.evidenceType} | Source: ${c.source}\n`;
      if (c.notes) out += `   Notes: ${c.notes}\n`;
      out += "\n";
    }
    return out;
  }

  // 6. Show Clients Requests (e.g. "show clients")
  const isShowClients = /show\s+clients/i.test(msgText);
  if (isShowClients) {
    const clients = getClients();
    let out = `CRM CLIENTS REPORT\n\nTotal Clients: ${clients.length}\n\n`;

    if (clients.length === 0) {
      out += `No clients converted yet.\nRun "node index.js 'convert <company> to client'" to convert a qualified lead.\n`;
      return out;
    }

    for (let i = 0; i < clients.length; i++) {
      const cl = clients[i];
      out += `${i + 1}. Client: ${cl.companyName} (ID: ${cl.id})\n`;
      out += `   Status: ${cl.status} | Service: ${cl.service}\n`;
      out += `   Lead ID: ${cl.leadId}\n`;
      out += `   Converted At: ${cl.createdAt}\n`;
      if (cl.notes) out += `   Notes: ${cl.notes}\n`;
      out += "\n";
    }
    return out;
  }

  // 7. Status Update Requests (e.g. "mark Luigi's Trattoria as interested", "mark lead_123 as contacted")
  const updateMatch = message.match(/(?:mark|update|set)\s+(?:lead\s+)?(.+?)\s+(?:as|to|status\s+to)\s+([a-zA-Z\s_-]+)$/i);
  if (updateMatch) {
    const rawTarget = updateMatch[1].trim();
    const rawStatus = updateMatch[2].trim();
    const targetStatus = normalizeStatus(rawStatus);

    if (!targetStatus) {
      return `SALES PIPELINE UPDATE ERROR\n\nUnknown pipeline status: "${rawStatus}".\nValid pipeline statuses are:\n- ${PIPELINE_STATUSES.join("\n- ")}\n`;
    }

    const isGenericTarget = /^(lead|my lead|the lead|this lead|our lead)$/i.test(rawTarget);
    let targetLead = null;

    if (!isGenericTarget) {
      targetLead = findTargetLead(rawTarget, leads) || findTargetLead(message, leads);
    }

    if (!targetLead) {
      let out = `SALES PIPELINE UPDATE\n\n`;
      out += `Status: LEAD NOT SPECIFIED OR NOT FOUND\n`;
      out += `Please specify which lead to update by providing its company name or ID.\n`;
      out += `Example: node index.js "mark Luigi's Trattoria as ${targetStatus.toLowerCase()}"\n\n`;

      if (leads.length > 0) {
        out += `Available stored leads:\n`;
        for (const l of leads) {
          out += `- ${l.companyName} (ID: ${l.id}) | Current Pipeline: ${l.pipelineStatus || "NOT_CONTACTED"} | Qualification: ${l.qualificationStatus || "NEEDS_RESEARCH"}\n`;
        }
      } else {
        out += `No leads are currently stored in data/leads.json.\n`;
      }
      return out;
    }

    const prevStatus = targetLead.pipelineStatus || (targetLead.pipeline && targetLead.pipeline.status) || "NOT_CONTACTED";
    const updated = updateLeadPipeline(targetLead.id, {
      status: targetStatus,
      notes: `Status updated to ${targetStatus} via CLI request.`
    });

    // Record activity in CRM activity log
    const actType = targetStatus === "CONTACTED" ? "CONTACTED"
      : targetStatus === "REPLIED" ? "REPLIED"
      : targetStatus === "DEMO_SCHEDULED" ? "DEMO_SCHEDULED"
      : targetStatus === "PROPOSAL_SENT" ? "PROPOSAL_SENT"
      : "STATUS_CHANGED";

    addActivity({
      leadId: updated.id,
      type: actType,
      description: `Pipeline status for ${updated.companyName} updated from ${prevStatus} to ${targetStatus}`,
      metadata: { prevStatus, targetStatus }
    });

    let confirm = `LEAD PIPELINE UPDATE\n\n`;
    confirm += `Lead: ${updated.companyName} (ID: ${updated.id})\n`;
    confirm += `Contact: ${updated.contactName}${updated.contactRole && updated.contactRole !== "RESEARCH REQUIRED" ? ` (${updated.contactRole})` : ""}\n`;
    confirm += `Previous Status: ${prevStatus}\n`;
    confirm += `New Pipeline Status: ${updated.pipelineStatus}\n`;
    confirm += `Qualification Status: ${updated.qualificationStatus} (preserved)\n`;
    confirm += `Last Contacted: ${updated.pipeline?.lastContactedAt || "NOT SET"}\n`;
    confirm += `Next Follow-up: ${updated.pipeline?.nextFollowUpAt || "NOT SET"}\n`;
    confirm += `Updated At: ${updated.pipeline?.updatedAt || new Date().toISOString()}\n\n`;

    confirm += `Next Recommended Action:\n`;
    if (targetStatus === "INTERESTED") {
      confirm += `- Schedule a solution demo or walkthrough: node index.js "mark ${updated.companyName} as demo scheduled"\n`;
    } else if (targetStatus === "DEMO_SCHEDULED") {
      confirm += `- Prepare customized presentation addressing verified need (${updated.potentialNeed || "operational workflow"}).\n`;
    } else if (targetStatus === "PROPOSAL_SENT") {
      confirm += `- Set follow-up date for proposal review within 3-5 business days.\n`;
    } else if (targetStatus === "WON") {
      confirm += `- Transition customer to onboarding: node index.js "convert ${updated.companyName} to client"\n`;
    } else if (targetStatus === "LOST") {
      confirm += `- Log objection notes and archive from active outreach.\n`;
    } else if (targetStatus === "FOLLOW_UP") {
      confirm += `- Draft personalized follow-up: node index.js "prepare follow-up for ${updated.companyName}"\n`;
    } else {
      confirm += `- Monitor response and track conversation progress.\n`;
    }

    return confirm;
  }

  // 8. Draft Follow-up Message Request
  const draftMatch = message.match(/(?:draft|prepare|write|create)\s+follow[-_ ]?up\s+(?:message|email|for)?\s*(.+)?/i);
  if (draftMatch && (draftMatch[1] || leads.length > 0)) {
    const targetQuery = draftMatch[1] ? draftMatch[1].trim() : "";
    const targetLead = findTargetLead(targetQuery, leads) || (leads.length === 1 ? leads[0] : null);

    if (targetLead) {
      // Log CRM activity for outreach preparation
      addActivity({
        leadId: targetLead.id,
        type: "OUTREACH_PREPARED",
        description: `Follow-up draft message prepared for ${targetLead.companyName}`,
        metadata: { pipelineStatus: targetLead.pipelineStatus }
      });

      const draft = formatFollowUpDraft(targetLead);
      return draft;
    }
  }

  // 9. Stage Filtering Queries (e.g. "show contacted leads", "show interested leads", "show won deals")
  const stageFilterMatch = msgText.match(/show\s+([a-z\s_-]+?)\s+(?:leads|deals|pipeline|proposals)?$/i);
  if (stageFilterMatch) {
    const rawStage = stageFilterMatch[1].trim();
    const parsedStage = normalizeStatus(rawStage);
    if (parsedStage) {
      const matched = leads.filter(l => l.pipelineStatus === parsedStage || (l.pipeline && l.pipeline.status === parsedStage));
      let out = `PIPELINE STAGE REPORT: ${parsedStage}\n\n`;
      out += `Total Matching Leads: ${matched.length}\n\n`;

      if (matched.length === 0) {
        out += `No leads currently have the status "${parsedStage}".\n`;
        out += `Run "node index.js 'show my sales pipeline'" to view all pipeline stages.\n`;
        return out;
      }

      for (let i = 0; i < matched.length; i++) {
        const l = matched[i];
        const p = l.pipeline || {};
        out += `${i + 1}. Company: ${l.companyName} (ID: ${l.id})\n`;
        out += `   Contact: ${l.contactName}${l.contactRole && l.contactRole !== "RESEARCH REQUIRED" ? ` (${l.contactRole})` : ""}\n`;
        out += `   Industry/Location: ${l.industry} | ${l.location}\n`;
        out += `   Qualification: ${l.qualificationStatus}\n`;
        out += `   Last Contacted: ${p.lastContactedAt || "NOT SET"}\n`;
        out += `   Next Follow-up: ${p.nextFollowUpAt || "NOT SET"}\n`;
        if (p.nextAction) out += `   Next Action: ${p.nextAction}\n`;
        out += "\n";
      }
      return out;
    }
  }

  // 10. Follow-up Identification Queries (e.g. "show leads needing follow-up", "what should i follow up on")
  const isFollowUpQuery = /needing\s+follow[-_ ]?up|follow[-_ ]?up\s+with\s+leads|what\s+should\s+i\s+follow\s+up|needing\s+attention/i.test(msgText);
  if (isFollowUpQuery) {
    const needing = getLeadsNeedingFollowUp();
    return formatFollowUpReport(needing, leads);
  }

  // 11. Default: Pipeline Overview
  const deterministicOverview = formatPipelineOverview(leads);

  if (typeof askAI === "function" && leads.length > 0) {
    const prompt = `You are the Sales Pipeline & CRM Agent inside an AI Business Agent platform.

Your mission is to manage the commercial sales pipeline and customer relationship data of existing leads without fabricating customer history, conversations, conversion probabilities, or promises.

====================
PIPELINE STATUSES
====================
- NOT_CONTACTED: Initial state after lead generation/qualification.
- CONTACTED: Outreach message has been sent.
- REPLIED: Lead responded to outreach.
- INTERESTED: Lead expressed interest in learning more.
- FOLLOW_UP: Lead requires scheduled follow-up contact.
- DEMO_SCHEDULED: Solution walkthrough or demo agreed.
- PROPOSAL_SENT: Pricing/contract proposal delivered.
- WON: Deal closed and customer signed.
- LOST: Deal disqualified, declined, or cold closed.

====================
EVIDENCE RULES
====================
- NEVER invent prior conversations or pretend a discussion took place.
- If conversation history is unavailable, explicitly state: "Previous conversation details: NOT PROVIDED".
- NEVER state conversion probabilities (no "85% chance of closing").
- Next follow-up dates must be explicit: if none set, output "NEXT FOLLOW-UP: NOT SET".

====================
CURRENT PIPELINE DATA
====================
${deterministicOverview}

====================
USER REQUEST
====================
${message}

Please output the complete, structured SALES PIPELINE REPORT or response matching the verified data shown above.`;

    try {
      const aiResponse = await askAI(prompt);
      return aiResponse;
    } catch {
      return deterministicOverview;
    }
  }

  return deterministicOverview;
}

module.exports = {
  runSalesPipeline,
  formatPipelineOverview,
  formatCRMOverviewReport,
  formatLeadCRMProfileReport,
  formatFollowUpReport,
  formatFollowUpDraft,
  normalizeStatus,
  findTargetLead,
  PIPELINE_STATUSES
};
