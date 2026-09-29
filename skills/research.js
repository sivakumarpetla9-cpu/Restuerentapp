function formatSourcesContext(sources = []) {
  if (!sources || sources.length === 0) {
    return "NO EXTERNAL RESEARCH SOURCES PROVIDED.\n(Tip: Provide sources via --file <path>, --url <url>, --text <content>, or by including URLs/notes directly in your prompt.)";
  }

  return sources.map((s, idx) => {
    const status = s.success !== false ? "SUCCESSFULLY LOADED" : `FAILED TO LOAD (${s.error || "Unknown error"})`;
    const type = s.sourceType || "UNKNOWN";
    const src = s.source || `Source #${idx + 1}`;
    const body = s.content ? s.content : `[No readable content available. Error: ${s.error || "empty content"}]`;

    return `=======================================================
[SOURCE #${idx + 1}] (${type}) - ${src}
Status: ${status}
-------------------------------------------------------
${body}
=======================================================`;
  }).join("\n\n");
}

function extractVerifiedClaims(responseText) {
  if (!responseText) return [];
  const lines = responseText.split(/\r?\n/);
  const verified = [];

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*•\d.]+\s*/, "");
    if (/^\bVERIFIED\b/i.test(trimmed) || /^\[VERIFIED\]/i.test(trimmed)) {
      const fact = trimmed.replace(/^\[?VERIFIED\]?\s*[:\-–]?\s*/i, "").trim();
      if (!fact || /^(evidence|findings|status|claims|facts|summary)$/i.test(fact)) {
        continue;
      }
      if (!verified.includes(fact)) {
        verified.push(fact);
      }
    }
  }

  return verified;
}

async function runResearch(message, askOllama, researchSources = []) {
  const sourcesText = formatSourcesContext(researchSources);

  const prompt = `You are the Research Agent inside an AI Business Agent.

You operate purely on LOCAL RESEARCH INPUTS. No paid search APIs are used.
Your job is to analyze the research question using ONLY:
1. The user's request and questions.
2. The provided research sources (URLs fetched, local files read, pasted notes).
3. Information already in the supplied memory context.

====================
EVIDENCE POLICY (MANDATORY)
====================
Every statement must be strictly labeled with one of the following 6 categories:

- USER-PROVIDED: Information explicitly supplied by the user about their business or context.
- VERIFIED: Concrete facts directly stated in the provided research material. MUST cite the specific source URL, file, or document!
- CALCULATED: Mathematical calculation derived strictly from USER-PROVIDED or VERIFIED numbers.
- ASSUMPTION: Working hypotheses or inferences where direct evidence is incomplete.
- RECOMMENDATION: Actionable strategic advice or next steps suggested for the business.
- RESEARCH REQUIRED: Unknowns, missing data, or questions that could not be verified by the provided sources.

====================
ABSOLUTE FACTUALITY RULES
====================
1. NEVER fabricate facts, sources, URLs, competitor names, pricing, statistics, market sizes, customer counts, or conversion rates.
2. If a competitor or price is not explicitly documented in the provided material, do NOT invent one. Write: "RESEARCH REQUIRED: Competitor pricing and capabilities."
3. Never pretend that you browsed the live web. State clearly which provided sources were analyzed.
4. If no external sources were provided, perform internal evidence triage: list what is known, what is assumed, and what must be validated.

====================
REQUIRED OUTPUT STRUCTURE
====================

1. RESEARCH OBJECTIVE
- Clarify the core business question.

2. SOURCES ANALYZED
- List each provided source with its type (URL / FILE / PASTED_TEXT) and status.

3. VERIFIED EVIDENCE
- Detail every verified fact from the provided sources.
- Format:
  - VERIFIED: [Fact description] (Source: [Source name or URL])

4. BUSINESS & MARKET FINDINGS
- Identify key takeaways, comparing them against the user's business context.
- Label every bullet with [USER-PROVIDED], [VERIFIED], [CALCULATED], or [ASSUMPTION].

5. STRATEGIC RECOMMENDATIONS
- Concrete, actionable recommendations based only on the evidence.
- Format:
  - RECOMMENDATION: [Specific action or experiment]

6. UNVERIFIED GAPS & RESEARCH REQUIRED
- What is still missing or unverified?
- Format:
  - RESEARCH REQUIRED: [Specific missing information needed]

7. FINAL EVIDENCE SUMMARY
WHAT WE KNOW
- Only USER-PROVIDED and VERIFIED facts.

WHAT WE ASSUME
- Explicit assumptions only.

WHAT MUST BE VALIDATED
- List of remaining questions.

NEXT 3 ACTIONS
- Immediate next practical steps.

====================
RESEARCH SOURCES PROVIDED:
====================
${sourcesText}

====================
USER REQUEST:
====================
${message}`;

  const response = await askOllama(prompt);
  return response;
}

module.exports = {
  runResearch,
  extractVerifiedClaims,
  formatSourcesContext
};
