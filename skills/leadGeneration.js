const { formatSourcesContext } = require("./research");
const { addLead, loadLeads } = require("../memory/leadStore");

function parseCsvContent(text) {
  if (!text || typeof text !== "string") return [];
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, "").toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCells = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = rawCells[idx] || "";
    });

    const companyName = row.company || row.companyname || row.business || row.name || row.restaurant || "";
    if (companyName) {
      rows.push({
        companyName,
        website: row.website || row.url || "RESEARCH REQUIRED",
        industry: row.industry || row.type || row.category || "RESEARCH REQUIRED",
        location: row.location || row.city || row.address || "RESEARCH REQUIRED",
        contactName: row.contact || row.contactname || row.person || "RESEARCH REQUIRED",
        contactRole: row.role || row.title || "RESEARCH REQUIRED",
        email: row.email || "RESEARCH REQUIRED",
        phone: row.phone || row.tel || "RESEARCH REQUIRED",
        notes: row.notes || row.description || "",
        sourceType: "FILE",
        evidence: "USER-PROVIDED (CSV row)"
      });
    }
  }

  return rows;
}

function extractLeadsFromResponse(responseText, sources = []) {
  const leads = [];
  if (!responseText) return leads;

  // Pattern to extract numbered or bulleted company blocks
  // e.g.:
  // 1. Company: Joe's Pizza
  //    Website: https://...
  //    Industry: Restaurant
  //    Location: New York
  //    ...
  const companyRegex = /(?:^|\n)(?:\d+[\.\)]|\*|-)?\s*Company:\s*([^\n\r]+)/gi;
  const sections = responseText.split(companyRegex);

  // sections[0] is header preamble; pairs of (companyName, body) follow
  for (let i = 1; i < sections.length; i += 2) {
    const companyName = sections[i].trim().replace(/^[*_~`]+|[*_~`]+$/g, "");
    const body = sections[i + 1] || "";

    const getField = (fieldRegex, fallback = "RESEARCH REQUIRED") => {
      const match = body.match(fieldRegex);
      if (match && match[1]) {
        const val = match[1].trim().replace(/^[*_~`]+|[*_~`]+$/g, "");
        return val.length > 0 ? val : fallback;
      }
      return fallback;
    };

    const website = getField(/Website:\s*([^\n\r]+)/i);
    const industry = getField(/Industry:\s*([^\n\r]+)/i);
    const location = getField(/Location:\s*([^\n\r]+)/i);
    const contact = getField(/Contact(?:\s*Name|\s*Person)?:\s*([^\n\r]+)/i);
    const evidence = getField(/Evidence:\s*([^\n\r]+)/i, "VERIFIED from source");
    const potentialNeed = getField(/Potential\s*Need:\s*([^\n\r]+)/i);
    const rawQualification = getField(/Qualification(?:\s*Status)?:\s*([^\n\r]+)/i, "NEEDS_RESEARCH");
    const fitReason = getField(/Fit\s*Reason:\s*([^\n\r]+)/i);
    const missingInfo = getField(/Missing(?:\s*Information)?:\s*([^\n\r]+)/i);

    let qualificationStatus = "NEEDS_RESEARCH";
    if (/QUALIFIED/i.test(rawQualification) && !/UNQUALIFIED|NEEDS/i.test(rawQualification)) {
      qualificationStatus = "QUALIFIED";
    } else if (/POSSIBLE[-_ ]FIT/i.test(rawQualification)) {
      qualificationStatus = "POSSIBLE_FIT";
    } else if (/UNQUALIFIED/i.test(rawQualification)) {
      qualificationStatus = "UNQUALIFIED";
    }

    const primarySource = sources.length > 0 ? sources[0].source : "User prompt";
    const primarySourceType = sources.length > 0 ? sources[0].sourceType : "USER_INPUT";

    leads.push({
      companyName,
      website,
      industry,
      location,
      contactName: contact,
      evidence,
      potentialNeed,
      qualificationStatus,
      fitReason,
      notes: missingInfo !== "RESEARCH REQUIRED" ? `Missing: ${missingInfo}` : "",
      source: primarySource,
      sourceType: primarySourceType
    });
  }

  // Also extract any direct CSV rows from sources if not already captured
  for (const s of sources) {
    if (s.sourceType === "FILE" && s.source && s.source.toLowerCase().endsWith(".csv") && s.content) {
      const csvRows = parseCsvContent(s.content);
      for (const row of csvRows) {
        if (!leads.some(l => l.companyName.toLowerCase() === row.companyName.toLowerCase())) {
          leads.push({
            ...row,
            source: s.source,
            sourceType: "FILE",
            qualificationStatus: "POSSIBLE_FIT",
            fitReason: "Direct lead from uploaded CSV list"
          });
        }
      }
    }
  }

  return leads;
}

async function runLeadGeneration(message, askAI, options = {}) {
  const sources = options.sources || [];
  const sourcesText = formatSourcesContext(sources);

  const prompt = `You are the Lead Generation Agent inside an AI Business Agent platform.

Your mission is to find, extract, verify, and qualify potential commercial leads and customer targets using ONLY available evidence.

====================
EVIDENCE SOURCES ALLOWED
====================
You must base your lead extraction exclusively on:
1. Provided research sources (files such as .csv, .json, .txt, .md, or URLs fetched).
2. Direct text, lead lists, or notes supplied in the user request.
3. Information and target customer criteria stored in the memory context.

====================
STRICT PROHIBITION AGAINST FABRICATION
====================
1. NEVER invent fictitious company names, people, emails, phone numbers, LinkedIn profiles, or websites.
2. If contact details (name, email, phone, website) are not present in the provided sources, you MUST state: "RESEARCH REQUIRED".
3. Never pretend that you browsed the unrestricted public internet.
4. If no external sources with specific companies are provided, analyze the User Context/ICP, define concrete target profiles, explain where and how to gather verified leads locally, and outline qualification criteria.

====================
QUALIFICATION RULES
====================
Assign each lead strictly to one of these 4 qualification statuses:
- UNQUALIFIED: Evidence confirms it does not match criteria or problem space.
- POSSIBLE_FIT: Plausible match with potential need, but key verification is missing.
- QUALIFIED: Direct evidence confirms it matches ICP and has a verifiable need.
- NEEDS_RESEARCH: Insufficient evidence available to evaluate fit.

Never mark a lead as QUALIFIED unless evidence directly confirms it.

====================
REQUIRED OUTPUT STRUCTURE
====================

LEAD GENERATION REPORT

TARGET & SEGMENT:
- Target customer description from business context.

ICP (IDEAL CUSTOMER PROFILE):
- Industry, size, operational profile, and specific pain points.

SOURCES ANALYZED:
- List of provided files, URLs, or prompt notes.

LEADS IDENTIFIED & QUALIFIED:
For each lead found, format as:
1. Company: [Company Name]
   Website: [Website URL or RESEARCH REQUIRED]
   Industry: [Industry or RESEARCH REQUIRED]
   Location: [Location or RESEARCH REQUIRED]
   Contact: [Contact Name and Role or RESEARCH REQUIRED]
   Evidence: [Source citation or USER-PROVIDED]
   Potential Need: [Specific operational need or problem based on evidence]
   Qualification Status: [UNQUALIFIED | POSSIBLE_FIT | QUALIFIED | NEEDS_RESEARCH]
   Fit Reason: [Factual reason explaining the status based on evidence]
   Missing Information: [Specific information requiring further research]

RECOMMENDED OUTREACH ACTIONS:
- RECOMMENDATION: [Practical, non-spammy initial outreach step]

RESEARCH REQUIRED:
- RESEARCH REQUIRED: [Missing data or contact points that must be verified]

SUMMARY OF LEADS:
TOTAL EXTRACTED: [Number]
QUALIFIED: [Number]
POSSIBLE FIT: [Number]
NEEDS RESEARCH: [Number]
UNQUALIFIED: [Number]

====================
RESEARCH & LEAD SOURCES PROVIDED:
====================
${sourcesText}

====================
USER REQUEST:
====================
${message}`;

  const response = await askAI(prompt);

  // Extract identified leads and persist them to local lead storage (data/leads.json)
  try {
    const extractedLeads = extractLeadsFromResponse(response, sources);
    if (extractedLeads.length > 0) {
      let savedCount = 0;
      for (const item of extractedLeads) {
        const res = addLead(item);
        if (res && res.success) savedCount++;
      }
      if (savedCount > 0) {
        console.log(`\n[Lead Store] Saved ${savedCount} lead(s) to data/leads.json.`);
      }
    }
  } catch (err) {
    // Non-blocking error for storage
  }

  return response;
}

module.exports = {
  runLeadGeneration,
  extractLeadsFromResponse,
  parseCsvContent
};
