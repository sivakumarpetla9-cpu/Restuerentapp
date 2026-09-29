const { loadLeads, updateLead, getLeads, searchLeads } = require("../memory/leadStore");
const { formatSourcesContext } = require("./research");

const QUALIFICATION_STATUSES = {
  UNQUALIFIED: "UNQUALIFIED",
  POSSIBLE_FIT: "POSSIBLE_FIT",
  QUALIFIED: "QUALIFIED",
  NEEDS_RESEARCH: "NEEDS_RESEARCH"
};

const EVIDENCE_TYPES = {
  VERIFIED: "VERIFIED",
  USER_PROVIDED: "USER-PROVIDED",
  ASSUMPTION: "ASSUMPTION",
  RESEARCH_REQUIRED: "RESEARCH REQUIRED"
};

/**
 * Builds a configurable qualification rubric / ICP definition.
 */
function buildDefaultRubric(options = {}) {
  const icp = options.icp || {};
  const isDefaultTemplate = Boolean(options.isDefaultTemplate);

  return {
    name: options.name || "Standard Commercial Qualification Rubric",
    isDefaultTemplate,
    icp: {
      industry: icp.industry || null,
      companyType: icp.companyType || null,
      location: icp.location || null,
      businessNeed: icp.businessNeed || null,
      technology: icp.technology || null,
      companyCharacteristics: icp.companyCharacteristics || null
    },
    criteria: [
      {
        id: "industry_match",
        name: "Target Industry Match",
        description: "Company operates within the target industry domain.",
        required: true,
        targetValue: icp.industry || null
      },
      {
        id: "location_match",
        name: "Target Location Match",
        description: "Company is located within target geographic market.",
        required: false,
        targetValue: icp.location || null
      },
      {
        id: "business_need",
        name: "Verifiable Business Need",
        description: "Evidence of concrete operational problem, use case, or pain point.",
        required: true,
        targetValue: icp.businessNeed || null
      },
      {
        id: "decision_maker",
        name: "Decision-Maker Identified",
        description: "Named contact person and role known for commercial outreach.",
        required: false,
        targetValue: null
      }
    ]
  };
}

/**
 * Parses user-supplied ICP / rubric text from the request string if present.
 */
function parseIcpFromText(text) {
  if (!text || typeof text !== "string") return null;

  const hasIcpKeyword = /icp|ideal customer profile|qualification rubric|target industry|criteria|rubric/i.test(text);
  if (!hasIcpKeyword) return null;

  const getMatch = regex => {
    const match = text.match(regex);
    return match && match[1] ? match[1].trim() : null;
  };

  const industry = getMatch(/(?:industry|target industry)[:\s]+([^\n\r,\.]+)/i);
  const location = getMatch(/(?:location|target location|city|state)[:\s]+([^\n\r,\.]+)/i);
  const businessNeed = getMatch(/(?:business\s*need|need|problem|use\s*case|pain\s*point)[:\s]+([^\n\r,\.]+)/i);
  const companyType = getMatch(/(?:company\s*type|type)[:\s]+([^\n\r,\.]+)/i);

  if (industry || location || businessNeed || companyType) {
    return {
      industry,
      location,
      businessNeed,
      companyType
    };
  }

  return null;
}

/**
 * Evaluates a single lead against a qualification rubric based ONLY on available evidence.
 * Never creates fake evidence or conversion percentages.
 */
function evaluateLeadWithRubric(lead, rubric = null) {
  const activeRubric = rubric || buildDefaultRubric({ isDefaultTemplate: true });
  const criteriaResults = [];
  const missingInformation = [];
  const evidenceList = [];

  let hasUnqualifiedFail = false;
  let passedCount = 0;
  const totalEvaluated = activeRubric.criteria.length;

  for (const criterion of activeRubric.criteria) {
    let result = "UNKNOWN";
    let evidenceType = EVIDENCE_TYPES.RESEARCH_REQUIRED;
    let notes = "";

    if (criterion.id === "industry_match") {
      const leadInd = String(lead.industry || "").trim();
      if (!leadInd || leadInd === "RESEARCH REQUIRED") {
        result = "UNKNOWN";
        evidenceType = EVIDENCE_TYPES.RESEARCH_REQUIRED;
        notes = "Industry not identified; research required.";
        missingInformation.push("Target Industry");
      } else if (criterion.targetValue) {
        const matches = leadInd.toLowerCase().includes(criterion.targetValue.toLowerCase());
        if (matches) {
          result = "PASS";
          evidenceType = lead.evidence && lead.evidence.includes("VERIFIED") ? EVIDENCE_TYPES.VERIFIED : EVIDENCE_TYPES.USER_PROVIDED;
          notes = `Matches target industry: ${leadInd}`;
          passedCount++;
          evidenceList.push(`Industry verified as ${leadInd}`);
        } else {
          result = "FAIL";
          evidenceType = EVIDENCE_TYPES.VERIFIED;
          notes = `Industry "${leadInd}" does not match target "${criterion.targetValue}".`;
          hasUnqualifiedFail = true;
        }
      } else {
        result = "PASS";
        evidenceType = lead.evidence && lead.evidence.includes("VERIFIED") ? EVIDENCE_TYPES.VERIFIED : EVIDENCE_TYPES.USER_PROVIDED;
        notes = `Identified industry: ${leadInd}`;
        passedCount++;
        evidenceList.push(`Industry identified as ${leadInd}`);
      }
    } else if (criterion.id === "location_match") {
      const leadLoc = String(lead.location || "").trim();
      if (!leadLoc || leadLoc === "RESEARCH REQUIRED") {
        result = "UNKNOWN";
        evidenceType = EVIDENCE_TYPES.RESEARCH_REQUIRED;
        notes = "Location not identified.";
        missingInformation.push("Company Location");
      } else if (criterion.targetValue) {
        const matches = leadLoc.toLowerCase().includes(criterion.targetValue.toLowerCase());
        if (matches) {
          result = "PASS";
          evidenceType = EVIDENCE_TYPES.USER_PROVIDED;
          notes = `Matches target location: ${leadLoc}`;
          passedCount++;
          evidenceList.push(`Location matches ${leadLoc}`);
        } else {
          result = "FAIL";
          evidenceType = EVIDENCE_TYPES.VERIFIED;
          notes = `Location "${leadLoc}" outside target "${criterion.targetValue}".`;
          if (criterion.required) hasUnqualifiedFail = true;
        }
      } else {
        result = "PASS";
        evidenceType = EVIDENCE_TYPES.USER_PROVIDED;
        notes = `Location identified: ${leadLoc}`;
        passedCount++;
        evidenceList.push(`Location identified as ${leadLoc}`);
      }
    } else if (criterion.id === "business_need") {
      const need = String(lead.potentialNeed || lead.painPoints || "").trim();
      if (!need || need === "RESEARCH REQUIRED") {
        result = "UNKNOWN";
        evidenceType = EVIDENCE_TYPES.RESEARCH_REQUIRED;
        notes = "No verified operational problem or business need identified.";
        missingInformation.push("Verifiable Business Need");
      } else {
        result = "PASS";
        evidenceType = lead.evidence && lead.evidence.includes("VERIFIED") ? EVIDENCE_TYPES.VERIFIED : EVIDENCE_TYPES.USER_PROVIDED;
        notes = `Identified need: ${need}`;
        passedCount++;
        evidenceList.push(`Business need identified: ${need}`);
      }
    } else if (criterion.id === "decision_maker") {
      const contact = String(lead.contactName || "").trim();
      const role = String(lead.contactRole || "").trim();
      if (!contact || contact === "RESEARCH REQUIRED") {
        result = "UNKNOWN";
        evidenceType = EVIDENCE_TYPES.RESEARCH_REQUIRED;
        notes = "Contact person and buying authority unknown.";
        missingInformation.push("Decision-Maker Name & Role");
      } else {
        result = "PASS";
        evidenceType = lead.evidence && lead.evidence.includes("VERIFIED") ? EVIDENCE_TYPES.VERIFIED : EVIDENCE_TYPES.USER_PROVIDED;
        notes = `Contact person: ${contact}${role && role !== "RESEARCH REQUIRED" ? ` (${role})` : ""}`;
        passedCount++;
        evidenceList.push(`Decision maker: ${contact}`);
      }
    } else {
      result = "UNKNOWN";
      evidenceType = EVIDENCE_TYPES.RESEARCH_REQUIRED;
      notes = "Custom criterion requires external research.";
      missingInformation.push(criterion.name);
    }

    criteriaResults.push({
      criterionId: criterion.id,
      criterionName: criterion.name,
      required: Boolean(criterion.required),
      result,
      evidenceType,
      notes
    });
  }

  // Determine Qualification Status strictly
  let status = QUALIFICATION_STATUSES.NEEDS_RESEARCH;
  let reasoning = "";

  if (hasUnqualifiedFail) {
    status = QUALIFICATION_STATUSES.UNQUALIFIED;
    reasoning = "Available evidence indicates the lead does not match the required qualification criteria.";
  } else if (missingInformation.length === 0 && passedCount === totalEvaluated) {
    status = QUALIFICATION_STATUSES.QUALIFIED;
    reasoning = "Available evidence satisfies all defined qualification criteria.";
  } else if (passedCount > 0) {
    status = QUALIFICATION_STATUSES.POSSIBLE_FIT;
    reasoning = `Evidence confirms ${passedCount} criteria, but important qualification information (${missingInformation.join(", ")}) is missing.`;
  } else {
    status = QUALIFICATION_STATUSES.NEEDS_RESEARCH;
    reasoning = "Insufficient evidence to make a reliable qualification decision; core criteria require external research.";
  }

  // Explicit rubric calculation: NOT an AI confidence percentage
  const score = `${passedCount}/${totalEvaluated} criteria verified`;

  let recommendedNextAction = "";
  if (status === QUALIFICATION_STATUSES.QUALIFIED) {
    recommendedNextAction = "Proceed to Outreach Agent for personalized value proposition messaging.";
  } else if (status === QUALIFICATION_STATUSES.POSSIBLE_FIT) {
    recommendedNextAction = `Conduct targeted research to verify: ${missingInformation.join(", ")} before initiating outreach.`;
  } else if (status === QUALIFICATION_STATUSES.NEEDS_RESEARCH) {
    recommendedNextAction = "Gather primary company information, website, and operating profile before qualification.";
  } else {
    recommendedNextAction = "Archive lead or exclude from commercial outreach campaigns.";
  }

  return {
    status,
    score,
    passedCount,
    totalCriteria: totalEvaluated,
    criteriaResults,
    evidence: evidenceList,
    missingInformation,
    reasoning,
    recommendedNextAction,
    qualifiedAt: new Date().toISOString()
  };
}

/**
 * Formats a clean, structured Lead Qualification Report matching specification.
 */
function formatLeadQualificationReport(evaluations = [], rubric = null) {
  const activeRubric = rubric || buildDefaultRubric({ isDefaultTemplate: true });

  let out = "LEAD QUALIFICATION REPORT\n\n";

  out += "Qualification Criteria:\n";
  if (activeRubric.isDefaultTemplate) {
    out += "- NOTE: Explicit ICP was not supplied in request. Constructed baseline qualification criteria template from business context:\n";
  }
  for (const c of activeRubric.criteria) {
    out += `- ${c.name}: ${c.description}${c.targetValue ? ` [Target: ${c.targetValue}]` : ""}${c.required ? " (REQUIRED)" : ""}\n`;
  }
  out += "\n";

  if (evaluations.length === 0) {
    out += "No leads evaluated.\n";
    return out;
  }

  // Individual Lead Breakdowns
  for (const item of evaluations) {
    const lead = item.lead;
    const q = item.qualification;

    out += `Lead: ${lead.companyName}\n`;
    out += `Website: ${lead.website}\n`;
    out += `Industry: ${lead.industry}\n`;
    out += `Location: ${lead.location}\n`;
    out += "Criteria Results:\n";

    for (const cr of q.criteriaResults) {
      const symbol = cr.result === "PASS" ? "✓" : cr.result === "FAIL" ? "✗" : "?";
      out += `  ${symbol} ${cr.criterionName} — ${cr.evidenceType} (${cr.notes})\n`;
    }

    out += `Status:\n${q.status}\n\n`;
    out += `Score:\n${q.score} (explicit rubric calculation, no conversion probabilities)\n\n`;
    out += `Reason:\n${q.reasoning}\n\n`;
    out += `Missing Information:\n${q.missingInformation.length > 0 ? q.missingInformation.join(", ") : "None"}\n\n`;
    out += `Recommended Next Action:\n${q.recommendedNextAction}\n\n`;
    out += "----------------------------------------\n";
  }

  // Summary grouped by status (if multiple leads)
  if (evaluations.length > 1) {
    out += "\nSUMMARY BY STATUS:\n\n";

    const statuses = [
      QUALIFICATION_STATUSES.QUALIFIED,
      QUALIFICATION_STATUSES.POSSIBLE_FIT,
      QUALIFICATION_STATUSES.NEEDS_RESEARCH,
      QUALIFICATION_STATUSES.UNQUALIFIED
    ];

    for (const st of statuses) {
      const group = evaluations.filter(e => e.qualification.status === st);
      out += `${st} (${group.length}):\n`;
      if (group.length === 0) {
        out += "  (none)\n";
      } else {
        for (const item of group) {
          out += `  - ${item.lead.companyName} [${item.qualification.score}] — ${item.qualification.reasoning}\n`;
        }
      }
      out += "\n";
    }
  }

  return out;
}

/**
 * Main Lead Qualification Agent skill execution.
 */
async function runLeadQualification(message, askAI, options = {}) {
  const sources = options.sources || [];
  const sourcesText = formatSourcesContext(sources);
  const leads = loadLeads();

  const msgText = (message || "").toLowerCase().trim();

  // 1. Handling Filtering Requests (e.g. "show qualified leads", "show possible-fit leads")
  const isFiltering = /show|filter|list|which\s+leads\s+are/i.test(msgText);
  if (isFiltering) {
    let targetStatus = null;
    if (msgText.includes("qualified") && !msgText.includes("unqualified")) {
      targetStatus = QUALIFICATION_STATUSES.QUALIFIED;
    } else if (msgText.includes("possible-fit") || msgText.includes("possible fit")) {
      targetStatus = QUALIFICATION_STATUSES.POSSIBLE_FIT;
    } else if (msgText.includes("unqualified")) {
      targetStatus = QUALIFICATION_STATUSES.UNQUALIFIED;
    } else if (msgText.includes("needing research") || msgText.includes("needs research") || msgText.includes("needs-research")) {
      targetStatus = QUALIFICATION_STATUSES.NEEDS_RESEARCH;
    }

    if (leads.length === 0) {
      return `LEAD QUALIFICATION REPORT\n\nStatus: NO LEADS STORED\nNo leads are currently stored in data/leads.json.\n\nRecommended Action:\n- Import or generate leads first using the Lead Generation Agent (e.g., node index.js "find potential customers" or node index.js --file leads.csv).\n`;
    }

    const matched = targetStatus ? leads.filter(l => l.qualificationStatus === targetStatus) : leads;

    let filterReport = `LEAD QUALIFICATION FILTER REPORT\n\nFilter Status: ${targetStatus || "ALL LEADS"}\nTotal Stored Leads: ${leads.length}\nMatching Leads Found: ${matched.length}\n\n`;

    if (matched.length === 0) {
      filterReport += `No leads currently have the status "${targetStatus}".\n`;
      const otherCounts = [
        `QUALIFIED: ${leads.filter(l => l.qualificationStatus === QUALIFICATION_STATUSES.QUALIFIED).length}`,
        `POSSIBLE_FIT: ${leads.filter(l => l.qualificationStatus === QUALIFICATION_STATUSES.POSSIBLE_FIT).length}`,
        `NEEDS_RESEARCH: ${leads.filter(l => l.qualificationStatus === QUALIFICATION_STATUSES.NEEDS_RESEARCH).length}`,
        `UNQUALIFIED: ${leads.filter(l => l.qualificationStatus === QUALIFICATION_STATUSES.UNQUALIFIED).length}`
      ];
      filterReport += `Current status counts across stored leads:\n- ${otherCounts.join("\n- ")}\n\nRecommended Action:\nRun "node index.js 'qualify my leads'" to evaluate or update qualification statuses against a rubric.\n`;
      return filterReport;
    }

    for (let i = 0; i < matched.length; i++) {
      const l = matched[i];
      filterReport += `${i + 1}. Company: ${l.companyName}\n`;
      filterReport += `   Website: ${l.website}\n`;
      filterReport += `   Industry: ${l.industry}\n`;
      filterReport += `   Location: ${l.location}\n`;
      filterReport += `   Contact: ${l.contactName}${l.contactRole && l.contactRole !== "RESEARCH REQUIRED" ? ` (${l.contactRole})` : ""}\n`;
      filterReport += `   Qualification Status: ${l.qualificationStatus}\n`;
      filterReport += `   Fit Reason: ${l.fitReason || "Not evaluated"}\n`;
      filterReport += `   Evidence: ${l.evidence}\n`;
      if (l.qualification && l.qualification.missingInformation) {
        filterReport += `   Missing Information: ${l.qualification.missingInformation.join(", ") || "None"}\n`;
      }
      filterReport += "\n";
    }

    filterReport += `\nRECOMMENDED NEXT ACTION:\n`;
    if (targetStatus === QUALIFICATION_STATUSES.QUALIFIED) {
      filterReport += `- Qualified leads are ready for outreach messaging via Outreach Agent.\n`;
    } else {
      filterReport += `- Gather missing verification points before moving leads into active outreach pipelines.\n`;
    }

    return filterReport;
  }

  // 2. Handling Qualification Requests
  if (leads.length === 0) {
    const emptyRubric = buildDefaultRubric({ isDefaultTemplate: true });
    let emptyMsg = `LEAD QUALIFICATION REPORT\n\n`;
    emptyMsg += `Status: NO STORED LEADS FOUND\n`;
    emptyMsg += `No stored leads were found in data/leads.json.\n\n`;
    emptyMsg += `Qualification Criteria Template:\n`;
    for (const c of emptyRubric.criteria) {
      emptyMsg += `- ${c.name}: ${c.description}${c.required ? " (REQUIRED)" : ""}\n`;
    }
    emptyMsg += `\nTo qualify leads:\n`;
    emptyMsg += `1. Ingest or generate leads first via the Lead Generation Agent:\n`;
    emptyMsg += `   - Example: node index.js "find potential customers for my business"\n`;
    emptyMsg += `   - Or supply a CSV: node index.js --file leads.csv "generate leads from leads.csv"\n`;
    emptyMsg += `2. Then run qualification:\n`;
    emptyMsg += `   - node index.js "qualify my leads"\n`;
    return emptyMsg;
  }

  // Determine target leads (single lead vs batch)
  let targetLeads = leads;
  const leadIdMatch = message.match(/(lead-\d+-[a-z0-9]+)/i);
  if (leadIdMatch && leadIdMatch[1]) {
    const found = leads.find(l => l.id.toLowerCase() === leadIdMatch[1].toLowerCase());
    if (found) targetLeads = [found];
  } else {
    // Check if a specific company name was mentioned
    for (const l of leads) {
      if (l.companyName && l.companyName.length > 2 && msgText.includes(l.companyName.toLowerCase())) {
        targetLeads = [l];
        break;
      }
    }
  }

  // Parse or construct Rubric / ICP
  const parsedIcp = parseIcpFromText(message);
  let rubric;
  if (parsedIcp) {
    rubric = buildDefaultRubric({ icp: parsedIcp, isDefaultTemplate: false });
  } else {
    rubric = buildDefaultRubric({ isDefaultTemplate: true });
  }

  // Perform rigorous rubric evaluation for all target leads
  const evaluatedItems = [];
  let updatedCount = 0;

  for (const lead of targetLeads) {
    const evaluation = evaluateLeadWithRubric(lead, rubric);

    // Persist qualification results directly to data/leads.json
    const updatedRecord = updateLead(lead.id, {
      qualificationStatus: evaluation.status,
      fitReason: evaluation.reasoning,
      qualification: evaluation
    });

    if (updatedRecord) updatedCount++;
    evaluatedItems.push({
      lead: updatedRecord || lead,
      qualification: evaluation
    });
  }

  if (updatedCount > 0) {
    console.log(`\n[Lead Store] Updated qualification for ${updatedCount} lead(s) in data/leads.json.`);
  }

  // Build structured report
  const deterministicReport = formatLeadQualificationReport(evaluatedItems, rubric);

  // If askAI is provided, prompt the AI to provide evidence-based review following the exact template
  if (typeof askAI === "function") {
    const prompt = `You are the Lead Qualification Agent inside an AI Business Agent platform.

Your mission is to evaluate, qualify, and review leads against the supplied ICP and qualification rubric using ONLY available evidence.

====================
EVIDENCE RULES
====================
- USER-PROVIDED: Explicitly provided in the request or lead record.
- VERIFIED: Supported by an actual citation, local file, or verified source.
- ASSUMPTION: Plausible hypothesis for planning.
- RESEARCH REQUIRED: Information that is unknown or unverified.

NEVER fabricate company details, contact persons, emails, or operational needs.
NEVER state AI conversion probability percentages (e.g., do NOT write "85% likely to convert" or "90% chance of conversion").
Scores must represent explicit rubric calculations (e.g. "2/4 criteria verified"), never AI confidence percentages.

====================
QUALIFICATION STATUSES
====================
- UNQUALIFIED: Available evidence indicates the lead does not match defined criteria.
- POSSIBLE_FIT: Some evidence suggests a fit, but important qualification information is missing.
- QUALIFIED: The available evidence satisfies the defined qualification criteria. (Do not use casually!)
- NEEDS_RESEARCH: Insufficient evidence to make a reliable qualification decision.

====================
EVALUATED LEADS & RUBRIC
====================
${deterministicReport}

====================
RESEARCH & LEAD SOURCES
====================
${sourcesText}

====================
USER REQUEST
====================
${message}

Please output the final comprehensive LEAD QUALIFICATION REPORT following the exact structure shown above, ensuring all evidence tags, statuses, explicit rubric scores, reasons, missing information, and recommended next actions are clearly presented.`;

    try {
      const aiResponse = await askAI(prompt);
      return aiResponse;
    } catch {
      return deterministicReport;
    }
  }

  return deterministicReport;
}

module.exports = {
  runLeadQualification,
  evaluateLeadWithRubric,
  buildDefaultRubric,
  parseIcpFromText,
  formatLeadQualificationReport,
  QUALIFICATION_STATUSES,
  EVIDENCE_TYPES
};
