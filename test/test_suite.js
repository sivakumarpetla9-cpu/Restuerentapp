process.env.NODE_ENV = "test";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { route } = require("../agents/router");
const { readResearchFile, parseResearchInputs, cleanHtml } = require("../tools/researchLoader");
const { classifyClaim, classifyClaims, validateOutput } = require("../tools/outputGuard");
const { loadMemory, addResearch, getResearchContext } = require("../memory/store");
const { runResearch, extractVerifiedClaims, formatSourcesContext } = require("../skills/research");

console.log("=========================================");
console.log("RUNNING AI BUSINESS AGENT TEST SUITE");
console.log("=========================================\n");

// 1. Router Tests
console.log("1. Testing Router...");
assert.strictEqual(route("research competitor pricing"), "research");
assert.strictEqual(route("competitor analysis for my market"), "research");
assert.strictEqual(route("analyze url https://example.com"), "research");
assert.strictEqual(route("discover new business ideas"), "discovery");
assert.strictEqual(route("create a business strategy"), "strategy");
assert.strictEqual(route("create a business strategy using research"), "strategy");
assert.strictEqual(route("develop a pricing strategy"), "strategy");
assert.strictEqual(route("build an mvp app"), "product");
assert.strictEqual(route("financial break even analysis"), "finance");
assert.strictEqual(route("find customers and outreach"), "outreach");
console.log("✔ All router tests passed.\n");

// 2. Research Loader Tests
console.log("2. Testing Research Loader...");
const sampleFile = path.join(__dirname, "sample_competitor.txt");
fs.writeFileSync(sampleFile, "Competitor EasyOrder charges $45/month with 500 orders included.", "utf8");

const loaded = readResearchFile(sampleFile);
assert.strictEqual(loaded.success, true);
assert.strictEqual(loaded.sourceType, "FILE");
assert(loaded.content.includes("$45/month"));

const missing = readResearchFile("./non_existent_file_12345.txt");
assert.strictEqual(missing.success, false);
assert(missing.error.includes("File not found"));

const htmlSample = "<div><h1>Title</h1><script>evil()</script><p>Clean &amp; simple</p></div>";
const cleanedHtml = cleanHtml(htmlSample);
assert(!cleanedHtml.includes("<script>"));
assert(cleanedHtml.includes("Clean & simple"));
console.log("✔ All research loader file & HTML tests passed.\n");

// 3. CLI Input Parser Tests
console.log("3. Testing CLI Input Parser...");
async function testCliParser() {
  const parsed = await parseResearchInputs([
    "--file", sampleFile,
    "--text", "Competitor B charges $19/mo",
    "Research competitor pricing for restaurant ordering"
  ]);

  assert.strictEqual(parsed.message, "Research competitor pricing for restaurant ordering");
  assert.strictEqual(parsed.sources.length, 2);
  assert.strictEqual(parsed.sources[0].sourceType, "FILE");
  assert.strictEqual(parsed.sources[1].sourceType, "PASTED_TEXT");
  assert(parsed.sources[1].content.includes("$19/mo"));
}

testCliParser().then(async () => {
  console.log("✔ CLI input parsing passed.\n");

  // 4. Output Guard Tests
  console.log("4. Testing Output Guard Claim Classification...");
  const cUser = classifyClaim("USER-PROVIDED: Target customer is local fast-casual restaurants.");
  assert.strictEqual(cUser.type, "USER-PROVIDED");

  const cVer = classifyClaim("VERIFIED: Competitor A costs $29/mo (Source: competitor website)");
  assert.strictEqual(cVer.type, "VERIFIED");

  const cCalc = classifyClaim("CALCULATED: Monthly margin = $50 revenue - $10 server cost = $40.");
  assert.strictEqual(cCalc.type, "CALCULATED");

  const cAssump = classifyClaim("ASSUMPTION: Restaurants receive at least 15 orders daily.");
  assert.strictEqual(cAssump.type, "ASSUMPTION");

  const cRec = classifyClaim("RECOMMENDATION: Offer a 14-day free pilot to 5 local restaurants.");
  assert.strictEqual(cRec.type, "RECOMMENDATION");

  const cReq = classifyClaim("RESEARCH REQUIRED: Local WhatsApp API volume pricing for small businesses.");
  assert.strictEqual(cReq.type, "RESEARCH REQUIRED");

  const cUnverNum = classifyClaim("Market size is $500 million.");
  assert.strictEqual(cUnverNum.type, "RESEARCH REQUIRED");

  const cHeader = classifyClaim("### VERIFIED");
  assert.strictEqual(cHeader, null);

  const fullReport = `
# FINAL OUTPUT
- USER-PROVIDED: Business is a WhatsApp restaurant ordering system.
- VERIFIED: Competitor charges $45/mo according to source: sample_competitor.txt.
- CALCULATED: 10 customers yields $450/month in revenue.
- ASSUMPTION: Delivery restaurants value speed over advanced analytics.
- RECOMMENDATION: Focus on fast-casual pizzerias first.
- RESEARCH REQUIRED: Payment gateway fees for WhatsApp checkout.
`;

  const validation = validateOutput(fullReport);
  assert.strictEqual(validation.claims.length, 6);
  const types = validation.claims.map(c => c.type);
  assert(types.includes("USER-PROVIDED"));
  assert(types.includes("VERIFIED"));
  assert(types.includes("CALCULATED"));
  assert(types.includes("ASSUMPTION"));
  assert(types.includes("RECOMMENDATION"));
  assert(types.includes("RESEARCH REQUIRED"));
  console.log("✔ Output guard classification tests passed.\n");

  // 5. Research Agent Output Extraction & Sources Formatting
  console.log("5. Testing Research Agent Utilities...");
  const formattedSources = formatSourcesContext([{
    sourceType: "FILE",
    source: "competitor.txt",
    content: "Price: $30"
  }]);
  assert(formattedSources.includes("SOURCE #1"));
  assert(formattedSources.includes("Price: $30"));

  const sampleAgentResponse = `
### 3. VERIFIED EVIDENCE
- VERIFIED: Competitor X charges $29/month according to source: https://x.com
- VERIFIED: Setup time is under 15 minutes as stated in document
- RECOMMENDATION: Test pricing at $35/month
`;
  const extracted = extractVerifiedClaims(sampleAgentResponse);
  assert.strictEqual(extracted.length, 2);
  assert(extracted[0].includes("Competitor X charges $29/month"));
  console.log("✔ Research agent claim extraction passed.\n");

  // 6. Memory Store Integration
  console.log("6. Testing Memory Store Research & Fact Sync...");
  const memBefore = loadMemory();

  const newRecord = addResearch({
    sourceType: "FILE",
    source: "sample_competitor.txt",
    summary: "Competitor pricing research",
    verifiedFacts: [
      "Competitor EasyOrder charges $45/month with 500 orders included."
    ]
  });

  const memAfter = loadMemory();
  assert(memAfter.facts.includes("Competitor EasyOrder charges $45/month with 500 orders included."));
  const context = getResearchContext();
  assert(context.includes("sample_competitor.txt"));
  assert(context.includes("Competitor EasyOrder charges $45/month"));

  // Clean up test entry from memory.json
  memAfter.research = memAfter.research.filter(r => r.id !== newRecord.id);
  memAfter.facts = memAfter.facts.filter(f => !f.includes("Competitor EasyOrder"));
  fs.writeFileSync(
    path.join(__dirname, "../memory/memory.json"),
    JSON.stringify(memAfter, null, 2),
    "utf8"
  );
  if (fs.existsSync(sampleFile)) fs.unlinkSync(sampleFile);
  // 7. Provider Abstraction Tests
  console.log("7. Testing AI Provider Abstraction...");
  const { getProvider, OllamaProvider } = require("../providers");
  const { askAI, askOllama } = require("../index");

  const defaultProv = getProvider();
  assert(defaultProv instanceof OllamaProvider);
  assert.strictEqual(defaultProv.name, "ollama");
  assert.strictEqual(defaultProv.model, "qwen3:8b");
  assert.strictEqual(defaultProv.host, "127.0.0.1");
  assert.strictEqual(defaultProv.port, 11434);
  assert.strictEqual(typeof defaultProv.generate, "function");

  const customProv = getProvider("ollama", {
    model: "custom:latest",
    host: "localhost",
    port: 9999
  });
  assert.strictEqual(customProv.model, "custom:latest");
  assert.strictEqual(customProv.host, "localhost");
  assert.strictEqual(customProv.port, 9999);

  assert.throws(() => {
    getProvider("unsupported_cloud");
  }, /Unsupported AI provider/);

  assert.strictEqual(typeof askAI, "function");
  assert.strictEqual(typeof askOllama, "function");
  console.log("✔ AI Provider abstraction tests passed.\n");

  // 8. Agent Registry and Industry Configuration Tests
  console.log("8. Testing Agent Registry and Industry Context...");
  const registry = require("../agents/registry");
  const { resolveIntent } = require("../agents/router");
  const { getIndustryProfile, listIndustryProfiles } = require("../config/industry");

  // 1. Registry loads and contains registered agents
  const allAgents = registry.getAgents();
  assert.strictEqual(allAgents.length, 9);
  const expectedAgentIds = ["discovery", "strategy", "product", "finance", "outreach", "research", "lead-generation", "lead-qualification", "sales-pipeline"];
  for (const id of expectedAgentIds) {
    assert(registry.hasAgent(id), `Missing agent: ${id}`);
    const agent = registry.getAgent(id);
    assert.strictEqual(agent.id, id);
    assert.strictEqual(typeof agent.name, "string");
    assert.strictEqual(typeof agent.category, "string");
    assert.strictEqual(typeof agent.description, "string");
    assert.strictEqual(agent.enabled, true);
    assert.strictEqual(typeof agent.run, "function");
  }

  // 2. Category lookup
  const businessAgents = registry.getAgentsByCategory("business");
  assert(businessAgents.some(a => a.id === "discovery"));
  assert(businessAgents.some(a => a.id === "strategy"));
  const salesAgents = registry.getAgentsByCategory("sales");
  assert(salesAgents.some(a => a.id === "outreach"));
  assert(salesAgents.some(a => a.id === "lead-generation"));
  assert(salesAgents.some(a => a.id === "lead-qualification"));
  assert(salesAgents.some(a => a.id === "sales-pipeline"));

  // 3. Unknown agent handling
  assert.strictEqual(registry.hasAgent("unknown_agent_xyz"), false);
  assert.strictEqual(registry.getAgent("unknown_agent_xyz"), null);
  assert.strictEqual(registry.isAgentEnabled("unknown_agent_xyz"), false);

  // 4. Disabling agent & router integration
  registry.setAgentEnabled("product", false);
  assert.strictEqual(registry.isAgentEnabled("product"), false);
  // Router must safely return null when an agent is disabled
  assert.strictEqual(route("build an mvp app"), null);
  // But resolveIntent still knows the intention
  assert.strictEqual(resolveIntent("build an mvp app"), "product");

  // Re-enable
  registry.setAgentEnabled("product", true);
  assert.strictEqual(registry.isAgentEnabled("product"), true);
  assert.strictEqual(route("build an mvp app"), "product");

  // 5. Industry configuration concept
  const availableIndustries = listIndustryProfiles();
  assert(availableIndustries.includes("restaurant"));
  assert(availableIndustries.includes("school"));
  assert(availableIndustries.includes("real-estate"));
  assert(availableIndustries.includes("clinic"));
  assert(availableIndustries.includes("ecommerce"));

  const restaurantProfile = getIndustryProfile("restaurant");
  assert.strictEqual(restaurantProfile.industry, "restaurant");
  assert(Array.isArray(restaurantProfile.enabledAgents));
  assert(restaurantProfile.enabledAgents.includes("lead-generation"));
  assert(restaurantProfile.enabledAgents.includes("lead-qualification"));
  assert(restaurantProfile.enabledAgents.includes("sales-pipeline"));

  // Apply industry profile to registry
  const applied = registry.applyIndustryProfile("school");
  assert.strictEqual(applied.industry, "school");
  assert.strictEqual(registry.isAgentEnabled("product"), false); // product is not in school profile
  assert.strictEqual(registry.isAgentEnabled("research"), true);
  assert.strictEqual(registry.isAgentEnabled("lead-generation"), true);
  assert.strictEqual(registry.isAgentEnabled("lead-qualification"), true);
  assert.strictEqual(registry.isAgentEnabled("sales-pipeline"), true);

  // Reset registry back to default state
  registry.resetRegistry();
  assert.strictEqual(registry.isAgentEnabled("product"), true);
  for (const id of expectedAgentIds) {
    assert.strictEqual(registry.isAgentEnabled(id), true);
  }

  console.log("✔ Agent Registry and Industry Context tests passed.\n");

  // 9. Lead Generation Agent & Local Lead Storage Tests
  console.log("9. Testing Lead Generation Agent & Local Lead Storage...");
  const leadStore = require("../memory/leadStore");
  const { extractLeadsFromResponse, parseCsvContent } = require("../skills/leadGeneration");

  // Clean initial state for testing
  leadStore.clearLeads();
  assert.strictEqual(leadStore.loadLeads().length, 0);

  // 9.1 Data model & defaults
  const testLead1 = leadStore.createLeadRecord({
    companyName: "Napoli Pizzeria",
    industry: "Restaurant",
    location: "Chicago, IL",
    evidence: "USER-PROVIDED (menu flyer)",
    qualificationStatus: "POSSIBLE_FIT",
    potentialNeed: "Online ordering for delivery"
  });
  assert(testLead1.id.startsWith("lead-"));
  assert.strictEqual(testLead1.companyName, "Napoli Pizzeria");
  assert.strictEqual(testLead1.website, "RESEARCH REQUIRED");
  assert.strictEqual(testLead1.contactName, "RESEARCH REQUIRED");
  assert.strictEqual(testLead1.email, "RESEARCH REQUIRED");
  assert.strictEqual(testLead1.phone, "RESEARCH REQUIRED");
  assert.strictEqual(testLead1.outreachStatus, "NOT_CONTACTED");

  // 9.2 Add lead
  const addRes1 = leadStore.addLead(testLead1);
  assert.strictEqual(addRes1.success, true);
  assert.strictEqual(addRes1.created, true);
  assert.strictEqual(leadStore.loadLeads().length, 1);

  // 9.3 Deduplication & merging
  const dupLead = {
    companyName: "Napoli Pizzeria",
    website: "https://napolipizza.example.com",
    contactName: "Marco Rossi",
    contactRole: "Owner"
  };
  const addRes2 = leadStore.addLead(dupLead);
  assert.strictEqual(addRes2.success, true);
  assert.strictEqual(addRes2.updated, true);
  // Total leads must remain 1
  assert.strictEqual(leadStore.loadLeads().length, 1);
  const mergedLead = leadStore.loadLeads()[0];
  assert.strictEqual(mergedLead.website, "https://napolipizza.example.com");
  assert.strictEqual(mergedLead.contactName, "Marco Rossi");
  assert.strictEqual(mergedLead.location, "Chicago, IL"); // preserved existing field

  // 9.4 Add second lead and test searching/filtering
  const testLead2 = {
    companyName: "Tokyo Ramen Bar",
    industry: "Restaurant",
    location: "Austin, TX",
    qualificationStatus: "QUALIFIED",
    outreachStatus: "CONTACTED"
  };
  leadStore.addLead(testLead2);
  assert.strictEqual(leadStore.loadLeads().length, 2);

  const qualifiedLeads = leadStore.getLeads({ qualificationStatus: "QUALIFIED" });
  assert.strictEqual(qualifiedLeads.length, 1);
  assert.strictEqual(qualifiedLeads[0].companyName, "Tokyo Ramen Bar");

  const searchResults = leadStore.searchLeads("ramen");
  assert.strictEqual(searchResults.length, 1);
  assert.strictEqual(searchResults[0].companyName, "Tokyo Ramen Bar");

  // 9.5 CSV Parsing
  const sampleCsv = `company,website,industry,location,contact,phone
Burger Joint,https://burgerjoint.example.com,Restaurant,Miami,Bob,555-1234
Taco Stand,,Restaurant,Dallas,,`;
  const parsedRows = parseCsvContent(sampleCsv);
  assert.strictEqual(parsedRows.length, 2);
  assert.strictEqual(parsedRows[0].companyName, "Burger Joint");
  assert.strictEqual(parsedRows[0].phone, "555-1234");
  assert.strictEqual(parsedRows[1].website, "RESEARCH REQUIRED");
  assert.strictEqual(parsedRows[1].contactName, "RESEARCH REQUIRED");

  // 9.6 Extraction from Lead Generation report text
  const sampleReportText = `
LEAD GENERATION REPORT

LEADS IDENTIFIED & QUALIFIED:
1. Company: Milan Bistro
   Website: https://milanbistro.example.com
   Industry: Italian Restaurant
   Location: Boston, MA
   Contact: Giuseppe (Manager)
   Evidence: VERIFIED from local dining directory
   Potential Need: WhatsApp table booking and takeaway
   Qualification Status: QUALIFIED
   Fit Reason: Actively receives orders manually over phone
   Missing Information: Exact weekly order volume

2. Company: Sunset Cafe
   Website: RESEARCH REQUIRED
   Industry: Coffee Shop
   Location: San Diego, CA
   Contact: RESEARCH REQUIRED
   Evidence: USER-PROVIDED
   Potential Need: RESEARCH REQUIRED
   Qualification Status: NEEDS_RESEARCH
   Fit Reason: Unknown ordering process
   Missing Information: Menu and contact person
`;
  const extractedLeads = extractLeadsFromResponse(sampleReportText);
  assert.strictEqual(extractedLeads.length, 2);
  assert.strictEqual(extractedLeads[0].companyName, "Milan Bistro");
  assert.strictEqual(extractedLeads[0].qualificationStatus, "QUALIFIED");
  assert.strictEqual(extractedLeads[1].companyName, "Sunset Cafe");
  assert.strictEqual(extractedLeads[1].qualificationStatus, "NEEDS_RESEARCH");

  // 9.7 Router tests for Lead Generation
  assert.strictEqual(route("find potential customers for my business"), "lead-generation");
  assert.strictEqual(route("find potential customers for my WhatsApp restaurant ordering business"), "lead-generation");
  assert.strictEqual(route("generate leads from leads.csv"), "lead-generation");
  assert.strictEqual(route("build a lead list"), "lead-generation");
  assert.strictEqual(route("find businesses to contact"), "lead-generation");
  assert.strictEqual(route("research and qualify these leads"), "lead-generation");
  // Outreach queries still route to outreach
  assert.strictEqual(route("find customers and outreach"), "outreach");

  // 9.8 Disabled agent test for lead-generation
  registry.setAgentEnabled("lead-generation", false);
  assert.strictEqual(route("generate leads from leads.csv"), null);
  registry.setAgentEnabled("lead-generation", true);
  assert.strictEqual(route("generate leads from leads.csv"), "lead-generation");

  // Clean up test leads
  leadStore.clearLeads();
  assert.strictEqual(leadStore.loadLeads().length, 0);

  console.log("✔ Lead Generation Agent & Local Lead Storage tests passed.\n");

  // 10. Lead Qualification Agent & Rubric Tests
  console.log("10. Testing Lead Qualification Agent & ICP Rubric...");
  const {
    runLeadQualification,
    evaluateLeadWithRubric,
    buildDefaultRubric,
    parseIcpFromText,
    QUALIFICATION_STATUSES,
    EVIDENCE_TYPES
  } = require("../skills/leadQualification");

  // Clean initial state for testing
  leadStore.clearLeads();
  assert.strictEqual(leadStore.loadLeads().length, 0);

  // 10.1 Configurable rubric and ICP parsing
  const customIcpRubric = buildDefaultRubric({
    name: "Restaurant SaaS Rubric",
    icp: {
      industry: "Restaurant",
      location: "Chicago",
      businessNeed: "Online ordering"
    }
  });
  assert.strictEqual(customIcpRubric.icp.industry, "Restaurant");
  assert.strictEqual(customIcpRubric.icp.location, "Chicago");
  assert.strictEqual(customIcpRubric.criteria.length, 4);

  const parsedIcp = parseIcpFromText("qualify leads using ICP: industry: Restaurant, location: Chicago, need: Online ordering");
  assert(parsedIcp !== null);
  assert.strictEqual(parsedIcp.industry, "Restaurant");
  assert.strictEqual(parsedIcp.location, "Chicago");
  assert.strictEqual(parsedIcp.businessNeed, "Online ordering");

  // 10.2 Qualification Status Evaluation & Evidence Classification
  // Lead A: Matches all criteria with evidence -> QUALIFIED
  const leadA = leadStore.createLeadRecord({
    companyName: "Giordano's Pizzeria",
    industry: "Restaurant",
    location: "Chicago, IL",
    contactName: "Tony Giordano",
    contactRole: "General Manager",
    potentialNeed: "Online ordering system for delivery",
    evidence: "VERIFIED (menu and local business filing)",
    website: "https://giordanos.example.com"
  });

  const evalA = evaluateLeadWithRubric(leadA, customIcpRubric);
  assert.strictEqual(evalA.status, QUALIFICATION_STATUSES.QUALIFIED);
  assert.strictEqual(evalA.score, "4/4 criteria verified");
  assert.strictEqual(evalA.missingInformation.length, 0);
  assert(!evalA.score.includes("%")); // NEVER AI confidence percentage
  assert(evalA.criteriaResults.every(c => c.result === "PASS"));
  assert(evalA.criteriaResults.some(c => c.evidenceType === EVIDENCE_TYPES.VERIFIED));

  // Lead B: Matches industry, but missing need and decision maker -> POSSIBLE_FIT
  const leadB = leadStore.createLeadRecord({
    companyName: "Windy City Tacos",
    industry: "Restaurant",
    location: "Chicago, IL",
    contactName: "RESEARCH REQUIRED",
    potentialNeed: "RESEARCH REQUIRED",
    evidence: "USER-PROVIDED"
  });

  const evalB = evaluateLeadWithRubric(leadB, customIcpRubric);
  assert.strictEqual(evalB.status, QUALIFICATION_STATUSES.POSSIBLE_FIT);
  assert.strictEqual(evalB.score, "2/4 criteria verified");
  assert(evalB.missingInformation.includes("Verifiable Business Need"));
  assert(evalB.missingInformation.includes("Decision-Maker Name & Role"));

  // Lead C: Mismatched industry -> UNQUALIFIED
  const leadC = leadStore.createLeadRecord({
    companyName: "Apex Logistics Co",
    industry: "Freight & Trucking",
    location: "Chicago, IL",
    contactName: "Jim Davis",
    potentialNeed: "Dispatch tracking",
    evidence: "VERIFIED"
  });

  const evalC = evaluateLeadWithRubric(leadC, customIcpRubric);
  assert.strictEqual(evalC.status, QUALIFICATION_STATUSES.UNQUALIFIED);
  assert(evalC.reasoning.includes("does not match"));

  // Lead D: Insufficient data -> NEEDS_RESEARCH
  const leadD = leadStore.createLeadRecord({
    companyName: "Mysterious Venue",
    industry: "RESEARCH REQUIRED",
    location: "RESEARCH REQUIRED",
    potentialNeed: "RESEARCH REQUIRED"
  });

  const evalD = evaluateLeadWithRubric(leadD, customIcpRubric);
  assert.strictEqual(evalD.status, QUALIFICATION_STATUSES.NEEDS_RESEARCH);
  assert.strictEqual(evalD.score, "0/4 criteria verified");

  // 10.3 Persistence in leadStore & duplicate-safe updates
  leadStore.addLead(leadA);
  leadStore.addLead(leadB);
  leadStore.addLead(leadC);
  assert.strictEqual(leadStore.loadLeads().length, 3);

  // Update lead with qualification
  leadStore.updateLead(leadA.id, {
    qualificationStatus: evalA.status,
    fitReason: evalA.reasoning,
    qualification: evalA
  });

  const storedA = leadStore.getLead(leadA.id);
  assert.strictEqual(storedA.qualificationStatus, "QUALIFIED");
  assert.strictEqual(storedA.qualification.score, "4/4 criteria verified");
  assert.strictEqual(storedA.qualification.criteriaResults.length, 4);

  // Duplicate add preserves qualification
  leadStore.addLead({
    companyName: "Giordano's Pizzeria",
    phone: "312-555-0199"
  });
  const reloadedA = leadStore.getLead(leadA.id);
  assert.strictEqual(reloadedA.qualificationStatus, "QUALIFIED");
  assert.strictEqual(reloadedA.phone, "312-555-0199");
  assert.strictEqual(leadStore.loadLeads().length, 3);

  // 10.4 Filtering Qualified Leads
  const storedQualifiedLeads = leadStore.getQualifiedLeads();
  assert.strictEqual(storedQualifiedLeads.length, 1);
  assert.strictEqual(storedQualifiedLeads[0].companyName, "Giordano's Pizzeria");

  // Filter requests via runLeadQualification
  const filterQualifiedReport = await runLeadQualification("show qualified leads", null);
  assert(filterQualifiedReport.includes("Giordano's Pizzeria"));
  assert(filterQualifiedReport.includes("Filter Status: QUALIFIED"));

  // 10.5 Single vs Batch qualification execution
  const mockAskAI = async prompt => prompt;

  // Single lead qualification by ID
  const singleReport = await runLeadQualification(`qualify ${leadB.id}`, mockAskAI);
  assert(singleReport.includes("Windy City Tacos"));
  const updatedB = leadStore.getLead(leadB.id);
  assert.strictEqual(updatedB.qualificationStatus, "POSSIBLE_FIT");
  assert(updatedB.qualification !== null);

  // Batch qualification of all leads
  const batchReport = await runLeadQualification("qualify all leads", mockAskAI);
  assert(batchReport.includes("LEAD QUALIFICATION REPORT"));
  assert(batchReport.includes("Giordano's Pizzeria"));
  assert(batchReport.includes("Windy City Tacos"));
  assert(batchReport.includes("Apex Logistics Co"));

  // 10.6 Router Tests for Lead Qualification
  assert.strictEqual(route("qualify leads"), "lead-qualification");
  assert.strictEqual(route("qualify my leads"), "lead-qualification");
  assert.strictEqual(route("qualify this lead"), "lead-qualification");
  assert.strictEqual(route("lead qualification"), "lead-qualification");
  assert.strictEqual(route("evaluate leads"), "lead-qualification");
  assert.strictEqual(route("score leads"), "lead-qualification");
  assert.strictEqual(route("which leads are qualified"), "lead-qualification");
  assert.strictEqual(route("show qualified leads"), "lead-qualification");
  assert.strictEqual(route("filter qualified leads"), "lead-qualification");
  assert.strictEqual(route("show possible-fit leads"), "lead-qualification");
  assert.strictEqual(route("show leads needing research"), "lead-qualification");
  assert.strictEqual(route("qualify all leads using this ICP"), "lead-qualification");

  // Preserved routing for other agents
  assert.strictEqual(route("find potential customers"), "lead-generation");
  assert.strictEqual(route("find potential customers for my business"), "lead-generation");
  assert.strictEqual(route("research and qualify these leads"), "lead-generation");
  assert.strictEqual(route("find customers and outreach"), "outreach");
  assert.strictEqual(route("research competitor pricing"), "research");
  assert.strictEqual(route("create a business strategy"), "strategy");

  // 10.7 Disabled Agent Test for Lead Qualification
  registry.setAgentEnabled("lead-qualification", false);
  assert.strictEqual(route("qualify my leads"), null);
  registry.setAgentEnabled("lead-qualification", true);
  assert.strictEqual(route("qualify my leads"), "lead-qualification");

  // Clean up test leads
  leadStore.clearLeads();
  assert.strictEqual(leadStore.loadLeads().length, 0);

  console.log("✔ Lead Qualification Agent & ICP Rubric tests passed.\n");

  // 11. Sales Pipeline Agent & Follow-up Tests
  console.log("11. Testing Sales Pipeline Agent & Follow-up Management...");
  const {
    runSalesPipeline,
    formatPipelineOverview,
    formatFollowUpReport,
    formatFollowUpDraft,
    normalizeStatus,
    PIPELINE_STATUSES: SALES_PIPELINE_STATUSES
  } = require("../skills/salesPipeline");

  // Clean initial state for testing
  leadStore.clearLeads();
  assert.strictEqual(leadStore.loadLeads().length, 0);

  // 11.1 Pipeline Status Validation
  assert.strictEqual(SALES_PIPELINE_STATUSES.length, 9);
  assert(SALES_PIPELINE_STATUSES.includes("NOT_CONTACTED"));
  assert(SALES_PIPELINE_STATUSES.includes("CONTACTED"));
  assert(SALES_PIPELINE_STATUSES.includes("REPLIED"));
  assert(SALES_PIPELINE_STATUSES.includes("INTERESTED"));
  assert(SALES_PIPELINE_STATUSES.includes("FOLLOW_UP"));
  assert(SALES_PIPELINE_STATUSES.includes("DEMO_SCHEDULED"));
  assert(SALES_PIPELINE_STATUSES.includes("PROPOSAL_SENT"));
  assert(SALES_PIPELINE_STATUSES.includes("WON"));
  assert(SALES_PIPELINE_STATUSES.includes("LOST"));

  assert.strictEqual(normalizeStatus("contacted"), "CONTACTED");
  assert.strictEqual(normalizeStatus("interested"), "INTERESTED");
  assert.strictEqual(normalizeStatus("proposal sent"), "PROPOSAL_SENT");
  assert.strictEqual(normalizeStatus("won"), "WON");
  assert.strictEqual(normalizeStatus("lost"), "LOST");
  assert.strictEqual(normalizeStatus("follow up"), "FOLLOW_UP");

  // 11.2 Pipeline Persistence & Separation from Qualification
  const pLead1 = leadStore.createLeadRecord({
    companyName: "Luigi's Trattoria",
    industry: "Restaurant",
    location: "Chicago, IL",
    contactName: "Luigi Bianchi",
    contactRole: "Owner",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED"
  });
  leadStore.addLead(pLead1);

  assert.strictEqual(leadStore.loadLeads().length, 1);
  const loadedP1 = leadStore.getLead(pLead1.id);
  assert.strictEqual(loadedP1.qualificationStatus, "QUALIFIED");
  assert.strictEqual(loadedP1.pipelineStatus, "NOT_CONTACTED");
  assert.strictEqual(loadedP1.pipeline.status, "NOT_CONTACTED");
  assert.strictEqual(loadedP1.pipeline.nextFollowUpAt, null);

  // 11.3 Controlled Single Lead Status Update
  const updateRes1 = await runSalesPipeline(`mark ${pLead1.companyName} as interested`, mockAskAI);
  assert(updateRes1.includes("LEAD PIPELINE UPDATE"));
  assert(updateRes1.includes("INTERESTED"));

  const updatedP1 = leadStore.getLead(pLead1.id);
  assert.strictEqual(updatedP1.pipelineStatus, "INTERESTED");
  assert.strictEqual(updatedP1.pipeline.status, "INTERESTED");
  // Qualification MUST remain intact
  assert.strictEqual(updatedP1.qualificationStatus, "QUALIFIED");

  // 11.4 Updating by lead ID
  const pLead2 = leadStore.createLeadRecord({
    companyName: "Metro Bakery",
    industry: "Bakery",
    location: "Chicago, IL",
    qualificationStatus: "POSSIBLE_FIT",
    pipelineStatus: "NOT_CONTACTED"
  });
  leadStore.addLead(pLead2);

  await runSalesPipeline(`mark ${pLead2.id} as contacted`, mockAskAI);
  const updatedP2 = leadStore.getLead(pLead2.id);
  assert.strictEqual(updatedP2.pipelineStatus, "CONTACTED");
  assert.strictEqual(updatedP2.qualificationStatus, "POSSIBLE_FIT"); // Preserved!
  assert(updatedP2.pipeline.lastContactedAt !== null);

  // Unrelated lead pLead1 must NOT have been modified by pLead2's update
  const verifyP1 = leadStore.getLead(pLead1.id);
  assert.strictEqual(verifyP1.pipelineStatus, "INTERESTED");

  // 11.5 Unspecified lead update request prompts for identifier
  const unspecRes = await runSalesPipeline("mark my lead as interested", mockAskAI);
  assert(unspecRes.includes("LEAD NOT SPECIFIED OR NOT FOUND"));
  assert(unspecRes.includes("Luigi's Trattoria"));
  assert(unspecRes.includes("Metro Bakery"));

  // 11.6 Duplicate add preserves pipeline status
  leadStore.addLead({
    companyName: "Luigi's Trattoria",
    phone: "312-555-9999"
  });
  const reloadedP1 = leadStore.getLead(pLead1.id);
  assert.strictEqual(reloadedP1.pipelineStatus, "INTERESTED");
  assert.strictEqual(reloadedP1.phone, "312-555-9999");

  // 11.7 Stage Filtering & Overview
  const interestedLeads = leadStore.getPipelineLeads("INTERESTED");
  assert.strictEqual(interestedLeads.length, 1);
  assert.strictEqual(interestedLeads[0].companyName, "Luigi's Trattoria");

  const filterInterestedRes = await runSalesPipeline("show interested leads", mockAskAI);
  assert(filterInterestedRes.includes("PIPELINE STAGE REPORT: INTERESTED"));
  assert(filterInterestedRes.includes("Luigi's Trattoria"));

  const filterContactedRes = await runSalesPipeline("show contacted leads", mockAskAI);
  assert(filterContactedRes.includes("Metro Bakery"));

  const overviewRes = await runSalesPipeline("show my sales pipeline", mockAskAI);
  assert(overviewRes.includes("SALES PIPELINE"));
  assert(overviewRes.includes("INTERESTED: 1"));
  assert(overviewRes.includes("CONTACTED: 1"));

  // 11.8 Follow-up Management & Missing Date Handling
  await runSalesPipeline(`mark ${pLead2.id} as follow up`, mockAskAI);
  const followUpP2 = leadStore.getLead(pLead2.id);
  assert.strictEqual(followUpP2.pipelineStatus, "FOLLOW_UP");

  const followUpReport = await runSalesPipeline("show leads needing follow-up", mockAskAI);
  assert(followUpReport.includes("LEADS NEEDING FOLLOW-UP REPORT"));
  assert(followUpReport.includes("Metro Bakery"));
  assert(followUpReport.includes("Next Follow-up: NOT SET")); // Never invent dates!

  // 11.9 Follow-up Draft Preparation (Grounded in Verified Facts Only)
  const draftRes = await runSalesPipeline(`prepare follow-up for ${pLead1.companyName}`, mockAskAI);
  assert(draftRes.includes("FOLLOW-UP DRAFT"));
  assert(draftRes.includes("Luigi's Trattoria"));
  assert(draftRes.includes("Previous conversation details: NOT PROVIDED")); // Never invent conversations!
  assert(draftRes.includes("Next Follow-up: NOT SET"));

  // 11.10 Router Tests for Sales Pipeline
  assert.strictEqual(route("show my sales pipeline"), "sales-pipeline");
  assert.strictEqual(route("show sales pipeline"), "sales-pipeline");
  assert.strictEqual(route("sales pipeline"), "sales-pipeline");
  assert.strictEqual(route("show leads needing follow-up"), "sales-pipeline");
  assert.strictEqual(route("what should i follow up on"), "sales-pipeline");
  assert.strictEqual(route("mark lead as interested"), "sales-pipeline");
  assert.strictEqual(route("mark my lead as interested"), "sales-pipeline");
  assert.strictEqual(route("mark Luigi's Trattoria as proposal sent"), "sales-pipeline");
  assert.strictEqual(route("show interested leads"), "sales-pipeline");
  assert.strictEqual(route("show contacted leads"), "sales-pipeline");
  assert.strictEqual(route("show proposal leads"), "sales-pipeline");
  assert.strictEqual(route("show won deals"), "sales-pipeline");
  assert.strictEqual(route("show lost leads"), "sales-pipeline");

  // Preserved routing for other agents
  assert.strictEqual(route("find potential customers"), "lead-generation");
  assert.strictEqual(route("qualify my leads"), "lead-qualification");
  assert.strictEqual(route("show qualified leads"), "lead-qualification");
  assert.strictEqual(route("find customers and outreach"), "outreach");
  assert.strictEqual(route("research competitor pricing"), "research");
  assert.strictEqual(route("create a business strategy"), "strategy");

  // 11.11 Disabled Agent Test for Sales Pipeline
  registry.setAgentEnabled("sales-pipeline", false);
  assert.strictEqual(route("show my sales pipeline"), null);
  registry.setAgentEnabled("sales-pipeline", true);
  assert.strictEqual(route("show my sales pipeline"), "sales-pipeline");

  // Clean up test leads
  leadStore.clearLeads();
  assert.strictEqual(leadStore.loadLeads().length, 0);

  console.log("✔ Sales Pipeline Agent & Follow-up Management tests passed.\n");

  // 12. Client / CRM Data Layer & Relations Tests
  console.log("12. Testing Client / CRM Data Layer & Relations...");
  const crmStore = require("../memory/crmStore");

  // Clean initial state
  leadStore.clearLeads();
  crmStore.clearCRM();
  assert.strictEqual(leadStore.loadLeads().length, 0);
  assert.strictEqual(crmStore.getContacts().length, 0);
  assert.strictEqual(crmStore.getActivities().length, 0);
  assert.strictEqual(crmStore.getClients().length, 0);

  // 12.1 Contact Management
  const crmLead1 = leadStore.createLeadRecord({
    companyName: "Luigi's Trattoria",
    industry: "Restaurant",
    location: "Chicago, IL",
    contactName: "Luigi Bianchi",
    contactRole: "Owner",
    email: "luigi@example.com",
    phone: "312-555-0144",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED"
  });
  leadStore.addLead(crmLead1);

  // Create contact directly
  const cRes1 = crmStore.createContact({
    leadId: crmLead1.id,
    name: "Luigi Bianchi",
    role: "Owner",
    email: "luigi@example.com",
    phone: "312-555-0144",
    evidenceType: "VERIFIED"
  });
  assert.strictEqual(cRes1.success, true);
  assert.strictEqual(cRes1.created, true);
  assert.strictEqual(crmStore.getContacts().length, 1);

  // Retrieve contact
  const fetchedContact = crmStore.getContact(cRes1.contact.id);
  assert.strictEqual(fetchedContact.name, "Luigi Bianchi");
  assert.strictEqual(fetchedContact.leadId, crmLead1.id);
  assert.strictEqual(fetchedContact.evidenceType, "VERIFIED");

  // Update contact
  const updatedContact = crmStore.updateContact(fetchedContact.id, { notes: "Prefers afternoon meetings" });
  assert.strictEqual(updatedContact.notes, "Prefers afternoon meetings");

  // Duplicate contact merge for same lead
  const dupCRes = crmStore.createContact({
    leadId: crmLead1.id,
    name: "Luigi Bianchi",
    role: "Proprietor & Head Chef"
  });
  assert.strictEqual(dupCRes.updated, true);
  assert.strictEqual(crmStore.getContacts().length, 1);
  assert.strictEqual(crmStore.getContact(fetchedContact.id).role, "Proprietor & Head Chef");

  // Lead contacts relation
  const leadContacts = crmStore.getLeadContacts(crmLead1.id);
  assert.strictEqual(leadContacts.length, 1);
  assert.strictEqual(leadContacts[0].id, fetchedContact.id);

  // 12.2 Activity Tracking
  const act1 = crmStore.addActivity({
    leadId: crmLead1.id,
    type: "CONTACTED",
    description: "Initial outreach via phone",
    status: "COMPLETED",
    metadata: { channel: "phone" }
  });
  assert.strictEqual(act1.leadId, crmLead1.id);
  assert.strictEqual(act1.type, "CONTACTED");
  assert(act1.id.startsWith("act-"));
  assert(act1.occurredAt);

  // Invalid type fallback
  const actInvalid = crmStore.addActivity({
    leadId: crmLead1.id,
    type: "INVALID_RANDOM_TYPE",
    description: "Random note"
  });
  assert.strictEqual(actInvalid.type, "OTHER");

  // Activity list & ordering
  const leadActivities = crmStore.getLeadActivities(crmLead1.id);
  assert.strictEqual(leadActivities.length, 2);
  assert(leadActivities.some(a => a.type === "CONTACTED"));

  // 12.3 Client Management & Relations
  // Cannot create client without valid existing lead
  assert.throws(() => {
    crmStore.createClient({ leadId: "non_existent_lead_999", companyName: "Fake Co" });
  }, /does not exist/);

  // Convert lead to client workflow
  const convRes = crmStore.convertLeadToClient(crmLead1.id, {
    service: "Online Ordering Setup & Table Booking",
    notes: "Signed 1-year commercial agreement"
  });
  assert.strictEqual(convRes.success, true);
  assert.strictEqual(convRes.isNewClient, true);
  assert.strictEqual(convRes.client.companyName, "Luigi's Trattoria");
  assert.strictEqual(convRes.client.status, "ACTIVE");
  assert.strictEqual(convRes.lead.pipelineStatus, "WON"); // Pipeline updated to WON
  assert.strictEqual(convRes.lead.qualificationStatus, "QUALIFIED"); // Qualification preserved!
  assert.strictEqual(convRes.activity.type, "CLIENT_CONVERTED");

  // Duplicate conversion prevention
  const dupConvRes = crmStore.convertLeadToClient(crmLead1.id, { notes: "Updated service notes" });
  assert.strictEqual(dupConvRes.success, true);
  assert.strictEqual(dupConvRes.isNewClient, false);
  assert.strictEqual(crmStore.getClients().length, 1);

  // Client retrieval
  const clientRecord = crmStore.getClientByLeadId(crmLead1.id);
  assert(clientRecord !== null);
  assert.strictEqual(clientRecord.companyName, "Luigi's Trattoria");

  // 12.4 CRM Aggregations & Unified Lead CRM Profile
  const overview = crmStore.getCRMOverview();
  assert.strictEqual(overview.leads.TOTAL, 1);
  assert.strictEqual(overview.leads.QUALIFIED, 1);
  assert.strictEqual(overview.pipeline.WON, 1);
  assert.strictEqual(overview.clients.TOTAL, 1);
  assert.strictEqual(overview.clients.ACTIVE, 1);
  assert.strictEqual(overview.contactsCount, 1);
  assert(overview.activitiesCount >= 3);

  // Unified Lead CRM Profile
  const profile = crmStore.getLeadCRMProfile(crmLead1.id);
  assert(profile !== null);
  assert.strictEqual(profile.lead.companyName, "Luigi's Trattoria");
  assert.strictEqual(profile.qualification.status, "QUALIFIED");
  assert.strictEqual(profile.pipeline.status, "WON");
  assert.strictEqual(profile.contacts.length, 1);
  assert(profile.activities.length >= 3);
  assert.strictEqual(profile.client.status, "ACTIVE");

  // Search by company name in profile lookup
  const profileByName = crmStore.getLeadCRMProfile("Luigi's Trattoria");
  assert(profileByName !== null);
  assert.strictEqual(profileByName.lead.id, crmLead1.id);

  // Unknown lead profile lookup returns null
  assert.strictEqual(crmStore.getLeadCRMProfile("Unknown Mystery Co"), null);

  // 12.5 CLI Integration via runSalesPipeline
  const overviewReport = await runSalesPipeline("show CRM overview", mockAskAI);
  assert(overviewReport.includes("CRM OVERVIEW REPORT"));
  assert(overviewReport.includes("Total Leads: 1"));
  assert(overviewReport.includes("Active Clients: 1"));

  const profileReport = await runSalesPipeline("show CRM profile for Luigi's Trattoria", mockAskAI);
  assert(profileReport.includes("CRM LEAD & CLIENT PROFILE"));
  assert(profileReport.includes("Luigi's Trattoria"));
  assert(profileReport.includes("Client Status:"));
  assert(profileReport.includes("Recent Activities Logged"));

  const activitiesReport = await runSalesPipeline("show activities for Luigi's Trattoria", mockAskAI);
  assert(activitiesReport.includes("CRM ACTIVITIES REPORT"));
  assert(activitiesReport.includes("CLIENT_CONVERTED"));

  const contactsReport = await runSalesPipeline("show contacts for Luigi's Trattoria", mockAskAI);
  assert(contactsReport.includes("CRM CONTACTS REPORT"));
  assert(contactsReport.includes("Luigi Bianchi"));

  const clientsReport = await runSalesPipeline("show clients", mockAskAI);
  assert(clientsReport.includes("CRM CLIENTS REPORT"));
  assert(clientsReport.includes("Luigi's Trattoria"));

  // Controlled conversion error when lead is not specified
  const unspecConv = await runSalesPipeline("convert lead to client", mockAskAI);
  assert(unspecConv.includes("LEAD NOT SPECIFIED OR NOT FOUND"));

  // 12.6 Router Tests for CRM
  assert.strictEqual(route("show CRM"), "sales-pipeline");
  assert.strictEqual(route("show CRM overview"), "sales-pipeline");
  assert.strictEqual(route("show CRM profile for Luigi's Trattoria"), "sales-pipeline");
  assert.strictEqual(route("show client profile"), "sales-pipeline");
  assert.strictEqual(route("show activities"), "sales-pipeline");
  assert.strictEqual(route("show contacts"), "sales-pipeline");
  assert.strictEqual(route("show clients"), "sales-pipeline");
  assert.strictEqual(route("convert Luigi's Trattoria to client"), "sales-pipeline");
  assert.strictEqual(route("convert lead to client"), "sales-pipeline");

  // Preserved routing for other agents
  assert.strictEqual(route("find potential customers"), "lead-generation");
  assert.strictEqual(route("qualify my leads"), "lead-qualification");
  assert.strictEqual(route("show qualified leads"), "lead-qualification");
  assert.strictEqual(route("find customers and outreach"), "outreach");
  assert.strictEqual(route("research competitor pricing"), "research");
  assert.strictEqual(route("create a business strategy"), "strategy");

  // 12.7 Registry verification: Platform strictly maintains 9 AI agents
  assert.strictEqual(registry.getAgents().length, 9);
  assert.strictEqual(registry.hasAgent("sales-pipeline"), true);

  // Clean up
  leadStore.clearLeads();
  crmStore.clearCRM();
  assert.strictEqual(leadStore.loadLeads().length, 0);
  assert.strictEqual(crmStore.getContacts().length, 0);
  assert.strictEqual(crmStore.getActivities().length, 0);
  assert.strictEqual(crmStore.getClients().length, 0);

  console.log("✔ Client / CRM Data Layer & Relations tests passed.\n");

  // =========================================================================
  // 13. Testing Client Onboarding & Service Delivery Layer
  // =========================================================================
  console.log("13. Testing Client Onboarding & Service Delivery Layer...");
  const serviceDeliveryStore = require("../memory/serviceDeliveryStore");
  const { runProduct } = require("../skills/product");

  serviceDeliveryStore.clearServiceDelivery();
  leadStore.clearLeads();
  crmStore.clearCRM();

  // 13.1 Nonexistent Client Handling: Cannot create project for nonexistent client
  const noClientRes = serviceDeliveryStore.createProject({
    clientId: "client-nonexistent-123",
    projectName: "Ghost Project"
  });
  assert.strictEqual(noClientRes.success, false);
  assert(noClientRes.error.includes("CLIENT NOT FOUND"));

  const noClientCli = await runProduct("create project for Nonexistent Corp", mockAskAI);
  assert(noClientCli.includes("CLIENT NOT FOUND"));

  // 13.2 Create valid Lead and convert to Client
  const sampleLead = leadStore.createLeadRecord({
    companyName: "Luigi's Trattoria",
    website: "https://luigistrattoria.com",
    contactName: "Luigi Rossi",
    role: "Owner",
    email: "luigi@luigistrattoria.com",
    phone: "+1-555-0199",
    pipelineStatus: "WON",
    qualification: { status: "QUALIFIED", fitScore: 92, summary: "High volume restaurant" }
  });
  leadStore.saveLeads([sampleLead]);
  const conv = crmStore.convertLeadToClient(sampleLead.id, {
    service: "AI Reservation System"
  });
  assert.strictEqual(conv.success, true);
  const client = conv.client;

  // 13.3 Project Creation & Safety Checks
  const projRes = serviceDeliveryStore.createProject({
    clientId: client.id,
    projectName: "Luigi's AI Reservation Delivery",
    serviceType: "AI Reservation System",
    description: "Automated phone and web reservation bot"
  });
  assert.strictEqual(projRes.success, true);
  const project = projRes.project;
  assert.strictEqual(project.clientId, client.id);
  assert.strictEqual(project.leadId, sampleLead.id);
  assert.strictEqual(project.status, "PLANNED");
  assert.strictEqual(project.priority, "MEDIUM");
  // Safety: Dates must NOT be invented
  assert.strictEqual(project.startDate, "NOT SET");
  assert.strictEqual(project.targetDate, "NOT SET");
  assert.strictEqual(project.progress, 0);

  // 13.4 Duplicate Project Prevention
  const dupRes = serviceDeliveryStore.createProject({
    clientId: client.id,
    projectName: "Luigi's AI Reservation Delivery"
  });
  assert.strictEqual(dupRes.success, false);
  assert(dupRes.error.includes("Duplicate project"));

  // 13.5 CRM Activity Logging Integration
  const activities = crmStore.getLeadActivities(sampleLead.id);
  assert(activities.some(a => a.type === "PROJECT_CREATED"));

  // 13.6 Onboarding Lifecycle & Status Transitions
  const onb = serviceDeliveryStore.getOnboardingByProjectId(project.id);
  assert(onb !== null);
  assert.strictEqual(onb.status, "NOT_STARTED");
  assert.strictEqual(onb.completedItems.length, 0);
  assert(onb.pendingItems.length >= 3);

  // Update onboarding status and complete an item
  const updatedOnb = serviceDeliveryStore.updateOnboarding(onb.id, {
    status: "WELCOME",
    completeItem: "Welcome call and kickoff"
  });
  assert.strictEqual(updatedOnb.status, "WELCOME");
  assert(updatedOnb.completedItems.includes("Welcome call and kickoff"));
  assert(!updatedOnb.pendingItems.includes("Welcome call and kickoff"));

  // 13.7 Requirements Management & Evidence Preservation
  const reqRes1 = serviceDeliveryStore.addRequirement({
    projectId: project.id,
    title: "Twilio SMS integration",
    description: "Send SMS confirmation to customers upon booking",
    source: "USER-PROVIDED",
    status: "RECEIVED"
  });
  assert.strictEqual(reqRes1.success, true);
  const req1 = reqRes1.requirement;
  assert.strictEqual(req1.source, "USER-PROVIDED");
  assert.strictEqual(req1.status, "RECEIVED");

  // Safety: Assumptions must NOT be turned into confirmed requirements automatically
  const reqRes2 = serviceDeliveryStore.addRequirement({
    projectId: project.id,
    title: "10,000 monthly bookings capacity",
    description: "Estimated server capacity needed",
    source: "ASSUMPTION",
    status: "PENDING"
  });
  assert.strictEqual(reqRes2.success, true);
  const req2 = reqRes2.requirement;
  assert.strictEqual(req2.source, "ASSUMPTION");
  assert.strictEqual(req2.status, "PENDING");

  // Confirming requirement updates status and logs CRM activity
  const confirmedReq = serviceDeliveryStore.updateRequirement(req1.id, {
    status: "CONFIRMED"
  });
  assert.strictEqual(confirmedReq.status, "CONFIRMED");
  const activitiesAfterReq = crmStore.getLeadActivities(sampleLead.id);
  assert(activitiesAfterReq.some(a => a.type === "REQUIREMENT_CONFIRMED"));

  // 13.8 Milestones Management & Safety
  const msRes = serviceDeliveryStore.createMilestone({
    projectId: project.id,
    name: "Core Webhook & Table Sync",
    description: "Integrate reservation webhook with table management database",
    order: 1
  });
  assert.strictEqual(msRes.success, true);
  const milestone = msRes.milestone;
  // Safety: Dates must NOT be invented
  assert.strictEqual(milestone.startDate, "NOT SET");
  assert.strictEqual(milestone.targetDate, "NOT SET");
  assert.strictEqual(milestone.completedAt, null);

  // Complete milestone
  const completedMs = serviceDeliveryStore.updateMilestone(milestone.id, {
    status: "COMPLETED"
  });
  assert.strictEqual(completedMs.status, "COMPLETED");
  assert(completedMs.completedAt !== null);

  // 13.9 Task Management & Safety
  const taskRes1 = serviceDeliveryStore.createTask({
    projectId: project.id,
    milestoneId: milestone.id,
    title: "Setup Twilio webhook endpoint",
    priority: "HIGH"
  });
  assert.strictEqual(taskRes1.success, true);
  const task1 = taskRes1.task;
  // Safety: Owners and due dates must NOT be invented
  assert.strictEqual(task1.owner, "UNASSIGNED");
  assert.strictEqual(task1.dueDate, "NOT SET");
  assert.strictEqual(task1.status, "TODO");

  const taskRes2 = serviceDeliveryStore.createTask({
    projectId: project.id,
    title: "Review restaurant table map",
    priority: "MEDIUM"
  });
  const task2 = taskRes2.task;

  // Complete task 1 -> progress updates
  serviceDeliveryStore.updateTask(task1.id, { status: "DONE" });
  const projAfterTask = serviceDeliveryStore.getProject(project.id);
  assert.strictEqual(projAfterTask.progress, 50); // 1 of 2 tasks done

  // Blocker detection
  serviceDeliveryStore.updateTask(task2.id, {
    status: "BLOCKED",
    notes: "Awaiting restaurant POS API credentials from client"
  });
  const deliveryProfile = serviceDeliveryStore.getClientDeliveryProfile(client.id);
  assert.strictEqual(deliveryProfile.found, true);
  assert(deliveryProfile.blockers.some(b => b.includes("Awaiting restaurant POS API credentials")));

  // 13.10 Aggregated Reports & Dashboard-Ready Interfaces
  const projOverview = serviceDeliveryStore.getProjectOverview();
  assert.strictEqual(projOverview.totalProjects, 1);
  assert.strictEqual(projOverview.totalRequirements, 2);
  assert.strictEqual(projOverview.totalMilestones, 1);
  assert.strictEqual(projOverview.tasks.total, 2);
  assert.strictEqual(projOverview.tasks.DONE, 1);
  assert.strictEqual(projOverview.tasks.BLOCKED, 1);
  assert(projOverview.blockedItems.length > 0);

  // 13.11 CLI & Routing Integration
  assert.strictEqual(route("show projects"), "product");
  assert.strictEqual(route("show my projects"), "product");
  assert.strictEqual(route("show client projects"), "product");
  assert.strictEqual(route("show delivery profile for Luigi's Trattoria"), "product");
  assert.strictEqual(route("show onboarding for Luigi's Trattoria"), "product");
  assert.strictEqual(route("show project tasks for Luigi's Trattoria"), "product");
  assert.strictEqual(route("show blocked tasks"), "product");
  assert.strictEqual(route("show pending requirements"), "product");
  assert.strictEqual(route("create project for Luigi's Trattoria"), "product");
  assert.strictEqual(route("start project Luigi's Trattoria"), "product");
  assert.strictEqual(route("mark task done task-123"), "product");
  assert.strictEqual(route("mark requirement confirmed req-123"), "product");
  assert.strictEqual(route("mark milestone completed ms-123"), "product");

  // CLI execution verification
  const cliOverview = await runProduct("show projects", mockAskAI);
  assert(cliOverview.includes("CLIENT PROJECTS OVERVIEW"));
  assert(cliOverview.includes("Luigi's AI Reservation Delivery"));

  const cliProfile = await runProduct("show delivery profile for Luigi's Trattoria", mockAskAI);
  assert(cliProfile.includes("CLIENT DELIVERY PROFILE"));
  assert(cliProfile.includes("Luigi's Trattoria"));
  assert(cliProfile.includes("Twilio SMS integration"));

  const cliBlockers = await runProduct("show blocked tasks", mockAskAI);
  assert(cliBlockers.includes("BLOCKED ITEMS REPORT"));
  assert(cliBlockers.includes("Awaiting restaurant POS API credentials"));

  const cliReqs = await runProduct("show pending requirements", mockAskAI);
  assert(cliReqs.includes("PROJECT REQUIREMENTS REPORT"));
  assert(cliReqs.includes("10,000 monthly bookings capacity"));

  // AI Project Plan Assistance (Section 11) preserves [AI SUGGESTION] label
  const cliPlan = await runProduct("generate project plan for Luigi's Trattoria", mockAskAI);
  assert(cliPlan.includes("[AI SUGGESTION]"));

  // 13.12 Registry verification: Platform strictly maintains 9 AI agents
  assert.strictEqual(registry.getAgents().length, 9);
  assert.strictEqual(registry.hasAgent("product"), true);

  // Clean up
  serviceDeliveryStore.clearServiceDelivery();
  leadStore.clearLeads();
  crmStore.clearCRM();
  console.log("✔ Client Onboarding & Service Delivery Layer tests passed.\n");

  // =========================================================================
  // 14. Testing Communication Layer (Workspace, Templates, Draft Grounding, Lifecycle & Safety)
  // =========================================================================
  console.log("14. Testing Communication Layer & Message Workspace...");
  const communicationStore = require("../memory/communicationStore");
  const { runOutreach } = require("../skills/outreach");

  // Clean initial state
  communicationStore.clearCommunicationStore();
  leadStore.clearLeads();
  crmStore.clearCRM();
  serviceDeliveryStore.clearServiceDelivery();

  assert.strictEqual(communicationStore.getMessages().length, 0);

  // 14.1 Template Library & Grounding Safety
  const templates = communicationStore.getTemplates();
  assert(templates.length >= 12, "Default template library must contain standard templates");

  // Email & WhatsApp channel presence
  const emailTemplates = communicationStore.getTemplates({ channel: "EMAIL" });
  const whatsappTemplates = communicationStore.getTemplates({ channel: "WHATSAPP" });
  assert(emailTemplates.length > 0);
  assert(whatsappTemplates.length > 0);

  // Full Grounding Test: Complete Context
  const renderedFull = communicationStore.renderTemplate("INITIAL_OUTREACH", {
    company: "Luigi's Trattoria",
    contactName: "Luigi Bianchi",
    industry: "Restaurant & Hospitality",
    potentialNeed: "Online Table Reservation System"
  }, "EMAIL");
  assert(renderedFull.subject.includes("Luigi's Trattoria"));
  assert(renderedFull.body.includes("Luigi Bianchi"));
  assert(renderedFull.body.includes("Online Table Reservation System"));

  // Missing Data Safety Test: NEVER invent details or metrics
  const renderedMissing = communicationStore.renderTemplate("INITIAL_OUTREACH", {}, "EMAIL");
  assert(renderedMissing.subject.includes("[COMPANY NOT PROVIDED]"));
  assert(renderedMissing.body.includes("[NAME NOT PROVIDED]"));
  assert(renderedMissing.body.includes("[INDUSTRY NOT PROVIDED]"));
  assert(renderedMissing.body.includes("[NEED NOT SPECIFIED]"));

  // 14.2 Lead Message Draft Preparation Engine
  const commLead = leadStore.createLeadRecord({
    companyName: "Luigi's Trattoria",
    industry: "Italian Restaurant",
    location: "Chicago, IL",
    contactName: "Luigi Bianchi",
    contactRole: "Owner",
    email: "luigi@example.com",
    phone: "312-555-0144",
    potentialNeed: "AI Phone Reservation Assistant",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED",
    evidence: ["VERIFIED: User supplied Chicago business directory entry"]
  });
  leadStore.addLead(commLead);

  // Prepare Email Draft for Lead
  const leadDraftRes = communicationStore.prepareDraftForLead(commLead.id, "INITIAL_OUTREACH", "EMAIL");
  assert.strictEqual(leadDraftRes.success, true);
  const leadMsg = leadDraftRes.message;

  assert.strictEqual(leadMsg.leadId, commLead.id);
  assert.strictEqual(leadMsg.recipientName, "Luigi Bianchi");
  assert.strictEqual(leadMsg.recipientAddress, "luigi@example.com");
  assert.strictEqual(leadMsg.channel, "EMAIL");
  assert.strictEqual(leadMsg.status, "READY_FOR_REVIEW");
  assert.strictEqual(leadMsg.purpose, "INITIAL_OUTREACH");
  // Safety rule: every draft must start with [AI DRAFT — USER REVIEW REQUIRED]
  assert(leadMsg.body.startsWith("[AI DRAFT — USER REVIEW REQUIRED]"));
  assert(leadMsg.body.includes("Luigi Bianchi"));
  assert(leadMsg.body.includes("Luigi's Trattoria"));
  assert(leadMsg.body.includes("AI Phone Reservation Assistant"));

  // CRM Activity Integration: OUTREACH_PREPARED must be automatically logged
  const leadActs = crmStore.getLeadActivities(commLead.id);
  assert(leadActs.some(a => a.type === "OUTREACH_PREPARED" && a.metadata.messageId === leadMsg.id));

  // Prepare WhatsApp Draft for Lead
  const waDraftRes = communicationStore.prepareDraftForLead(commLead.id, "INITIAL_OUTREACH", "WHATSAPP");
  assert.strictEqual(waDraftRes.success, true);
  const waMsg = waDraftRes.message;
  assert.strictEqual(waMsg.channel, "WHATSAPP");
  assert.strictEqual(waMsg.subject, null); // WhatsApp has no subject line
  assert.strictEqual(waMsg.recipientAddress, "312-555-0144");
  assert(waMsg.body.startsWith("[AI DRAFT — USER REVIEW REQUIRED]"));

  // 14.3 Client Message Draft Preparation Engine
  const convResult = crmStore.convertLeadToClient(commLead.id, {
    service: "AI Phone Reservation System"
  });
  assert.strictEqual(convResult.success, true);
  const commClient = convResult.client;

  const clientDraftRes = communicationStore.prepareDraftForClient(commClient.id, "CLIENT_WELCOME", "EMAIL");
  assert.strictEqual(clientDraftRes.success, true);
  const clientMsg = clientDraftRes.message;
  assert.strictEqual(clientMsg.clientId, commClient.id);
  assert.strictEqual(clientMsg.purpose, "CLIENT_WELCOME");
  assert(clientMsg.body.startsWith("[AI DRAFT — USER REVIEW REQUIRED]"));
  assert(clientMsg.body.includes("Luigi's Trattoria"));
  assert(clientMsg.body.includes("AI Phone Reservation System"));

  // 14.4 Project Message Draft Preparation Engine
  const commProjRes = serviceDeliveryStore.createProject({
    clientId: commClient.id,
    projectName: "Luigi's Reservation Delivery",
    serviceType: "AI Phone Reservation System"
  });
  assert.strictEqual(commProjRes.success, true);
  const commProj = commProjRes.project;

  const projDraftRes = communicationStore.prepareDraftForProject(commProj.id, "PROJECT_UPDATE", "EMAIL");
  assert.strictEqual(projDraftRes.success, true);
  const projMsg = projDraftRes.message;
  assert.strictEqual(projMsg.projectId, commProj.id);
  assert.strictEqual(projMsg.purpose, "PROJECT_UPDATE");
  assert(projMsg.body.startsWith("[AI DRAFT — USER REVIEW REQUIRED]"));
  assert(projMsg.body.includes("Luigi's Reservation Delivery"));

  // 14.5 Message Lifecycle & State Transitions
  // DRAFT / READY_FOR_REVIEW -> APPROVED
  assert.strictEqual(leadMsg.status, "READY_FOR_REVIEW");
  const approvedMsg = communicationStore.markMessageApproved(leadMsg.id);
  assert.strictEqual(approvedMsg.status, "APPROVED");
  assert(approvedMsg.approvedAt !== null);

  // APPROVED -> COPIED
  const copiedMsg = communicationStore.markMessageCopied(leadMsg.id);
  assert.strictEqual(copiedMsg.status, "COPIED");
  assert(copiedMsg.copiedAt !== null);

  // 14.6 Safety: Direct Sending is Strictly Prohibited in ₹0 Local Mode
  assert.throws(() => {
    communicationStore.updateMessage(leadMsg.id, { status: "SENT" });
  }, /Direct sending is disabled/);

  // 14.7 Communication Overview Aggregations
  const commOverview = communicationStore.getCommunicationOverview();
  assert(commOverview.totalMessages >= 4);
  assert(commOverview.totalTemplates >= 12);
  assert(commOverview.byChannel.EMAIL >= 3);
  assert(commOverview.byChannel.WHATSAPP >= 1);
  assert(commOverview.byStatus.COPIED >= 1);

  // 14.8 Outreach Agent CLI Execution Integration
  const cliDraft = await runOutreach("draft message for Luigi's Trattoria", mockAskAI);
  assert(cliDraft.includes("COMMUNICATION WORKSPACE: PREPARED DRAFT"));
  assert(cliDraft.includes("Luigi Bianchi"));
  assert(cliDraft.includes("EMAIL [PREPARED / NOT SENT]"));
  assert(cliDraft.includes("[AI DRAFT — USER REVIEW REQUIRED]"));

  const cliWaDraft = await runOutreach("prepare whatsapp for Luigi's Trattoria", mockAskAI);
  assert(cliWaDraft.includes("WHATSAPP [PREPARED / NOT SENT]"));

  const cliMessages = await runOutreach("show messages", mockAskAI);
  assert(cliMessages.includes("COMMUNICATION WORKSPACE: PREPARED MESSAGES"));
  assert(cliMessages.includes(leadMsg.id));

  const cliTemplates = await runOutreach("show templates", mockAskAI);
  assert(cliTemplates.includes("COMMUNICATION TEMPLATES REPORT"));
  assert(cliTemplates.includes("Initial Outreach (Email)"));

  const cliApprove = await runOutreach(`approve message ${waMsg.id}`, mockAskAI);
  assert(cliApprove.includes("MESSAGE APPROVED"));
  assert.strictEqual(communicationStore.getMessage(waMsg.id).status, "APPROVED");

  const cliCopy = await runOutreach(`copy message ${waMsg.id}`, mockAskAI);
  assert(cliCopy.includes("MESSAGE COPIED"));
  assert.strictEqual(communicationStore.getMessage(waMsg.id).status, "COPIED");

  // Nonexistent lead error handling
  const cliNotFound = await runOutreach("draft message for Nonexistent Corp", mockAskAI);
  assert(cliNotFound.includes("LEAD OR CLIENT NOT FOUND"));

  // 14.9 Router Tests for Communication Layer
  assert.strictEqual(route("draft message for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("draft email for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("draft whatsapp for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("prepare message for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("prepare email for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("prepare whatsapp for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("prepare outreach for Luigi's Trattoria"), "outreach");
  assert.strictEqual(route("show messages"), "outreach");
  assert.strictEqual(route("show templates"), "outreach");
  assert.strictEqual(route("approve message msg-123"), "outreach");
  assert.strictEqual(route("copy message msg-123"), "outreach");

  // Preserved routing: prepare follow-up still routes to sales-pipeline
  assert.strictEqual(route("prepare follow-up for Luigi's Trattoria"), "sales-pipeline");
  assert.strictEqual(route("find potential customers"), "lead-generation");
  assert.strictEqual(route("qualify my leads"), "lead-qualification");
  assert.strictEqual(route("show projects"), "product");
  assert.strictEqual(route("research competitor pricing"), "research");
  assert.strictEqual(route("create a business strategy"), "strategy");

  // 14.10 Registry Verification: Strictly 9 AI Agents Preserved (₹0 / No 10th agent)
  assert.strictEqual(registry.getAgents().length, 9);
  assert.strictEqual(registry.hasAgent("outreach"), true);
  assert.strictEqual(registry.hasAgent("communication"), false); // Communication is a data/workspace layer, not a 10th agent!

  // Clean up
  communicationStore.clearCommunicationStore();
  leadStore.clearLeads();
  crmStore.clearCRM();
  serviceDeliveryStore.clearServiceDelivery();
  console.log("✔ Communication Layer & Message Workspace tests passed.\n");

  // =========================================================================
  // 15. Testing Security & Authentication Layer
  // =========================================================================
  console.log("15. Testing Security & Authentication Layer...");
  const cryptoUtils = require("../security/crypto");
  const userStore = require("../memory/userStore");
  const sessionManager = require("../security/session");
  const permissionsManager = require("../security/permissions");
  const rateLimiter = require("../security/rateLimiter");
  const securityAuditStore = require("../memory/securityAuditStore");
  const authMiddleware = require("../security/auth");

  // Reset stores for tests
  userStore.clearUsers();
  sessionManager.clearSessions();
  securityAuditStore.clearSecurityAudit();
  rateLimiter.clearRateLimits();

  // 15.1 Built-in Cryptography & Password Hashing
  // Reject non-string / short passwords
  assert.throws(() => cryptoUtils.hashPassword(""), /Password must be a non-empty string/);
  assert.throws(() => cryptoUtils.hashPassword("short"), /Password must be at least 8 characters long/);
  assert.throws(() => cryptoUtils.hashPassword(null), /Password must be a non-empty string/);

  // Hash valid password
  const rawPwd = "SuperSecretPassword123!";
  const hash1 = cryptoUtils.hashPassword(rawPwd);
  const hash2 = cryptoUtils.hashPassword(rawPwd);
  assert(hash1.includes(":"));
  assert(hash2.includes(":"));
  // Unique random salt ensures different hashes for the same password
  assert.notStrictEqual(hash1, hash2);

  // Verification
  assert.strictEqual(cryptoUtils.verifyPassword(rawPwd, hash1), true);
  assert.strictEqual(cryptoUtils.verifyPassword(rawPwd, hash2), true);
  assert.strictEqual(cryptoUtils.verifyPassword("WrongPassword123!", hash1), false);
  assert.strictEqual(cryptoUtils.verifyPassword("", hash1), false);
  assert.strictEqual(cryptoUtils.verifyPassword(rawPwd, "malformed-hash-string"), false);
  assert.strictEqual(cryptoUtils.verifyPassword(null, hash1), false);

  // Token generation
  const tok1 = cryptoUtils.generateToken(32);
  const tok2 = cryptoUtils.generateToken(32);
  assert.strictEqual(tok1.length, 64);
  assert.strictEqual(tok2.length, 64);
  assert.notStrictEqual(tok1, tok2);

  // 15.2 User Store & Sanitization
  // Validation errors
  assert.throws(() => userStore.createUser({ name: "", email: "test@example.com", password: "password123" }), /User name is required/);
  assert.throws(() => userStore.createUser({ name: "Bob", email: "invalid-email", password: "password123" }), /valid email address is required/);
  assert.throws(() => userStore.createUser({ name: "Bob", email: "bob@example.com", password: "tiny" }), /Password must be at least 8 characters/);

  // Create users across all 4 roles
  const adminUser = userStore.createUser({
    name: "System Admin",
    email: "Admin@Domain.Com", // Mixed case test
    password: "AdminPassword123!",
    role: "ADMIN"
  });
  assert.strictEqual(adminUser.email, "admin@domain.com");
  assert.strictEqual(adminUser.role, "ADMIN");
  assert.strictEqual(adminUser.status, "ACTIVE");
  assert.strictEqual(adminUser.passwordHash, undefined); // Strictly sanitized!

  const salesUser = userStore.createUser({
    name: "Sam Sales",
    email: "sam@domain.com",
    password: "SalesPassword123!",
    role: "SALES"
  });
  assert.strictEqual(salesUser.role, "SALES");
  assert.strictEqual(salesUser.passwordHash, undefined);

  const deliveryUser = userStore.createUser({
    name: "Dana Delivery",
    email: "dana@domain.com",
    password: "DeliveryPassword123!",
    role: "DELIVERY"
  });
  assert.strictEqual(deliveryUser.role, "DELIVERY");

  const viewerUser = userStore.createUser({
    name: "Val Viewer",
    email: "val@domain.com",
    password: "ViewerPassword123!",
    role: "VIEWER"
  });
  assert.strictEqual(viewerUser.role, "VIEWER");

  // Duplicate email prevention
  assert.throws(() => {
    userStore.createUser({ name: "Dup Admin", email: "ADMIN@DOMAIN.COM", password: "SomePassword123!" });
  }, /already exists/);

  // User retrieval
  const allUsers = userStore.getUsers();
  assert.strictEqual(allUsers.length, 4);
  for (const u of allUsers) {
    assert.strictEqual(u.passwordHash, undefined); // All returned users are sanitized
  }

  const fetchedById = userStore.getUserById(adminUser.id);
  assert.strictEqual(fetchedById.name, "System Admin");
  assert(fetchedById.passwordHash); // Internal store holds hash

  const fetchedByEmail = userStore.getUserByEmail("admin@domain.com");
  assert.strictEqual(fetchedByEmail.id, adminUser.id);

  // 15.3 Protection of Last Active Administrator
  assert.throws(() => {
    userStore.disableUser(adminUser.id);
  }, /Cannot disable or remove the ADMIN role of the only active administrator/);

  assert.throws(() => {
    userStore.updateUser(adminUser.id, { role: "VIEWER" });
  }, /Cannot disable or remove the ADMIN role of the only active administrator/);

  // Create a second admin
  const adminUser2 = userStore.createUser({
    name: "Second Admin",
    email: "admin2@domain.com",
    password: "Admin2Password123!",
    role: "ADMIN"
  });
  assert.strictEqual(adminUser2.role, "ADMIN");

  // Now disabling adminUser2 succeeds because adminUser is still active
  const disabledAdmin2 = userStore.disableUser(adminUser2.id);
  assert.strictEqual(disabledAdmin2.status, "DISABLED");

  // 15.4 Credential Verification & Authentication
  // Wrong password
  const badAuth = userStore.verifyUserCredentials("admin@domain.com", "WrongPassword123!");
  assert.strictEqual(badAuth, null);

  // Unknown email
  const unknownAuth = userStore.verifyUserCredentials("ghost@domain.com", "AdminPassword123!");
  assert.strictEqual(unknownAuth, null);

  // Disabled user cannot log in
  const disabledAuth = userStore.verifyUserCredentials("admin2@domain.com", "Admin2Password123!");
  assert.strictEqual(disabledAuth, null);

  // Successful authentication
  const goodAuth = userStore.verifyUserCredentials("admin@domain.com", "AdminPassword123!");
  assert(goodAuth !== null);
  assert.strictEqual(goodAuth.id, adminUser.id);
  assert.strictEqual(goodAuth.email, "admin@domain.com");
  assert.strictEqual(goodAuth.passwordHash, undefined);

  // 15.5 Session Management & Token Handling
  const session = sessionManager.createSession(goodAuth);
  assert(session.token);
  assert.strictEqual(session.token.length, 64);
  assert.strictEqual(session.userId, adminUser.id);
  assert.strictEqual(session.role, "ADMIN");

  // Retrieve active session
  const activeSession = sessionManager.getSession(session.token);
  assert.strictEqual(activeSession.userId, adminUser.id);

  // Token extraction from Authorization header
  const reqWithHeader = { headers: { authorization: `Bearer ${session.token}` } };
  assert.strictEqual(sessionManager.extractToken(reqWithHeader), session.token);

  // Token extraction from Cookie
  const reqWithCookie = { headers: { cookie: `ai_biz_session=${session.token}; other=abc` } };
  assert.strictEqual(sessionManager.extractToken(reqWithCookie), session.token);

  // Cookie building helpers
  const cookieHeader = sessionManager.buildSessionCookie(session.token, false);
  assert(cookieHeader.includes(`ai_biz_session=${session.token}`));
  assert(cookieHeader.includes("HttpOnly"));
  assert(cookieHeader.includes("SameSite=Lax"));

  const clearCookieHeader = sessionManager.buildClearSessionCookie();
  assert(clearCookieHeader.includes("Max-Age=0"));

  // Destroy session
  const destroyed = sessionManager.destroySession(session.token);
  assert.strictEqual(destroyed, true);
  assert.strictEqual(sessionManager.getSession(session.token), null);

  // 15.6 Role-Based Access Control (RBAC) & Permissions Matrix
  // ADMIN has full access
  assert.strictEqual(permissionsManager.hasPermission("ADMIN", "dashboard.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("ADMIN", "leads.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("ADMIN", "projects.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("ADMIN", "users.manage"), true);
  assert.strictEqual(permissionsManager.hasPermission("ADMIN", "audit.read"), true);

  // SALES permissions
  assert.strictEqual(permissionsManager.hasPermission("SALES", "dashboard.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("SALES", "leads.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("SALES", "leads.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("SALES", "pipeline.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("SALES", "communication.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("SALES", "projects.write"), false); // Forbidden
  assert.strictEqual(permissionsManager.hasPermission("SALES", "tasks.write"), false); // Forbidden
  assert.strictEqual(permissionsManager.hasPermission("SALES", "users.manage"), false); // Forbidden
  assert.strictEqual(permissionsManager.hasPermission("SALES", "audit.read"), false); // Forbidden

  // DELIVERY permissions
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "dashboard.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "projects.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "tasks.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "communication.write"), true);
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "leads.write"), false); // Forbidden
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "users.manage"), false); // Forbidden
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "audit.read"), false); // Forbidden

  // VIEWER permissions (read-only)
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "dashboard.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "leads.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "projects.read"), true);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "leads.write"), false);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "projects.write"), false);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "communication.write"), false);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "users.manage"), false);

  // 15.7 Rate Limiter Protection
  rateLimiter.clearRateLimits();
  const testIp = "192.168.1.100";
  assert.strictEqual(rateLimiter.checkRateLimit(testIp).allowed, true);

  for (let i = 0; i < 5; i++) {
    rateLimiter.recordFailedAttempt(testIp);
  }

  const blockedCheck = rateLimiter.checkRateLimit(testIp);
  assert.strictEqual(blockedCheck.allowed, false);
  assert.strictEqual(blockedCheck.remaining, 0);
  assert(blockedCheck.error.includes("Too many failed login attempts"));

  // Reset rate limit
  rateLimiter.resetRateLimit(testIp);
  assert.strictEqual(rateLimiter.checkRateLimit(testIp).allowed, true);

  // 15.8 Security Audit Logging
  const logs = securityAuditStore.getSecurityAuditLogs();
  assert(logs.length > 0);
  assert(logs.some(l => l.type === "USER_CREATED"));
  assert(logs.some(l => l.type === "LOGIN_SUCCESS"));
  assert(logs.some(l => l.type === "LOGIN_FAILED"));

  // Verify confidentiality: ZERO passwords, hashes, secrets or tokens in logs
  for (const log of logs) {
    assert.strictEqual(log.password, undefined);
    assert.strictEqual(log.passwordHash, undefined);
    assert.strictEqual(log.token, undefined);
    if (log.details) {
      assert.strictEqual(log.details.password, undefined);
      assert.strictEqual(log.details.passwordHash, undefined);
      assert.strictEqual(log.details.token, undefined);
    }
  }

  // 15.9 Admin Bootstrap Mechanism
  userStore.clearUsers();
  // Without env vars: bootstrap skipped
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  const noEnvBootstrap = userStore.bootstrapAdmin();
  assert.strictEqual(noEnvBootstrap.created, false);

  // With env vars: bootstrap succeeds
  process.env.ADMIN_EMAIL = "bootadmin@company.local";
  process.env.ADMIN_PASSWORD = "BootPassword123!";
  const envBootstrap = userStore.bootstrapAdmin();
  assert.strictEqual(envBootstrap.created, true);
  assert.strictEqual(envBootstrap.user.email, "bootadmin@company.local");
  assert.strictEqual(envBootstrap.user.role, "ADMIN");

  // Re-running bootstrap when users exist skips creation
  const rerunBootstrap = userStore.bootstrapAdmin();
  assert.strictEqual(rerunBootstrap.created, false);

  // 15.10 Platform Integrity: Strictly 9 AI Agents Preserved (No 10th agent)
  assert.strictEqual(registry.getAgents().length, 9);
  assert.strictEqual(registry.hasAgent("auth"), false);
  assert.strictEqual(registry.hasAgent("security"), false);

  const expectedAgents = [
    "discovery",
    "strategy",
    "product",
    "finance",
    "outreach",
    "research",
    "lead-generation",
    "lead-qualification",
    "sales-pipeline"
  ];
  for (const agentId of expectedAgents) {
    assert.strictEqual(registry.hasAgent(agentId), true);
  }

  // Clean up
  userStore.clearUsers();
  sessionManager.clearSessions();
  securityAuditStore.clearSecurityAudit();
  rateLimiter.clearRateLimits();

  console.log("✔ Security & Authentication Layer tests passed.\n");

  // =========================================================================
  // 16. Testing Level 3 Communication Gateway
  // =========================================================================
  {
    console.log("16. Testing Level 3 Communication Gateway...");
  const commTypes = require("../communication/types");
  const commLifecycle = require("../communication/lifecycle");
  const commGateway = require("../communication/gateway");
  const commWebhooks = require("../communication/webhooks");
  const commProviders = require("../communication/providers");
  const commEventsStore = require("../memory/communicationEventsStore");

  // Clean communication stores before starting
  communicationStore.clearCommunicationStore();
  commEventsStore.clearCommunicationEvents();
  leadStore.clearLeads();
  crmStore.clearCRM();

  // 16.1 Provider Registry & Interface
  const defaultProvider = commProviders.getProvider();
  assert.strictEqual(defaultProvider.name, "local");
  assert.strictEqual(typeof defaultProvider.send, "function");
  assert.strictEqual(typeof defaultProvider.simulateDelivery, "function");
  assert.strictEqual(typeof defaultProvider.simulateRead, "function");
  assert.strictEqual(typeof defaultProvider.simulateReply, "function");
  assert.strictEqual(typeof defaultProvider.simulateFailure, "function");

  const providerList = commProviders.listProviders();
  assert(providerList.some(p => p.id === "local"));

  // Register custom dummy provider for pluggability test
  commProviders.registerProvider("test-dummy", {
    name: "test-dummy",
    send: async () => ({ success: true, providerMessageId: "dummy-1" })
  });
  assert(commProviders.listProviders().some(p => p.id === "test-dummy"));
  assert.strictEqual(commProviders.getProvider("test-dummy").name, "test-dummy");

  // 16.2 Lifecycle State Transitions & Approval Safety Guard
  assert.strictEqual(commLifecycle.isValidTransition("DRAFT", "READY_FOR_REVIEW"), true);
  assert.strictEqual(commLifecycle.isValidTransition("READY_FOR_REVIEW", "APPROVED"), true);
  assert.strictEqual(commLifecycle.isValidTransition("APPROVED", "SEND_REQUESTED"), true);
  assert.strictEqual(commLifecycle.isValidTransition("SEND_REQUESTED", "SENT"), true);
  assert.strictEqual(commLifecycle.isValidTransition("SENT", "DELIVERED"), true);
  assert.strictEqual(commLifecycle.isValidTransition("DELIVERED", "READ"), true);
  assert.strictEqual(commLifecycle.isValidTransition("READ", "REPLIED"), true);
  assert.strictEqual(commLifecycle.isValidTransition("SENT", "FAILED"), true);

  // Illegal transitions directly violating approval guard
  assert.strictEqual(commLifecycle.isValidTransition("DRAFT", "SENT"), false);
  assert.strictEqual(commLifecycle.isValidTransition("READY_FOR_REVIEW", "SENT"), false);
  assert.strictEqual(commLifecycle.isValidTransition("READY_FOR_REVIEW", "SEND_REQUESTED"), false);
  assert.throws(
    () => commLifecycle.validateTransition("READY_FOR_REVIEW", "SENT"),
    /Safety Violation|Invalid transition/i
  );

  // 16.3 Pre-Send Checks: Approval, Missing Recipient, and Opt-out Prevention
  const testLead = leadStore.createLeadRecord({
    companyName: "Acme Trattoria",
    industry: "Restaurant",
    location: "Chicago, IL",
    contactName: "Mario Rossi",
    email: "mario@acme.com",
    phone: "312-555-0999",
    potentialNeed: "Table Ordering AI",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED",
    communicationOptOut: false
  });
  leadStore.addLead(testLead);

  const l3DraftRes = communicationStore.prepareDraftForLead(testLead.id, "INITIAL_OUTREACH", "EMAIL");
  assert.strictEqual(l3DraftRes.success, true);
  const msg1 = l3DraftRes.message;
  assert.strictEqual(msg1.status, "READY_FOR_REVIEW");

  // Attempting to send unapproved draft fails
  await assert.rejects(
    async () => await commGateway.sendMessage(msg1.id),
    /Approval Required: Cannot send message in status "READY_FOR_REVIEW"/
  );

  // Opt-out guard test
  const optOutLead = leadStore.createLeadRecord({
    companyName: "OptOut Corp",
    email: "optout@example.com",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED",
    communicationOptOut: true
  });
  leadStore.addLead(optOutLead);
  const optOutDraft = communicationStore.prepareDraftForLead(optOutLead.id, "INITIAL_OUTREACH", "EMAIL");
  communicationStore.updateMessage(optOutDraft.message.id, { status: "APPROVED" });
  await assert.rejects(
    async () => await commGateway.sendMessage(optOutDraft.message.id),
    /Recipient has explicitly opted out/
  );

  // 16.4 Complete Send Lifecycle via LocalSimulatorProvider (₹0)
  // Approve msg1 and send via Gateway
  communicationStore.updateMessage(msg1.id, { status: "APPROVED" });
  const sendRes = await commGateway.sendMessage(msg1.id);
  assert.strictEqual(sendRes.success, true);
  assert.strictEqual(sendRes.message.status, "SENT");
  assert(sendRes.message.providerMessageId.startsWith("sim-"));

  // Check updated message in store
  const sentMsg = communicationStore.getMessage(msg1.id);
  assert.strictEqual(sentMsg.status, "SENT");
  assert.strictEqual(sentMsg.provider, "local");
  assert(sentMsg.sentAt);

  // Verify CRM activity logged automatically
  const leadActivities = crmStore.getActivities({ leadId: testLead.id });
  const contactedAct = leadActivities.find(a => a.type === "CONTACTED");
  assert(contactedAct, "CONTACTED activity must be recorded in CRM");
  assert(contactedAct.description.includes("Outbound EMAIL message sent"));

  // Verify Sales Pipeline updated to CONTACTED
  const updatedLead1 = leadStore.getLead(testLead.id);
  assert.strictEqual(updatedLead1.pipelineStatus, "CONTACTED");

  // Verify SENT event recorded in communication_events.json
  const sentEvents = commEventsStore.getEventsForMessage(msg1.id);
  assert(sentEvents.some(e => e.type === "SENT"));

  // 16.5 Event Progression: DELIVERED -> READ -> REPLIED with Real Customer Text
  // Simulate Delivery
  const deliverRes = await commGateway.simulateDelivery(msg1.id);
  assert.strictEqual(deliverRes.success, true);
  assert.strictEqual(deliverRes.message.status, "DELIVERED");
  const deliveredMsg = communicationStore.getMessage(msg1.id);
  assert.strictEqual(deliveredMsg.status, "DELIVERED");
  assert(deliveredMsg.deliveredAt);

  // Simulate Read Receipt
  const readRes = await commGateway.simulateRead(msg1.id);
  assert.strictEqual(readRes.success, true);
  assert.strictEqual(readRes.message.status, "READ");
  const readMsg = communicationStore.getMessage(msg1.id);
  assert.strictEqual(readMsg.status, "READ");
  assert(readMsg.readAt);

  // Simulate Inbound Customer Reply with Real Evidence Text
  const customerReplyText = "Hello! Yes, we are actively looking for an ordering bot. Can you call me tomorrow at 2 PM?";
  const replyRes = await commGateway.simulateReply(msg1.id, customerReplyText);
  assert.strictEqual(replyRes.success, true);
  assert.strictEqual(replyRes.message.status, "REPLIED");

  const repliedMsg = communicationStore.getMessage(msg1.id);
  assert.strictEqual(repliedMsg.status, "REPLIED");
  assert(repliedMsg.repliedAt);
  assert.strictEqual(repliedMsg.inboundReplies.length, 1);
  assert.strictEqual(repliedMsg.inboundReplies[0].text, customerReplyText);

  // Verify CRM activity logged for customer reply
  const replyActs = crmStore.getActivities({ leadId: testLead.id }).filter(a => a.type === "REPLIED");
  assert.strictEqual(replyActs.length, 1);
  assert(replyActs[0].description.includes("Customer replied"));
  assert(replyActs[0].metadata.replyText.includes(customerReplyText));

  // Verify Sales Pipeline advanced to REPLIED (and NOT fabricated as INTERESTED)
  const repliedLead = leadStore.getLead(testLead.id);
  assert.strictEqual(repliedLead.pipelineStatus, "REPLIED");

  // 16.6 Error / Failure Handling
  const failLead = leadStore.createLeadRecord({
    companyName: "Failing Corp",
    email: "fail@example.com",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED"
  });
  leadStore.addLead(failLead);
  const failDraft = communicationStore.prepareDraftForLead(failLead.id, "INITIAL_OUTREACH", "EMAIL");
  communicationStore.updateMessage(failDraft.message.id, { status: "APPROVED" });
  await commGateway.sendMessage(failDraft.message.id);

  const failRes = await commGateway.simulateFailure(failDraft.message.id, "Simulated network timeout");
  assert.strictEqual(failRes.success, true);
  assert.strictEqual(failRes.message.status, "FAILED");
  const failedMsg = communicationStore.getMessage(failDraft.message.id);
  assert.strictEqual(failedMsg.status, "FAILED");
  assert(failedMsg.errorMessage.includes("Simulated network timeout"));

  // 16.7 Idempotency Protection: Duplicate Events Ignored
  const duplicateEvt = {
    eventId: "evt_dup_test_123",
    providerMessageId: sentMsg.providerMessageId,
    type: "DELIVERED",
    timestamp: new Date().toISOString()
  };
  const firstEvt = await commGateway.handleEvent(duplicateEvt);
  assert.strictEqual(firstEvt.success, true);

  // Second delivery with identical eventId must be detected as duplicate and safely ignored
  const secondEvt = await commGateway.handleEvent(duplicateEvt);
  assert.strictEqual(secondEvt.success, true);
  assert.strictEqual(secondEvt.duplicate, true);

  // 16.8 Inbound Webhook Receiver
  const whRes = await commWebhooks.processWebhook("local", {
    eventId: "wh_evt_456",
    providerMessageId: sentMsg.providerMessageId,
    type: "READ",
    timestamp: new Date().toISOString()
  });
  assert.strictEqual(whRes.statusCode, 200);
  assert.strictEqual(whRes.body.success, true);

  // 16.9 Role & Permissions Verification
  assert.strictEqual(permissionsManager.hasPermission("ADMIN", "communication.send"), true);
  assert.strictEqual(permissionsManager.hasPermission("SALES", "communication.send"), true);
  assert.strictEqual(permissionsManager.hasPermission("DELIVERY", "communication.send"), false);
  assert.strictEqual(permissionsManager.hasPermission("VIEWER", "communication.send"), false);

  // 16.10 CLI & Router Integration for Level 3
  const cliLead = leadStore.createLeadRecord({
    companyName: "CLI Trattoria",
    email: "cli@example.com",
    qualificationStatus: "QUALIFIED",
    pipelineStatus: "NOT_CONTACTED"
  });
  leadStore.addLead(cliLead);
  const cliDraft2 = communicationStore.prepareDraftForLead(cliLead.id, "INITIAL_OUTREACH", "EMAIL");
  communicationStore.updateMessage(cliDraft2.message.id, { status: "APPROVED" });

  const cliSendSuccess = await runOutreach(`send message ${cliDraft2.message.id}`, mockAskAI);
  assert(cliSendSuccess.includes("COMMUNICATION GATEWAY: MESSAGE SENT"));
  assert(cliSendSuccess.includes("SENT"));

  const cliDelivered = await runOutreach(`simulate delivered ${cliDraft2.message.id}`, mockAskAI);
  assert(cliDelivered.includes("DELIVERED"));

  const cliRead = await runOutreach(`simulate read ${cliDraft2.message.id}`, mockAskAI);
  assert(cliRead.includes("READ"));

  const cliReply = await runOutreach(`simulate reply ${cliDraft2.message.id} Yes please send pricing`, mockAskAI);
  assert(cliReply.includes("REPLIED"));
  assert(cliReply.includes("Yes please send pricing"));

  const cliStatus = await runOutreach(`show communication status ${cliDraft2.message.id}`, mockAskAI);
  assert(cliStatus.includes("COMMUNICATION STATUS REPORT"));
  assert(cliStatus.includes(cliDraft2.message.id));

  const cliEvents = await runOutreach("show communication events", mockAskAI);
  assert(cliEvents.includes("COMMUNICATION GATEWAY EVENTS"));

  // Router rules for Level 3
  assert.strictEqual(route("send message msg-123"), "outreach");
  assert.strictEqual(route("simulate delivered msg-123"), "outreach");
  assert.strictEqual(route("simulate read msg-123"), "outreach");
  assert.strictEqual(route("simulate reply msg-123 great service"), "outreach");
  assert.strictEqual(route("simulate failure msg-123"), "outreach");
  assert.strictEqual(route("show communication events"), "outreach");
  assert.strictEqual(route("show communication status msg-123"), "outreach");

  // 16.11 Backwards Compatibility
  // Level 2 manual approval and copy flow still functions without changes
  const level2Lead = leadStore.createLeadRecord({
    companyName: "Level 2 Bistro",
    email: "bistro@example.com"
  });
  leadStore.addLead(level2Lead);
  const l2Draft = communicationStore.prepareDraftForLead(level2Lead.id, "INITIAL_OUTREACH", "EMAIL");
  const approvedL2 = communicationStore.approveMessage(l2Draft.message.id);
  assert.strictEqual(approvedL2.status, "APPROVED");
  const copiedL2 = communicationStore.copyMessage(l2Draft.message.id);
  assert.strictEqual(copiedL2.status, "COPIED");

  // 16.12 Platform Integrity: Exactly 9 AI Agents Preserved (No 10th agent)
  assert.strictEqual(registry.getAgents().length, 9);
  assert.strictEqual(registry.hasAgent("communication-gateway"), false);
  assert.strictEqual(registry.hasAgent("gateway"), false);
  for (const agentId of expectedAgents) {
    assert.strictEqual(registry.hasAgent(agentId), true);
  }

  // Clean up
  communicationStore.clearCommunicationStore();
  commEventsStore.clearCommunicationEvents();
  leadStore.clearLeads();
  crmStore.clearCRM();

  console.log("✔ Level 3 Communication Gateway tests passed.\n");
  }

  // =========================================================================
  // 17. Testing Real Email Provider Adapter (Brevo)
  // =========================================================================
  {
    console.log("17. Testing Real Email Provider Adapter (Brevo)...");
    const { BrevoEmailProvider } = require("../communication/providers/brevoEmail");
    const commProviders = require("../communication/providers");
    const commGateway = require("../communication/gateway");
    const commWebhooks = require("../communication/webhooks");
    const commEventsStore = require("../memory/communicationEventsStore");

    // Clean communication stores before starting
    communicationStore.clearCommunicationStore();
    commEventsStore.clearCommunicationEvents();
    leadStore.clearLeads();
    crmStore.clearCRM();

    // 17.1 Provider Registration & Capabilities
    const brevoProvider = commProviders.getProvider("brevo");
    assert(brevoProvider instanceof BrevoEmailProvider);
    assert.strictEqual(brevoProvider.name, "brevo");
    assert.strictEqual(brevoProvider.hasCapability("send"), true);
    assert.strictEqual(brevoProvider.hasCapability("deliveryStatus"), true);
    assert.strictEqual(brevoProvider.hasCapability("readStatus"), true);
    assert.strictEqual(brevoProvider.hasCapability("inboundMessages"), false);
    assert.strictEqual(brevoProvider.hasCapability("attachments"), false);

    // Verify Local simulator is still registered and active
    const localProvider = commProviders.getProvider("local");
    assert.strictEqual(localProvider.name, "local");

    const providersList = commProviders.listProviders();
    assert(providersList.some(p => p.id === "brevo"));
    assert(providersList.some(p => p.id === "local"));

    // 17.2 Configuration Validation
    // Missing all config
    const emptyConfigRes = brevoProvider.validateConfiguration({ apiKey: "", senderEmail: "", senderName: "" });
    assert.strictEqual(emptyConfigRes.valid, false);
    assert(emptyConfigRes.errors.length >= 3);
    assert(emptyConfigRes.errors.some(e => e.includes("BREVO_API_KEY")));
    assert(emptyConfigRes.errors.some(e => e.includes("BREVO_SENDER_EMAIL")));
    assert(emptyConfigRes.errors.some(e => e.includes("BREVO_SENDER_NAME")));

    // Invalid email
    const badEmailRes = brevoProvider.validateConfiguration({
      apiKey: "xkeysib-1234567890abcdef",
      senderEmail: "invalid-email-address",
      senderName: "Agent Team"
    });
    assert.strictEqual(badEmailRes.valid, false);
    assert(badEmailRes.errors.some(e => e.includes("BREVO_SENDER_EMAIL")));

    // Valid configuration
    const validConfig = {
      apiKey: "xkeysib-validtestkey1234567890abcdef",
      senderEmail: "verified.sender@mycompany.com",
      senderName: "AI Business Agent"
    };
    const validConfigRes = brevoProvider.validateConfiguration(validConfig);
    assert.strictEqual(validConfigRes.valid, true);
    assert.strictEqual(validConfigRes.errors.length, 0);

    // Unconfigured send test (returns safe error without crashing)
    const savedApiKey = process.env.BREVO_API_KEY;
    const savedSenderEmail = process.env.BREVO_SENDER_EMAIL;
    const savedSenderName = process.env.BREVO_SENDER_NAME;

    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;

    const unconfLead = leadStore.createLeadRecord({
      companyName: "Unconfigured Test Corp",
      email: "test@example.com",
      qualificationStatus: "QUALIFIED",
      pipelineStatus: "NOT_CONTACTED"
    });
    leadStore.addLead(unconfLead);
    const unconfDraft = communicationStore.prepareDraftForLead(unconfLead.id, "INITIAL_OUTREACH", "EMAIL");
    communicationStore.markMessageApproved(unconfDraft.message.id);

    const unconfSend = await brevoProvider.send(communicationStore.getMessage(unconfDraft.message.id));
    assert.strictEqual(unconfSend.success, false);
    assert.strictEqual(unconfSend.errorCode, "CONFIG_ERROR");
    assert(unconfSend.errorMessage.includes("Brevo provider is selected but required credentials are not configured"));

    // 17.3 Approval Safety Guard
    // Re-set mock environment config
    process.env.BREVO_API_KEY = "xkeysib-mocktestkey1234567890abcdef";
    process.env.BREVO_SENDER_EMAIL = "outreach@company.local";
    process.env.BREVO_SENDER_NAME = "Outreach Specialist";

    const draftLead = leadStore.createLeadRecord({
      companyName: "Unapproved Lead Corp",
      email: "unapproved@example.com"
    });
    leadStore.addLead(draftLead);
    const unapprovedDraft = communicationStore.prepareDraftForLead(draftLead.id, "INITIAL_OUTREACH", "EMAIL");
    assert.strictEqual(unapprovedDraft.message.status, "READY_FOR_REVIEW");

    await assert.rejects(
      async () => await brevoProvider.send(unapprovedDraft.message),
      /Approval Required: Cannot send message in status "READY_FOR_REVIEW"/
    );

    // 17.4 Opt-Out Safety Guard
    const optLead = leadStore.createLeadRecord({
      companyName: "Opted Out Lead",
      email: "optout@example.com",
      communicationOptOut: true
    });
    leadStore.addLead(optLead);
    const optDraft = communicationStore.prepareDraftForLead(optLead.id, "INITIAL_OUTREACH", "EMAIL");
    communicationStore.markMessageApproved(optDraft.message.id);
    await assert.rejects(
      async () => await commGateway.sendMessage(optDraft.message.id, { provider: "brevo" }),
      /Recipient has explicitly opted out/
    );

    // 17.5 Channel Guard (Brevo only handles EMAIL)
    const waDraft = communicationStore.prepareDraftForLead(unconfLead.id, "INITIAL_OUTREACH", "WHATSAPP");
    communicationStore.markMessageApproved(waDraft.message.id);
    await assert.rejects(
      async () => await brevoProvider.send(communicationStore.getMessage(waDraft.message.id)),
      /BrevoEmailProvider only supports EMAIL channel/
    );

    // 17.6 Request Construction & Successful Mocked Send
    let capturedRequest = null;
    const mockSuccessFetch = async (url, options) => {
      capturedRequest = {
        url,
        method: options.method,
        headers: options.headers,
        body: JSON.parse(options.body)
      };
      return {
        ok: true,
        status: 201,
        json: async () => ({
          messageId: "<202609270315.987654321@smtp-relay.mailin.fr>"
        })
      };
    };

    const sendLead = leadStore.createLeadRecord({
      companyName: "Brevo Target Bistro",
      industry: "Hospitality",
      contactName: "Chef Giovanni",
      email: "giovanni@bistrot.it",
      potentialNeed: "Reservation Assistant",
      qualificationStatus: "QUALIFIED",
      pipelineStatus: "NOT_CONTACTED"
    });
    leadStore.addLead(sendLead);

    const emailDraft = communicationStore.prepareDraftForLead(sendLead.id, "INITIAL_OUTREACH", "EMAIL");
    communicationStore.markMessageApproved(emailDraft.message.id);

    // Dispatch via gateway with Brevo provider and mockFetch
    const sendResult = await commGateway.sendMessage(emailDraft.message.id, {
      provider: "brevo",
      mockFetch: mockSuccessFetch
    });

    assert.strictEqual(sendResult.success, true);
    assert.strictEqual(sendResult.message.status, "SENT");
    assert.strictEqual(sendResult.message.provider, "brevo");
    assert.strictEqual(sendResult.message.providerMessageId, "<202609270315.987654321@smtp-relay.mailin.fr>");

    // Verify request construction sent to Brevo API
    assert.strictEqual(capturedRequest.url, "https://api.brevo.com/v3/smtp/email");
    assert.strictEqual(capturedRequest.headers["api-key"], process.env.BREVO_API_KEY);
    assert.strictEqual(capturedRequest.body.sender.email, process.env.BREVO_SENDER_EMAIL);
    assert.strictEqual(capturedRequest.body.sender.name, process.env.BREVO_SENDER_NAME);
    assert.strictEqual(capturedRequest.body.to[0].email, "giovanni@bistrot.it");
    assert.strictEqual(capturedRequest.body.to[0].name, "Chef Giovanni");
    assert(capturedRequest.body.htmlContent.includes("Chef Giovanni"));

    // Verify CRM Activity logged automatically
    const sendActivities = crmStore.getActivities({ leadId: sendLead.id });
    const contactedAct = sendActivities.find(a => a.type === "CONTACTED");
    assert(contactedAct, "CONTACTED activity must be recorded in CRM");
    assert.strictEqual(contactedAct.metadata.provider, "brevo");
    assert.strictEqual(contactedAct.metadata.providerMessageId, "<202609270315.987654321@smtp-relay.mailin.fr>");

    // Verify Sales Pipeline updated to CONTACTED
    const updatedSendLead = leadStore.getLead(sendLead.id);
    assert.strictEqual(updatedSendLead.pipelineStatus, "CONTACTED");

    // 17.7 Error Handling (400, 401, 403, 429, 500, Timeout)
    const testErrorCases = [
      { status: 400, body: { code: "bad_request", message: "Invalid email syntax" }, expectedCode: "INVALID_REQUEST" },
      { status: 401, body: { code: "unauthorized", message: "Key not found" }, expectedCode: "AUTH_FAILED" },
      { status: 403, body: { code: "forbidden", message: "Account suspended" }, expectedCode: "FORBIDDEN" },
      { status: 429, body: { code: "too_many_requests", message: "Daily quota reached" }, expectedCode: "RATE_LIMITED" },
      { status: 500, body: {}, expectedCode: "PROVIDER_SERVER_ERROR" }
    ];

    const approvedMsgForErr = {
      ...communicationStore.getMessage(emailDraft.message.id),
      status: "APPROVED"
    };

    for (const ec of testErrorCases) {
      const mockErrFetch = async () => ({
        ok: false,
        status: ec.status,
        json: async () => ec.body
      });
      const errRes = await brevoProvider.send(approvedMsgForErr, {
        mockFetch: mockErrFetch
      });
      assert.strictEqual(errRes.success, false);
      assert.strictEqual(errRes.errorCode, ec.expectedCode);
      // Ensure zero credentials leaked
      assert(!errRes.errorMessage.includes(process.env.BREVO_API_KEY));
    }

    // Timeout error test
    const mockTimeoutFetch = async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };
    const timeoutRes = await brevoProvider.send(approvedMsgForErr, {
      mockFetch: mockTimeoutFetch
    });
    assert.strictEqual(timeoutRes.success, false);
    assert.strictEqual(timeoutRes.errorCode, "TIMEOUT_ERROR");

    // 17.8 Webhook Event Normalization & Processing
    const brevoMsgId = "<202609270315.987654321@smtp-relay.mailin.fr>";

    // Normalization checks
    const normDelivered = commWebhooks.normalizeWebhookEvent("brevo", {
      event: "delivered",
      "message-id": brevoMsgId,
      email: "giovanni@bistrot.it"
    });
    assert.strictEqual(normDelivered.type, "DELIVERED");
    assert.strictEqual(normDelivered.providerMessageId, brevoMsgId);

    const normOpened = commWebhooks.normalizeWebhookEvent("brevo", {
      event: "opened",
      "message-id": brevoMsgId
    });
    assert.strictEqual(normOpened.type, "READ");

    const normBounce = commWebhooks.normalizeWebhookEvent("brevo", {
      event: "hard_bounce",
      "message-id": brevoMsgId,
      reason: "Mailbox does not exist"
    });
    assert.strictEqual(normBounce.type, "FAILED");

    // Process DELIVERED Webhook
    const whDeliveredRes = await commWebhooks.processWebhook("brevo", {
      event: "delivered",
      id: 501,
      "message-id": brevoMsgId,
      email: "giovanni@bistrot.it",
      date: new Date().toISOString()
    });
    assert.strictEqual(whDeliveredRes.statusCode, 200);
    assert.strictEqual(communicationStore.getMessage(emailDraft.message.id).status, "DELIVERED");

    // Process READ (opened) Webhook
    const whReadRes = await commWebhooks.processWebhook("brevo", {
      event: "opened",
      id: 502,
      "message-id": brevoMsgId,
      date: new Date().toISOString()
    });
    assert.strictEqual(whReadRes.statusCode, 200);
    assert.strictEqual(communicationStore.getMessage(emailDraft.message.id).status, "READ");

    // Process REPLIED Webhook with actual customer text
    const customerText = "We are definitely interested. When can we test the table bot?";
    const whReplyRes = await commWebhooks.processWebhook("brevo", {
      event: "reply",
      id: 503,
      "message-id": brevoMsgId,
      replyText: customerText,
      email: "giovanni@bistrot.it",
      date: new Date().toISOString()
    });
    assert.strictEqual(whReplyRes.statusCode, 200);

    const repliedMessage = communicationStore.getMessage(emailDraft.message.id);
    assert.strictEqual(repliedMessage.status, "REPLIED");
    assert.strictEqual(repliedMessage.inboundReplies.length, 1);
    assert.strictEqual(repliedMessage.inboundReplies[0].text, customerText);

    // Verify CRM Activity logged for reply
    const replyActs = crmStore.getActivities({ leadId: sendLead.id }).filter(a => a.type === "REPLIED");
    assert.strictEqual(replyActs.length, 1);
    assert(replyActs[0].description.includes("Customer replied"));

    // Verify Pipeline updated to REPLIED (NOT auto-advanced to INTERESTED)
    assert.strictEqual(leadStore.getLead(sendLead.id).pipelineStatus, "REPLIED");

    // 17.9 Webhook Idempotency Check
    const dupReplyRes = await commWebhooks.processWebhook("brevo", {
      event: "reply",
      id: 503,
      "message-id": brevoMsgId,
      replyText: customerText,
      email: "giovanni@bistrot.it"
    });
    assert.strictEqual(dupReplyRes.statusCode, 200);
    assert.strictEqual(dupReplyRes.body.duplicate, true);

    // Ensure no duplicate reply was appended
    assert.strictEqual(communicationStore.getMessage(emailDraft.message.id).inboundReplies.length, 1);

    // 17.10 Webhook Security Verification
    process.env.BREVO_WEBHOOK_SECRET = "super-secret-brevo-token-12345";

    // Request with missing secret rejected
    const unauthedWh = await commWebhooks.processWebhook("brevo", {
      event: "delivered",
      id: 999,
      "message-id": brevoMsgId
    }, {});
    assert.strictEqual(unauthedWh.statusCode, 401);
    assert(unauthedWh.body.error.includes("Unauthorized") || unauthedWh.body.error.includes("secret"));

    // Request with wrong secret rejected
    const badSecretWh = await commWebhooks.processWebhook("brevo", {
      event: "delivered",
      id: 999,
      "message-id": brevoMsgId
    }, { "x-brevo-webhook-secret": "wrong-secret-token" });
    assert.strictEqual(badSecretWh.statusCode, 401);

    // Request with correct secret accepted
    const goodSecretWh = await commWebhooks.processWebhook("brevo", {
      event: "delivered",
      id: 999,
      "message-id": brevoMsgId
    }, { "x-brevo-webhook-secret": "super-secret-brevo-token-12345" });
    assert.strictEqual(goodSecretWh.statusCode, 200);

    // Clean up env vars
    delete process.env.BREVO_WEBHOOK_SECRET;
    if (savedApiKey) process.env.BREVO_API_KEY = savedApiKey; else delete process.env.BREVO_API_KEY;
    if (savedSenderEmail) process.env.BREVO_SENDER_EMAIL = savedSenderEmail; else delete process.env.BREVO_SENDER_EMAIL;
    if (savedSenderName) process.env.BREVO_SENDER_NAME = savedSenderName; else delete process.env.BREVO_SENDER_NAME;

    // 17.11 Local Simulator Regression Verification
    process.env.COMMUNICATION_PROVIDER = "local";
    const simLead = leadStore.createLeadRecord({ companyName: "Sim Corp", email: "sim@example.com" });
    leadStore.addLead(simLead);
    const simDraft = communicationStore.prepareDraftForLead(simLead.id, "INITIAL_OUTREACH", "EMAIL");
    communicationStore.markMessageApproved(simDraft.message.id);
    const simSend = await commGateway.sendMessage(simDraft.message.id);
    assert.strictEqual(simSend.success, true);
    assert.strictEqual(simSend.message.provider, "local");
    assert.strictEqual(simSend.message.status, "SENT");

    // 17.12 Platform Integrity: Exactly 9 AI Agents Preserved (No 10th agent)
    assert.strictEqual(registry.getAgents().length, 9);
    assert.strictEqual(registry.hasAgent("brevo"), false);
    assert.strictEqual(registry.hasAgent("email-agent"), false);
    for (const agentId of expectedAgents) {
      assert.strictEqual(registry.hasAgent(agentId), true);
    }

    // Clean up
    communicationStore.clearCommunicationStore();
    commEventsStore.clearCommunicationEvents();
    leadStore.clearLeads();
    crmStore.clearCRM();

    console.log("✔ Real Email Provider Adapter (Brevo) tests passed.\n");

    // 18. PostgreSQL Persistence Layer & Neon Compatibility Tests
    console.log("18. Testing PostgreSQL Persistence Layer & Neon Compatibility...");

    const db = require("../memory/db");
    const { EXPECTED_TABLES } = require("../scripts/init-db");
    const { migrate } = require("../scripts/migrate-json-to-postgres");
    const userRepo = require("../memory/repositories/userRepository");
    const leadRepo = require("../memory/repositories/leadRepository");
    const crmRepo = require("../memory/repositories/crmRepository");
    const sdRepo = require("../memory/repositories/serviceDeliveryRepository");
    const commRepo = require("../memory/repositories/communicationRepository");
    const commEventsRepo = require("../memory/repositories/communicationEventsRepository");
    const auditRepo = require("../memory/repositories/securityAuditRepository");
    const { getDatabaseCounts } = require("../memory/repositories/counts");

    // 18.1 Database Connection Module & Functions
    assert.strictEqual(typeof db.isPostgresConfigured, "function");
    assert.strictEqual(typeof db.testConnection, "function");
    assert.strictEqual(typeof db.query, "function");
    assert.strictEqual(typeof db.getClient, "function");
    assert.strictEqual(typeof db.closePool, "function");

    const connStatus = await db.testConnection();
    assert.strictEqual(typeof connStatus.connected, "boolean");
    assert.strictEqual(typeof connStatus.provider, "string");
    // Ensure no secrets leaked in health check response
    const connStr = JSON.stringify(connStatus);
    assert.strictEqual(connStr.includes("password"), false);
    assert.strictEqual(connStr.includes("postgres://"), false);

    // 18.2 Schema Definition Integrity (14 Tables)
    assert.strictEqual(EXPECTED_TABLES.length, 14);
    const schemaSqlPath = path.join(__dirname, "../scripts/schema.sql");
    assert.strictEqual(fs.existsSync(schemaSqlPath), true);
    const schemaSql = fs.readFileSync(schemaSqlPath, "utf8");
    for (const tbl of EXPECTED_TABLES) {
      assert(schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${tbl}`), `Table ${tbl} must be defined in schema.sql`);
    }
    // Verify JSONB columns and indexes
    assert(schemaSql.includes("JSONB"));
    assert(schemaSql.includes("CREATE INDEX IF NOT EXISTS"));
    assert(schemaSql.includes("REFERENCES"));

    // 18.3 Migration Script Integrity
    assert.strictEqual(typeof migrate, "function");
    const migrateScriptPath = path.join(__dirname, "../scripts/migrate-json-to-postgres.js");
    assert.strictEqual(fs.existsSync(migrateScriptPath), true);
    const initScriptPath = path.join(__dirname, "../scripts/init-db.js");
    assert.strictEqual(fs.existsSync(initScriptPath), true);

    // 18.4 Repository Layer Modular Interfaces
    // User Repository
    assert.strictEqual(typeof userRepo.getUsers, "function");
    assert.strictEqual(typeof userRepo.findUserById, "function");
    assert.strictEqual(typeof userRepo.findUserByEmail, "function");
    assert.strictEqual(typeof userRepo.createUser, "function");
    assert.strictEqual(typeof userRepo.updateUser, "function");
    assert.strictEqual(typeof userRepo.deleteUser, "function");
    assert.strictEqual(typeof userRepo.countUsers, "function");

    // Lead Repository
    assert.strictEqual(typeof leadRepo.getLeads, "function");
    assert.strictEqual(typeof leadRepo.getLeadById, "function");
    assert.strictEqual(typeof leadRepo.createLead, "function");
    assert.strictEqual(typeof leadRepo.updateLead, "function");
    assert.strictEqual(typeof leadRepo.deleteLead, "function");
    assert.strictEqual(typeof leadRepo.clearLeads, "function");
    assert.strictEqual(typeof leadRepo.countLeads, "function");

    // CRM Repository
    assert.strictEqual(typeof crmRepo.getContacts, "function");
    assert.strictEqual(typeof crmRepo.getContactById, "function");
    assert.strictEqual(typeof crmRepo.createContact, "function");
    assert.strictEqual(typeof crmRepo.updateContact, "function");
    assert.strictEqual(typeof crmRepo.deleteContact, "function");
    assert.strictEqual(typeof crmRepo.getActivities, "function");
    assert.strictEqual(typeof crmRepo.createActivity, "function");
    assert.strictEqual(typeof crmRepo.getClients, "function");
    assert.strictEqual(typeof crmRepo.getClientById, "function");
    assert.strictEqual(typeof crmRepo.createClient, "function");
    assert.strictEqual(typeof crmRepo.updateClient, "function");

    // Service Delivery Repository
    assert.strictEqual(typeof sdRepo.getProjects, "function");
    assert.strictEqual(typeof sdRepo.getProjectById, "function");
    assert.strictEqual(typeof sdRepo.createProject, "function");
    assert.strictEqual(typeof sdRepo.updateProject, "function");
    assert.strictEqual(typeof sdRepo.getOnboardingRecords, "function");
    assert.strictEqual(typeof sdRepo.createOnboarding, "function");
    assert.strictEqual(typeof sdRepo.getRequirements, "function");
    assert.strictEqual(typeof sdRepo.createRequirement, "function");
    assert.strictEqual(typeof sdRepo.getMilestones, "function");
    assert.strictEqual(typeof sdRepo.createMilestone, "function");
    assert.strictEqual(typeof sdRepo.getTasks, "function");
    assert.strictEqual(typeof sdRepo.createTask, "function");

    // Communication & Events Repositories
    assert.strictEqual(typeof commRepo.getTemplates, "function");
    assert.strictEqual(typeof commRepo.getMessages, "function");
    assert.strictEqual(typeof commRepo.createMessage, "function");
    assert.strictEqual(typeof commRepo.updateMessage, "function");
    assert.strictEqual(typeof commEventsRepo.getEvents, "function");
    assert.strictEqual(typeof commEventsRepo.createEvent, "function");
    assert.strictEqual(typeof auditRepo.getSecurityAuditLogs, "function");
    assert.strictEqual(typeof auditRepo.logSecurityEvent, "function");

    // 18.5 Store Export of Repositories
    assert.strictEqual(userStore.repository, userRepo);
    assert.strictEqual(leadStore.repository, leadRepo);
    assert.strictEqual(crmStore.repository, crmRepo);
    assert.strictEqual(serviceDeliveryStore.repository, sdRepo);
    assert.strictEqual(communicationStore.repository, commRepo);
    assert.strictEqual(commEventsStore.repository, commEventsRepo);
    assert.strictEqual(securityAuditStore.repository, auditRepo);

    // 18.6 Package.json Scripts & Environment
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
    assert.strictEqual(pkg.scripts["db:init"], "node scripts/init-db.js");
    assert.strictEqual(pkg.scripts["db:migrate"], "node scripts/migrate-json-to-postgres.js");
    assert(pkg.dependencies["pg"], "pg dependency must be present in package.json");

    const envEx = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf8");
    assert(envEx.includes("DATABASE_PROVIDER="));
    assert(envEx.includes("DATABASE_URL="));
    assert(!envEx.includes("postgresql://"), ".env.example must not contain real credentials");

    const gitignore = fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf8");
    assert(gitignore.includes(".env"));
    assert(gitignore.includes("!.env.example"));

    // 18.7 Platform Integrity: Exactly 9 AI Agents Preserved (No 10th agent)
    assert.strictEqual(registry.getAgents().length, 9);
    assert.strictEqual(registry.hasAgent("postgres"), false);
    assert.strictEqual(registry.hasAgent("database"), false);
    assert.strictEqual(registry.hasAgent("db-agent"), false);

    console.log("✔ PostgreSQL Persistence Layer & Neon Compatibility tests passed.\n");
  }

  console.log("=========================================");
  console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
  console.log("=========================================");
  process.exit(0);
}).catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
