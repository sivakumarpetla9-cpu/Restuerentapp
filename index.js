const { route, resolveIntent } = require("./agents/router");
const { getAgent, hasAgent, isAgentEnabled } = require("./agents/registry");
const { extractVerifiedClaims, formatSourcesContext } = require("./skills/research");
const { validateOutput } = require("./tools/outputGuard");
const {
  loadMemory,
  addInteraction,
  extractBusinessFacts,
  addResearch,
  getResearchContext
} = require("./memory/store");
const { parseResearchInputs } = require("./tools/researchLoader");
const { getProvider } = require("./providers");

const defaultProvider = getProvider();
const askAI = prompt => defaultProvider.generate(prompt);


function printEvidenceStatus(validation) {
  console.log("\n========== EVIDENCE STATUS ==========\n");

  const groups = [
    "USER-PROVIDED",
    "VERIFIED",
    "CALCULATED",
    "ASSUMPTION",
    "RECOMMENDATION",
    "RESEARCH REQUIRED",
    "UNCLASSIFIED"
  ];

  for (const type of groups) {
    const items = validation.claims.filter(
      claim => claim.type === type
    );

    if (items.length > 0) {
      console.log(`[${type}]`);

      for (const item of items) {
        console.log(`- ${item.text}`);
      }

      console.log("");
    }
  }

  console.log("=====================================\n");
}

function printUsage() {
  console.log("AI Business Agent - Local Ollama Edition\n");
  console.log("Usage: node index.js [options] \"<request>\"\n");
  console.log("Options:");
  console.log("  --file, -f <path>     Load local research file (.txt, .md, .json, .csv)");
  console.log("  --url, -u <url>       Fetch and clean content from web URL directly");
  console.log("  --text, -t <content>  Provide pasted research notes or competitor data");
  console.log("\nExamples:");
  console.log("  node index.js \"Find a business idea\"");
  console.log("  node index.js \"Create a business strategy\"");
  console.log("  node index.js --file ./competitor-notes.txt \"Research competitor pricing\"");
  console.log("  node index.js --url https://example.com/pricing \"Analyze this competitor\"");
  console.log("  node index.js --text \"Competitor X charges $29/mo with no setup fee\" \"Research pricing\"");
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printUsage();
    return;
  }

  // Parse research flags (--file, --url, --text) and inline URLs
  const { message: parsedMessage, sources } = await parseResearchInputs(argv);

  let message = parsedMessage;

  // If user only provided sources without a query, provide a default research query
  if (!message && sources.length > 0) {
    message = "Analyze and extract verified business research from the provided sources";
  }

  if (!message) {
    printUsage();
    return;
  }

  const memory = loadMemory();

  // If sources were loaded, display feedback
  if (sources.length > 0) {
    console.log("========== RESEARCH INPUTS DETECTED ==========");
    for (const src of sources) {
      const status = src.success !== false ? `Loaded (${src.content?.length || 0} chars)` : `Error: ${src.error}`;
      console.log(`- [${src.sourceType}] ${src.source} -> ${status}`);
    }
    console.log("==============================================\n");
  }

  // Route to the appropriate agent
  let selectedRoute = route(message);

  // If sources were explicitly loaded and router picked strategy without specific keywords, keep as routed or research
  if (sources.length > 0 && (selectedRoute === "strategy" || !selectedRoute) && !message.toLowerCase().includes("strategy") && !message.toLowerCase().includes("business plan")) {
    selectedRoute = "research";
  }

  if (!selectedRoute) {
    const rawTarget = resolveIntent(message);
    const candidate = getAgent(rawTarget);
    if (candidate && !candidate.enabled) {
      console.log(`The "${candidate.name}" (${rawTarget}) is currently disabled.`);
    } else {
      console.log(`No available agent found to handle this request.`);
    }
    return;
  }

  const agent = getAgent(selectedRoute);
  if (!agent || !agent.enabled) {
    console.log(`The "${selectedRoute}" agent is not available or is currently disabled.`);
    return;
  }

  const memoryContext = JSON.stringify({
    business: memory.business,
    facts: memory.facts,
    preferences: memory.preferences,
    decisions: memory.decisions,
    research: memory.research || []
  }, null, 2);

  const pastResearchSummary = getResearchContext();

  let enrichedMessage = `MEMORY CONTEXT:
${memoryContext}

PAST VERIFIED RESEARCH:
${pastResearchSummary}

CURRENT USER REQUEST:
${message}`;

  // If sources were provided for non-research skill (e.g. strategy), supply them into the context
  if (sources.length > 0 && selectedRoute !== "research") {
    enrichedMessage += `\n\nCURRENTLY PROVIDED SOURCES:\n${formatSourcesContext(sources)}`;
  }

  console.log(`Route: ${selectedRoute}`);
  console.log("Thinking...\n");

  const result = await agent.run(enrichedMessage, askAI, { sources });

  const validation = validateOutput(result);

  printEvidenceStatus(validation);

  if (validation.researchRequired.length > 0) {
    console.log("⚠️  RESEARCH REQUIRED");
    console.log(
      "Some claims require external evidence before being treated as facts."
    );
    console.log("");
  }

  console.log("========== AGENT RESPONSE ==========\n");
  console.log(result);

  // If research was run, persist verified facts into memory store
  if (selectedRoute === "research") {
    const verifiedFacts = extractVerifiedClaims(result);

    if (sources.length > 0 || verifiedFacts.length > 0) {
      addResearch({
        sourceType: sources.map(s => s.sourceType).join(", ") || "PASTED_OR_PROMPT",
        source: sources.map(s => s.source).join(", ") || "User prompt",
        summary: `Research: ${message.slice(0, 100)}`,
        verifiedFacts
      });

      if (verifiedFacts.length > 0) {
        console.log(`\n[Memory Updated] Saved ${verifiedFacts.length} verified fact(s) to persistent business memory.`);
      }
    }
  }

  addInteraction(message, result);
  extractBusinessFacts(message);
}

if (require.main === module) {
  main().catch(error => {
    console.error("Agent error:", error);
  });
}

module.exports = {
  main,
  askAI,
  askOllama: askAI,
  printEvidenceStatus
};


