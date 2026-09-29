function isHeaderOrDivider(line) {
  const clean = line.replace(/^[\s*\-#=>\d.]+/g, "").trim();
  if (!clean) return true;
  if (/^[-=_*~]{2,}$/.test(clean)) return true;
  if (/^(WHAT WE KNOW|WHAT WE DON'T KNOW|WHAT WE ASSUME|WHAT MUST BE VALIDATED|NEXT \d+ ACTIONS|EVIDENCE STATUS|AGENT RESPONSE|STRATEGY FRAMEWORK|FINAL OUTPUT|FINAL NOTE|OUTPUT QUALITY CHECK|TECH STACK|CORE FEATURES|USER FLOW|DEVELOPMENT PHASES|MVP SCOPE|DATA MODEL|API \/ SYSTEM FLOW|PIPELINE RULE|IDEAL CUSTOMER|IDEAL CUSTOMER PROFILE|LEAD SOURCES|OUTREACH CHANNELS|QUALIFICATION|SALES PIPELINE|VALIDATION METRICS|RESEARCH STATUS|PROVIDED SOURCES)$/i.test(clean)) {
    return true;
  }
  if (/^(USER-PROVIDED|VERIFIED|CALCULATED|ASSUMPTION|RECOMMENDATION|RESEARCH REQUIRED|UNCLASSIFIED)\s*[:\-–]?$/i.test(clean)) {
    return true;
  }
  return false;
}

function classifyClaim(text) {
  const value = text.trim();
  if (!value) return null;

  if (isHeaderOrDivider(value)) return null;

  // Check explicit labels and citations first
  if (/\bUSER[- ]PROVIDED\b/i.test(value)) {
    return { type: "USER-PROVIDED", text: value };
  }

  if (/\bVERIFIED\b/i.test(value) || /according to|source:|official source|documented source|cited source/i.test(value)) {
    return { type: "VERIFIED", text: value };
  }

  if (/\bCALCULATED\b/i.test(value) || /calculation|formula|break-even|revenue\s*=|profit\s*=|margin\s*=/i.test(value)) {
    return { type: "CALCULATED", text: value };
  }

  if (/\bASSUMPTION\b|we assume|\bassume\b|hypothetical|illustrative/i.test(value)) {
    return { type: "ASSUMPTION", text: value };
  }

  if (/\bRECOMMENDATION\b|recommend|suggest|consider|next action|\bshould\b|could try/i.test(value)) {
    return { type: "RECOMMENDATION", text: value };
  }

  if (/\bRESEARCH REQUIRED\b/i.test(value)) {
    return { type: "RESEARCH REQUIRED", text: value };
  }

  // Unsupported numeric claims without verification or labels
  if (
    /%/.test(value) ||
    /\b\d+(?:\.\d+)?\s*(?:million|billion|thousand)\b/i.test(value) ||
    /[$€£₹]\s*\d+/i.test(value)
  ) {
    return { type: "RESEARCH REQUIRED", text: value };
  }

  return { type: "UNCLASSIFIED", text: value };
}

function classifyClaims(text) {
  if (!text) return [];

  const rawLines = text.split(/\r?\n/);
  const claims = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isHeaderOrDivider(trimmed)) continue;

    // If it's a bullet point or numbered item, treat as a single claim unit
    if (/^[\*\-•]|\d+\.\s+/.test(trimmed)) {
      const cleanedLine = trimmed.replace(/^[\*\-•\d.]+\s*/, "").trim();
      const classified = classifyClaim(cleanedLine);
      if (classified) claims.push(classified);
      continue;
    }

    // Split prose paragraphs into sentences
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const classified = classifyClaim(s);
      if (classified) claims.push(classified);
    }
  }

  return claims;
}

function validateOutput(text) {
  const claims = classifyClaims(text);

  const researchRequired = claims.filter(
    claim => claim.type === "RESEARCH REQUIRED"
  );

  return {
    valid: researchRequired.length === 0,
    claims,
    researchRequired
  };
}

module.exports = {
  validateOutput,
  classifyClaims,
  classifyClaim
};
