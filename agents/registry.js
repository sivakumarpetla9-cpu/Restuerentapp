const { runDiscovery } = require("../skills/discovery");
const { runStrategy } = require("../skills/strategy");
const { runProduct } = require("../skills/product");
const { runFinance } = require("../skills/finance");
const { runOutreach } = require("../skills/outreach");
const { runResearch } = require("../skills/research");
const { runLeadGeneration } = require("../skills/leadGeneration");
const { runLeadQualification } = require("../skills/leadQualification");
const { runSalesPipeline } = require("../skills/salesPipeline");
const { getIndustryProfile, setIndustryProfile, resetIndustryProfile } = require("../config/industry");

const CORE_AGENTS = [
  {
    id: "discovery",
    name: "Discovery Agent",
    category: "business",
    description: "Discovers and validates business opportunities using a rigorous 4-filter framework.",
    enabled: true,
    run: (message, askAI) => runDiscovery(message, askAI)
  },
  {
    id: "strategy",
    name: "Strategy Agent",
    category: "business",
    description: "Turns business information and verified research into practical, evidence-backed strategy without fabricating numbers.",
    enabled: true,
    run: (message, askAI) => runStrategy(message, askAI)
  },
  {
    id: "product",
    name: "Product Agent",
    category: "product",
    description: "Designs MVP scope, system architecture, data models, and execution plans.",
    enabled: true,
    run: (message, askAI) => runProduct(message, askAI)
  },
  {
    id: "finance",
    name: "Finance Agent",
    category: "finance",
    description: "Analyzes revenue models, unit economics, cost structures, and break-even points without invented numbers.",
    enabled: true,
    run: (message, askAI) => runFinance(message, askAI)
  },
  {
    id: "outreach",
    name: "Outreach Agent",
    category: "sales",
    description: "Develops ideal customer profiles, outreach channels, qualification criteria, and sales pipelines.",
    enabled: true,
    run: (message, askAI) => runOutreach(message, askAI)
  },
  {
    id: "research",
    name: "Research Agent",
    category: "research",
    description: "Extracts and verifies business facts from local files, URLs, and pasted research text without paid APIs.",
    enabled: true,
    run: (message, askAI, options = {}) => runResearch(message, askAI, options.sources || [])
  },
  {
    id: "lead-generation",
    name: "Lead Generation Agent",
    category: "sales",
    description: "Extracts, verifies, and qualifies business leads from local sources and files without inventing contact data.",
    enabled: true,
    run: (message, askAI, options = {}) => runLeadGeneration(message, askAI, options)
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification Agent",
    category: "sales",
    description: "Evaluates and qualifies leads against configurable ICP rubrics using evidence without inventing data.",
    enabled: true,
    run: (message, askAI, options = {}) => runLeadQualification(message, askAI, options)
  },
  {
    id: "sales-pipeline",
    name: "Sales Pipeline Agent",
    category: "sales",
    description: "Manages commercial lead pipeline stages, follow-up scheduling, and deal status transitions without fabricated history.",
    enabled: true,
    run: (message, askAI, options = {}) => runSalesPipeline(message, askAI, options)
  }
];

// Active registry map (id -> agent object)
let registry = new Map();

function initRegistry() {
  registry.clear();
  for (const agent of CORE_AGENTS) {
    registry.set(agent.id, { ...agent });
  }
}

initRegistry();

function getAgent(id) {
  if (!id || typeof id !== "string") return null;
  const key = id.toLowerCase().trim();
  return registry.get(key) || null;
}

function getAgents() {
  return Array.from(registry.values());
}

function hasAgent(id) {
  if (!id || typeof id !== "string") return false;
  return registry.has(id.toLowerCase().trim());
}

function getAgentsByCategory(category) {
  if (!category || typeof category !== "string") return [];
  const target = category.toLowerCase().trim();
  return getAgents().filter(a => a.category.toLowerCase() === target);
}

function isAgentEnabled(id) {
  const agent = getAgent(id);
  return Boolean(agent && agent.enabled);
}

function setAgentEnabled(id, enabled) {
  const agent = getAgent(id);
  if (!agent) {
    return false;
  }
  agent.enabled = Boolean(enabled);
  return true;
}

function registerAgent(agent) {
  if (!agent || typeof agent !== "object") {
    throw new Error("Agent definition must be an object.");
  }
  if (!agent.id || typeof agent.id !== "string") {
    throw new Error("Agent must have a valid string id.");
  }
  if (!agent.name || typeof agent.name !== "string") {
    throw new Error("Agent must have a valid string name.");
  }
  if (typeof agent.run !== "function") {
    throw new Error("Agent must have a runnable 'run' function.");
  }

  const normalized = {
    id: agent.id.toLowerCase().trim(),
    name: agent.name.trim(),
    category: (agent.category || "custom").toLowerCase().trim(),
    description: agent.description || "",
    enabled: agent.enabled !== false,
    run: agent.run
  };

  registry.set(normalized.id, normalized);
  return normalized;
}

function applyIndustryProfile(nameOrConfig) {
  const profile = setIndustryProfile(nameOrConfig);
  const enabledSet = new Set(profile.enabledAgents.map(a => a.toLowerCase().trim()));

  for (const [id, agent] of registry.entries()) {
    agent.enabled = enabledSet.has(id);
  }

  return {
    industry: profile.industry,
    name: profile.name,
    enabledAgents: getAgents().filter(a => a.enabled).map(a => a.id)
  };
}

function resetRegistry() {
  resetIndustryProfile();
  initRegistry();
  return getAgents();
}

module.exports = {
  getAgent,
  getAgents,
  hasAgent,
  getAgentsByCategory,
  isAgentEnabled,
  setAgentEnabled,
  registerAgent,
  applyIndustryProfile,
  resetRegistry
};
