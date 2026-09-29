const fs = require("fs");
const path = require("path");

const MEMORY_FILE = path.join(__dirname, "memory.json");

function loadMemory() {
  const defaultMemory = {
    business: {},
    decisions: [],
    facts: [],
    preferences: [],
    interactions: [],
    research: []
  };

  if (!fs.existsSync(MEMORY_FILE)) {
    return defaultMemory;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(MEMORY_FILE, "utf8")
    );

    return {
      ...defaultMemory,
      ...parsed,
      research: Array.isArray(parsed.research) ? parsed.research : []
    };
  } catch {
    return defaultMemory;
  }
}

function saveMemory(memory) {
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(memory, null, 2),
    "utf8"
  );
}

function addInteraction(userMessage, agentResponse) {
  const memory = loadMemory();

  memory.interactions.push({
    timestamp: new Date().toISOString(),
    userMessage,
    agentResponse
  });

  saveMemory(memory);
}

function updateBusiness(data) {
  const memory = loadMemory();

  memory.business = {
    ...memory.business,
    ...data
  };

  saveMemory(memory);
}

function addFact(fact) {
  const memory = loadMemory();

  if (!memory.facts.includes(fact)) {
    memory.facts.push(fact);
  }

  saveMemory(memory);
}

function addDecision(decision) {
  const memory = loadMemory();

  memory.decisions.push({
    timestamp: new Date().toISOString(),
    decision
  });

  saveMemory(memory);
}

function addResearch(entry) {
  const memory = loadMemory();

  if (!Array.isArray(memory.research)) {
    memory.research = [];
  }

  const record = {
    id: `res-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sourceType: entry.sourceType || "USER_INPUT",
    source: entry.source || "User provided research",
    summary: entry.summary || "",
    verifiedFacts: Array.isArray(entry.verifiedFacts) ? entry.verifiedFacts : []
  };

  memory.research.push(record);

  // Integrate verified research facts into shared memory facts
  if (Array.isArray(entry.verifiedFacts)) {
    for (const fact of entry.verifiedFacts) {
      const cleanFact = typeof fact === "string" ? fact.trim() : JSON.stringify(fact);
      if (cleanFact && !memory.facts.includes(cleanFact)) {
        memory.facts.push(cleanFact);
      }
    }
  }

  saveMemory(memory);
  return record;
}

function getResearchContext() {
  const memory = loadMemory();
  const research = Array.isArray(memory.research) ? memory.research : [];

  if (research.length === 0) {
    return "No verified research records stored yet.";
  }

  return research.map((r, i) => {
    const factsList = r.verifiedFacts.length > 0
      ? r.verifiedFacts.map(f => `  - [VERIFIED] ${f}`).join("\n")
      : "  - (No explicit facts extracted)";
    return `[RESEARCH SOURCE #${i + 1}]
Source (${r.sourceType}): ${r.source}
Captured: ${r.timestamp}
Summary: ${r.summary || "None"}
Verified Facts:
${factsList}`;
  }).join("\n\n");
}

function extractBusinessFacts(userMessage) {
  const memory = loadMemory();
  const text = userMessage.trim();

  if (!text) return memory;

  const lower = text.toLowerCase();

  if (
    lower.includes("my business is") ||
    lower.includes("my business:")
  ) {
    memory.business.description = text;
  }

  if (lower.includes("whatsapp") && lower.includes("restaurant")) {
    memory.business.domain = "WhatsApp restaurant ordering";
  }

  saveMemory(memory);
  return memory;
}

module.exports = {
  loadMemory,
  extractBusinessFacts,
  saveMemory,
  addInteraction,
  updateBusiness,
  addFact,
  addDecision,
  addResearch,
  getResearchContext
};
