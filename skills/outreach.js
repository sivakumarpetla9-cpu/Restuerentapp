const { getQualifiedLeads, searchLeads, getLead } = require("../memory/leadStore");
const communicationStore = require("../memory/communicationStore");
const gateway = require("../communication/gateway");
const communicationEventsStore = require("../memory/communicationEventsStore");

/**
 * Parses channel from request text. Defaults to EMAIL.
 */
function parseChannel(text) {
  const lower = text.toLowerCase();
  if (lower.includes("whatsapp")) return "WHATSAPP";
  return "EMAIL";
}

/**
 * Parses message purpose from request text.
 */
function parsePurpose(text) {
  const lower = text.toLowerCase();
  if (lower.includes("follow up") || lower.includes("follow-up")) return "FOLLOW_UP";
  if (lower.includes("demo")) return "DEMO_INVITATION";
  if (lower.includes("proposal")) return "PROPOSAL_FOLLOW_UP";
  if (lower.includes("welcome")) return "CLIENT_WELCOME";
  if (lower.includes("requirement")) return "REQUIREMENT_REQUEST";
  if (lower.includes("milestone")) return "MILESTONE_UPDATE";
  if (lower.includes("review")) return "CLIENT_REVIEW";
  if (lower.includes("project complete") || lower.includes("completed")) return "PROJECT_COMPLETED";
  if (lower.includes("update") || lower.includes("status")) return "PROJECT_UPDATE";
  return "INITIAL_OUTREACH";
}

/**
 * Formats a prepared message draft into a clean, structured CLI report.
 */
function formatMessageDraftReport(draftResult) {
  const msg = draftResult.message;
  let out = "COMMUNICATION WORKSPACE: PREPARED DRAFT\n";
  out += "=========================================\n";
  out += `Message ID: ${msg.id}\n`;
  out += `Recipient: ${msg.recipientName} (${msg.recipientAddress})\n`;
  out += `Channel: ${msg.channel} [PREPARED / NOT SENT]\n`;
  out += `Purpose: ${msg.purpose}\n`;
  out += `Status: ${msg.status}\n`;
  out += `Evidence Source: ${msg.source}\n\n`;

  if (msg.subject) {
    out += `SUBJECT: ${msg.subject}\n\n`;
  }

  out += "BODY:\n";
  out += "-----------------------------------------\n";
  out += `${msg.body}\n`;
  out += "-----------------------------------------\n\n";
  out += "NEXT ACTIONS:\n";
  out += "1. Review the draft above for accuracy before approving.\n";
  out += "2. In ₹0 local-first mode, messages are never sent automatically.\n";
  out += "3. Use the Dashboard to review and copy the message, or mark as APPROVED / COPIED.\n";
  return out;
}

/**
 * Formats a report of prepared communication messages.
 */
function formatMessagesListReport(messages = []) {
  let out = "COMMUNICATION WORKSPACE: PREPARED MESSAGES\n";
  out += "=========================================\n";

  if (messages.length === 0) {
    out += "No messages prepared yet.\n";
    out += "To prepare a message draft, use: node index.js \"draft message for <company>\"\n";
    return out;
  }

  out += `Total Messages: ${messages.length}\n\n`;
  for (const m of messages) {
    out += `- [${m.status}] [${m.channel}] ${m.purpose}\n`;
    out += `  ID: ${m.id}\n`;
    out += `  Recipient: ${m.recipientName} (${m.recipientAddress})\n`;
    if (m.subject) out += `  Subject: ${m.subject}\n`;
    out += `  Created: ${m.createdAt}\n`;
    if (m.copiedAt) out += `  Copied At: ${m.copiedAt}\n`;
    out += "\n";
  }

  return out;
}

/**
 * Formats a report of available communication templates.
 */
function formatTemplatesListReport(templates = []) {
  let out = "COMMUNICATION TEMPLATES REPORT\n";
  out += "==============================\n";

  if (templates.length === 0) {
    out += "No communication templates found.\n";
    return out;
  }

  out += `Available Templates: ${templates.length}\n\n`;
  for (const t of templates) {
    out += `[${t.channel}] ${t.name} (ID: ${t.id})\n`;
    out += `  Purpose: ${t.purpose}\n`;
    if (t.subject) out += `  Default Subject: ${t.subject}\n`;
    out += `  Preview: ${t.body.replace(/\n+/g, " ").slice(0, 100)}...\n\n`;
  }

  return out;
}

/**
 * Formats a message status report with timeline and linked CRM activities.
 */
function formatMessageStatusReport(statusObj) {
  if (!statusObj || !statusObj.message) {
    return "COMMUNICATION STATUS REPORT\n===========================\nMessage not found.";
  }

  const { message: msg, events = [], activities = [] } = statusObj;
  let out = "COMMUNICATION STATUS REPORT\n";
  out += "===========================\n";
  out += `Message ID: ${msg.id}\n`;
  out += `Conversation ID: ${msg.conversationId || "N/A"}\n`;
  out += `Provider: ${msg.provider || "local"} (Local Simulator)\n`;
  out += `Provider Message ID: ${msg.providerMessageId || "N/A"}\n`;
  out += `Recipient: ${msg.recipientName} (${msg.recipientAddress || msg.recipient || "N/A"})\n`;
  out += `Channel: ${msg.channel}\n`;
  out += `Purpose: ${msg.purpose}\n`;
  out += `Current Status: ${msg.status}\n`;
  if (msg.errorCode) out += `Error Code: ${msg.errorCode}\n`;
  if (msg.errorMessage) out += `Error Message: ${msg.errorMessage}\n`;
  out += "\nTIMELINE:\n";
  out += `  - Created: ${msg.createdAt}\n`;
  if (msg.approvedAt) out += `  - Approved: ${msg.approvedAt}\n`;
  if (msg.sendRequestedAt) out += `  - Send Requested: ${msg.sendRequestedAt}\n`;
  if (msg.sentAt) out += `  - Sent: ${msg.sentAt}\n`;
  if (msg.deliveredAt) out += `  - Delivered: ${msg.deliveredAt}\n`;
  if (msg.readAt) out += `  - Read: ${msg.readAt}\n`;
  if (msg.repliedAt) out += `  - Customer Replied: ${msg.repliedAt}\n`;

  if (events.length > 0) {
    out += "\nRECORDED GATEWAY EVENTS:\n";
    for (const evt of events) {
      out += `  [${evt.timestamp}] ${evt.type} (Provider: ${evt.provider}) [Event ID: ${evt.eventId}]\n`;
    }
  }

  if (msg.inboundReplies && msg.inboundReplies.length > 0) {
    out += "\nINBOUND REPLIES:\n";
    for (const rep of msg.inboundReplies) {
      out += `  [${rep.timestamp}] From ${rep.sender}: "${rep.text}"\n`;
    }
  }

  if (activities.length > 0) {
    out += "\nLINKED CRM ACTIVITIES:\n";
    for (const act of activities) {
      out += `  [${act.occurredAt}] ${act.type} - ${act.description}\n`;
    }
  }

  return out;
}

/**
 * Formats a report of logged communication events.
 */
function formatEventsListReport(events = []) {
  let out = "COMMUNICATION GATEWAY EVENTS REPORT\n";
  out += "===================================\n";

  if (events.length === 0) {
    out += "No communication events recorded yet.\n";
    return out;
  }

  out += `Total Logged Events: ${events.length}\n\n`;
  for (const evt of events.slice(-20).reverse()) {
    out += `- [${evt.timestamp}] ${evt.type} | Message: ${evt.messageId || "N/A"} | Provider: ${evt.provider}\n`;
    out += `  Event ID: ${evt.eventId} | Provider Msg ID: ${evt.providerMessageId || "N/A"}\n`;
    if (evt.recipient) out += `  Recipient: ${evt.recipient}\n`;
    if (evt.details && Object.keys(evt.details).length > 0) {
      out += `  Details: ${JSON.stringify(evt.details)}\n`;
    }
    out += "\n";
  }

  return out;
}

async function runOutreach(message, askOllama) {
  const userRequestMatch = (message || "").match(/CURRENT USER REQUEST:\s*([\s\S]+)$/i);
  const text = (userRequestMatch ? userRequestMatch[1] : (message || "")).trim();
  const lower = text.toLowerCase();

  // 1. Show Messages
  if (lower.includes("show messages") || lower.includes("list messages") || lower.includes("show communication messages")) {
    const msgs = communicationStore.getMessages();
    return formatMessagesListReport(msgs);
  }

  // 2. Show Templates
  if (lower.includes("show templates") || lower.includes("list templates") || lower.includes("show communication templates")) {
    const tmpls = communicationStore.getTemplates();
    return formatTemplatesListReport(tmpls);
  }

  // 3. Show Communication Events
  if (lower.includes("show communication events") || lower.includes("list communication events") || lower.includes("show gateway events")) {
    const events = communicationEventsStore.getEvents();
    return formatEventsListReport(events);
  }

  // 4. Show Communication Status
  const statusMatch = text.match(/show\s+(?:communication\s+)?status(?:\s+for)?\s+([^\s]+)/i);
  if (statusMatch) {
    const msgId = statusMatch[1].trim();
    const statusObj = gateway.getMessageStatus(msgId);
    if (!statusObj) {
      return `MESSAGE NOT FOUND: Could not find communication status for "${msgId}".`;
    }
    return formatMessageStatusReport(statusObj);
  }

  // 5. Send Message (Gateway Level 3)
  const sendMatch = text.match(/send\s+message\s+([^\s]+)/i);
  if (sendMatch) {
    const msgId = sendMatch[1].trim();
    try {
      const res = await gateway.sendMessage(msgId);
      if (res.success) {
        let out = "COMMUNICATION GATEWAY: MESSAGE SENT\n";
        out += "===================================\n";
        out += `Message ID: ${res.message.id}\n`;
        out += `Provider: ${res.message.provider} (Local Simulator)\n`;
        out += `Provider Message ID: ${res.message.providerMessageId}\n`;
        out += `Recipient: ${res.message.recipientName} (${res.message.recipientAddress || res.message.recipient})\n`;
        out += `Channel: ${res.message.channel}\n`;
        out += `Status: ${res.message.status}\n`;
        out += `Sent At: ${res.message.sentAt}\n`;
        out += `CRM Activity Logged: CONTACTED\n`;
        out += `Pipeline Advanced: CONTACTED\n`;
        return out;
      } else {
        return `SEND FAILED: ${res.error || "Failed to send message."}`;
      }
    } catch (err) {
      return `SEND ERROR: ${err.message}`;
    }
  }

  // 6. Simulate Delivered
  const deliveredMatch = text.match(/simulate\s+delivered\s+([^\s]+)/i);
  if (deliveredMatch) {
    const msgId = deliveredMatch[1].trim();
    try {
      const res = await gateway.simulateDelivery(msgId);
      return `SIMULATION SUCCESS: Message "${msgId}" status is now DELIVERED. Provider event logged.`;
    } catch (err) {
      return `SIMULATION ERROR: ${err.message}`;
    }
  }

  // 7. Simulate Read
  const readMatch = text.match(/simulate\s+read\s+([^\s]+)/i);
  if (readMatch) {
    const msgId = readMatch[1].trim();
    try {
      const res = await gateway.simulateRead(msgId);
      return `SIMULATION SUCCESS: Message "${msgId}" status is now READ. Provider event logged.`;
    } catch (err) {
      return `SIMULATION ERROR: ${err.message}`;
    }
  }

  // 8. Simulate Reply
  const replyMatch = text.match(/simulate\s+reply\s+([^\s]+)\s+([\s\S]+)/i);
  if (replyMatch) {
    const msgId = replyMatch[1].trim();
    const replyText = replyMatch[2].trim();
    try {
      const res = await gateway.simulateReply(msgId, replyText);
      let out = `SIMULATION SUCCESS: Inbound customer reply recorded for "${msgId}".\n`;
      out += `Status: REPLIED\n`;
      out += `Reply Text: "${replyText}"\n`;
      out += `CRM Activity Logged: REPLIED\n`;
      out += `Pipeline Status: REPLIED\n`;
      return out;
    } catch (err) {
      return `SIMULATION ERROR: ${err.message}`;
    }
  }

  // 9. Simulate Failure
  const failMatch = text.match(/simulate\s+(?:failure|fail)\s+([^\s]+)(?:\s+([\s\S]+))?/i);
  if (failMatch) {
    const msgId = failMatch[1].trim();
    const reason = failMatch[2] ? failMatch[2].trim() : "Simulated delivery failure";
    try {
      const res = await gateway.simulateFailure(msgId, reason);
      return `SIMULATION SUCCESS: Message "${msgId}" marked as FAILED. Reason: "${reason}".`;
    } catch (err) {
      return `SIMULATION ERROR: ${err.message}`;
    }
  }

  // 10. Approve Message
  const approveMatch = text.match(/approve\s+message\s+([^\s]+)/i);
  if (approveMatch) {
    const msgId = approveMatch[1].trim();
    const existing = communicationStore.getMessage(msgId);
    if (!existing) {
      return `MESSAGE NOT FOUND: Could not find message with ID "${msgId}".`;
    }
    const updated = communicationStore.markMessageApproved(msgId);
    return `MESSAGE APPROVED: Message "${msgId}" status is now ${updated.status}. Prepared for review/copy.`;
  }

  // 11. Copy Message
  const copyMatch = text.match(/copy\s+message\s+([^\s]+)/i);
  if (copyMatch) {
    const msgId = copyMatch[1].trim();
    const existing = communicationStore.getMessage(msgId);
    if (!existing) {
      return `MESSAGE NOT FOUND: Could not find message with ID "${msgId}".`;
    }
    const updated = communicationStore.markMessageCopied(msgId);
    return `MESSAGE COPIED: Message "${msgId}" marked as ${updated.status}. Timestamp recorded.`;
  }

  // 12. Draft / Prepare Message for Lead or Client
  const draftMatch = text.match(/(?:draft|prepare)\s+(?:message|email|whatsapp|outreach)\s+for\s+([^,\n\r]+)/i);
  if (draftMatch) {
    const targetQuery = draftMatch[1].trim().replace(/^["']|["']$/g, "");
    const channel = parseChannel(text);
    const purpose = parsePurpose(text);

    // Try preparing for lead first
    const draftRes = communicationStore.prepareDraftForLead(targetQuery, purpose, channel);
    if (draftRes.success) {
      return formatMessageDraftReport(draftRes);
    }

    // Try preparing for client if lead was not found
    const clientDraftRes = communicationStore.prepareDraftForClient(targetQuery, purpose, channel);
    if (clientDraftRes.success) {
      return formatMessageDraftReport(clientDraftRes);
    }

    return `LEAD OR CLIENT NOT FOUND\nCould not find a record for "${targetQuery}".\nPlease add or import the lead first before preparing communication.`;
  }

  // 6. Default: Strategic Outreach Agent execution
  let qualifiedContext = "";
  try {
    const qualifiedLeads = getQualifiedLeads();
    if (qualifiedLeads && qualifiedLeads.length > 0) {
      qualifiedContext = "\n\nQUALIFIED LEADS (from Lead Qualification & Sales Pipeline):\n" +
        qualifiedLeads.map(l => `- ${l.companyName} (${l.industry}, ${l.location}) | Contact: ${l.contactName}${l.contactRole && l.contactRole !== "RESEARCH REQUIRED" ? ` (${l.contactRole})` : ""} | Pipeline: ${l.pipelineStatus || (l.pipeline && l.pipeline.status) || "NOT_CONTACTED"} | Need/Fit: ${l.fitReason}`).join("\n");
    }
  } catch {
    // Non-blocking fallback
  }

  // Also include communication overview context if messages exist
  let commContext = "";
  try {
    const overview = communicationStore.getCommunicationOverview();
    if (overview.totalMessages > 0) {
      commContext = `\n\nCOMMUNICATION WORKSPACE OVERVIEW: Total Prepared Messages: ${overview.totalMessages} (Ready for review: ${overview.byStatus.READY_FOR_REVIEW}, Approved: ${overview.byStatus.APPROVED}, Copied: ${overview.byStatus.COPIED}). Direct automated sending is DISABLED (₹0 local-first mode).`;
    }
  } catch {
    // Non-blocking
  }

  const prompt = `You are the Outreach Agent inside an AI Business Agent.

Your job is to help a business identify, reach, qualify, and convert potential customers.

IMPORTANT:
Never invent customer lists, contact information, response rates, conversion rates, market statistics, competitor claims, customer counts, revenue, traction, case studies, testimonials, partnerships, or performance results.

Never write claims such as:
- "We have helped 50 restaurants"
- "We have helped 500 restaurants"
- "Customers reduced errors by X%"
- "Our customers increased revenue by X%"

unless the user explicitly provided that evidence.

Evidence rules:
- USER-PROVIDED: information explicitly supplied by the user.
- VERIFIED: only information supported by an actual source or explicit user-provided evidence.
- ASSUMPTION: plausible but unverified information used for planning.
- RECOMMENDATION: an action, target, experiment, or suggested approach.
- RESEARCH REQUIRED: information that needs external evidence before being treated as factual.

Never label a claim VERIFIED merely because it sounds plausible.
If no source or user evidence exists, do not call it VERIFIED.

VERIFIED CLAIM RULE:
Only use the word VERIFIED when the response contains a concrete source, citation, or explicitly identified user-provided evidence supporting that claim.

PIPELINE RULE:
Use exactly these stages:
Lead ? Contacted ? Replied ? Qualified ? Demo ? Trial ? Paid ? Retained

Stage transitions:
- Lead ? Contacted: outreach was actually sent.
- Contacted ? Replied: prospect actually responded.
- Replied ? Qualified: qualification criteria were confirmed.
- Qualified ? Demo: prospect agreed to a demo.
- Demo ? Trial: prospect started a trial.
- Trial ? Paid: payment was completed.
- Paid ? Retained: customer remained active or renewed.

Do not invent trial durations, customer counts, budgets, conversion rates, revenue, results, or performance claims.

If the user has not provided evidence for a claim, label it ASSUMPTION or RESEARCH REQUIRED rather than VERIFIED.

METRIC RULE:
Metric definitions are not market statistics. For example, "reply rate = replies divided by contacted leads" is a formula definition and should not be treated as an unsupported percentage claim.

Numeric targets such as "contact 20 restaurants" are recommendations or experiments, not facts.

Clearly distinguish:
- USER-PROVIDED
- VERIFIED
- ASSUMPTION
- RECOMMENDATION
- RESEARCH REQUIRED

Analyze:

1. IDEAL CUSTOMER PROFILE
Define:
- Business type
- Company size
- Location
- Buyer/decision-maker
- Pain points
- Existing alternatives
- Buying trigger

2. CUSTOMER SEGMENTS
Identify the most relevant segments.

For each:
- Problem
- Urgency
- Ability to pay
- Ease of reaching them
- Qualification criteria

3. LEAD SOURCES
Recommend legitimate sources such as:
- Public business directories
- Company websites
- LinkedIn
- Industry associations
- Local business networks
- Referrals
- Existing customer introductions

Do not fabricate actual leads or contact information.

4. OUTREACH CHANNELS
Compare:
- Email
- WhatsApp
- LinkedIn
- Phone
- In-person

Explain when each channel makes sense.

5. OUTREACH MESSAGE
Create a concise first-contact message based only on the user's actual product and customer problem.

Do not make unsupported claims.

6. FOLLOW-UP SEQUENCE
Create a practical sequence:
- Initial contact
- Follow-up 1
- Follow-up 2
- Final follow-up

Keep messages respectful and non-spammy.

7. QUALIFICATION
Create questions to determine:
- Current problem
- Existing solution
- Frequency of problem
- Decision-maker
- Budget/willingness to pay
- Implementation requirements
- Urgency

8. SALES PIPELINE

Define the sales pipeline using these stages:

Lead
Contacted
Replied
Qualified
Demo
Trial
Paid
Retained

Stage evidence:
- Lead to Contacted: outreach message has actually been sent.
- Contacted to Replied: prospect has responded.
- Replied to Qualified: qualification criteria have been confirmed.
- Qualified to Demo: prospect agrees to a demo.
- Demo to Trial: prospect starts a trial.
- Trial to Paid: payment is completed.
- Paid to Retained: customer remains active or renews.

For each stage, describe the evidence required to move the prospect into that stage.

9. VALIDATION METRICS

Track:
- Leads contacted
- Replies
- Qualified conversations
- Demos
- Trials
- Paid customers
- Retention

Do not invent benchmark percentages.

When defining a metric such as "reply rate", describe the metric conceptually (for example, replies divided by contacted leads) rather than inserting an unsupported percentage.

10. NEXT ACTIONS

End with:

IDEAL CUSTOMER:
BEST INITIAL CHANNEL:
MESSAGE:
QUALIFICATION QUESTIONS:
PIPELINE:
WHAT WE KNOW:
WHAT WE ASSUME:
WHAT MUST BE VALIDATED:
NEXT 3 ACTIONS:

Be practical, ethical, and evidence-aware.
${qualifiedContext}${commContext}

USER REQUEST:
${message}`;

  return await askOllama(prompt);
}

module.exports = {
  runOutreach,
  formatMessageDraftReport,
  formatMessagesListReport,
  formatTemplatesListReport
};
