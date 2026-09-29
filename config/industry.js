/**
 * Industry Configuration Concept
 * 
 * Prepares the platform for future vertical agent packages:
 * - Restaurant AI
 * - School AI
 * - Real Estate AI
 * - Clinic AI
 * - E-commerce AI
 *
 * Controls which specialized agents are enabled for a specific industry profile.
 */

const INDUSTRY_PROFILES = {
  general: {
    industry: "general",
    name: "General Business AI",
    enabledAgents: [
      "discovery",
      "strategy",
      "product",
      "finance",
      "outreach",
      "research",
      "lead-generation",
      "lead-qualification",
      "sales-pipeline"
    ]
  },
  restaurant: {
    industry: "restaurant",
    name: "Restaurant AI",
    enabledAgents: [
      "research",
      "strategy",
      "outreach",
      "finance",
      "discovery",
      "product",
      "lead-generation",
      "lead-qualification",
      "sales-pipeline"
    ]
  },
  school: {
    industry: "school",
    name: "School & Education AI",
    enabledAgents: [
      "research",
      "strategy",
      "outreach",
      "lead-generation",
      "lead-qualification",
      "sales-pipeline"
    ]
  },
  "real-estate": {
    industry: "real-estate",
    name: "Real Estate AI",
    enabledAgents: [
      "research",
      "strategy",
      "outreach",
      "lead-generation",
      "lead-qualification",
      "sales-pipeline"
    ]
  },
  clinic: {
    industry: "clinic",
    name: "Clinic & Healthcare AI",
    enabledAgents: [
      "research",
      "strategy",
      "outreach",
      "lead-generation",
      "lead-qualification",
      "sales-pipeline"
    ]
  },
  ecommerce: {
    industry: "ecommerce",
    name: "E-commerce AI",
    enabledAgents: [
      "research",
      "strategy",
      "product",
      "finance",
      "outreach",
      "lead-generation",
      "lead-qualification",
      "sales-pipeline"
    ]
  }
};

let activeProfile = { ...INDUSTRY_PROFILES.general };

function getIndustryProfile(name) {
  if (!name) return { ...activeProfile };
  const key = String(name).toLowerCase().trim();
  return INDUSTRY_PROFILES[key] ? { ...INDUSTRY_PROFILES[key] } : null;
}

function setIndustryProfile(nameOrConfig) {
  if (typeof nameOrConfig === "string") {
    const profile = getIndustryProfile(nameOrConfig);
    if (!profile) {
      throw new Error(
        `Unknown industry profile: "${nameOrConfig}". Available profiles: ${Object.keys(INDUSTRY_PROFILES).join(", ")}`
      );
    }
    activeProfile = { ...profile };
  } else if (typeof nameOrConfig === "object" && nameOrConfig !== null) {
    activeProfile = {
      industry: nameOrConfig.industry || "custom",
      name: nameOrConfig.name || "Custom Industry Profile",
      enabledAgents: Array.isArray(nameOrConfig.enabledAgents)
        ? [...nameOrConfig.enabledAgents]
        : [...INDUSTRY_PROFILES.general.enabledAgents]
    };
  }
  return { ...activeProfile };
}

function resetIndustryProfile() {
  activeProfile = { ...INDUSTRY_PROFILES.general };
  return { ...activeProfile };
}

function listIndustryProfiles() {
  return Object.keys(INDUSTRY_PROFILES);
}

module.exports = {
  INDUSTRY_PROFILES,
  getIndustryProfile,
  setIndustryProfile,
  resetIndustryProfile,
  listIndustryProfiles
};
