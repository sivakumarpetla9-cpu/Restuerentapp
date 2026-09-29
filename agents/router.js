const { hasAgent, isAgentEnabled } = require("./registry");

function resolveIntent(message) {
  const text = (message || "").toLowerCase().trim();

  // Explicit strategy requests
  if (
    text.includes("business plan") ||
    text.includes("business strategy") ||
    text.includes("pricing strategy") ||
    text.includes("go to market strategy") ||
    text.includes("gtm strategy")
  ) return "strategy";

  // Lead qualification requests
  if (
    text.includes("qualify my leads") ||
    text.includes("qualify this lead") ||
    text.includes("qualify all leads") ||
    text.includes("qualify my existing leads") ||
    text.includes("lead qualification") ||
    text.includes("evaluate leads") ||
    text.includes("score leads") ||
    text.includes("which leads are qualified") ||
    text.includes("show qualified leads") ||
    text.includes("filter qualified leads") ||
    text.includes("show possible-fit leads") ||
    text.includes("show possible fit leads") ||
    text.includes("show leads needing research") ||
    text.includes("show unqualified leads") ||
    (text.includes("qualify leads") && !text.includes("research and qualify")) ||
    (text.includes("qualify these leads") && !text.includes("research and qualify"))
  ) return "lead-qualification";

  // Client onboarding & service delivery requests
  if (
    text.includes("delivery profile") ||
    text.includes("client delivery profile") ||
    text.includes("show delivery") ||
    text.includes("service delivery") ||
    text.includes("show projects") ||
    text.includes("show my projects") ||
    text.includes("show client projects") ||
    text.includes("client projects") ||
    text.includes("show onboarding") ||
    text.includes("client onboarding") ||
    text.includes("show project tasks") ||
    text.includes("project tasks") ||
    text.includes("blocked tasks") ||
    text.includes("show blockers") ||
    text.includes("show pending requirements") ||
    text.includes("pending requirements") ||
    text.includes("show requirements") ||
    text.includes("show project milestones") ||
    text.includes("project milestones") ||
    text.includes("show milestones") ||
    /create\s+project(?:\s+for\s+.+)?/i.test(text) ||
    /start\s+project\s+.+/i.test(text) ||
    /mark\s+project\s+(?:blocked|completed)\s+.+/i.test(text) ||
    /mark\s+task\s+done\s+.+/i.test(text) ||
    /mark\s+requirement\s+(?:received|confirmed)\s+.+/i.test(text) ||
    /mark\s+milestone\s+completed\s+.+/i.test(text)
  ) return "product";

  // Sales pipeline, CRM & follow-up requests
  if (
    text.includes("sales pipeline") ||
    text.includes("pipeline") ||
    text.includes("crm") ||
    text.includes("client profile") ||
    text.includes("lead profile") ||
    text.includes("show activities") ||
    text.includes("show contacts") ||
    text.includes("show clients") ||
    text.includes("convert to client") ||
    text.includes("convert lead to client") ||
    /convert\s+.+\s+to\s+client/i.test(text) ||
    text.includes("leads needing follow-up") ||
    text.includes("leads needing follow up") ||
    text.includes("what should i follow up on") ||
    text.includes("follow up with leads") ||
    text.includes("follow up on") ||
    text.includes("follow-up") ||
    text.includes("follow up") ||
    text.includes("update lead status") ||
    text.includes("update pipeline") ||
    text.includes("show contacted leads") ||
    text.includes("show interested leads") ||
    text.includes("show proposal leads") ||
    text.includes("show proposals") ||
    text.includes("show won leads") ||
    text.includes("show won deals") ||
    text.includes("show lost leads") ||
    (text.startsWith("mark ") && !text.includes("task") && !text.includes("milestone") && !text.includes("requirement") && !text.includes("project")) ||
    text.includes("mark lead") ||
    text.includes("mark my lead")
  ) return "sales-pipeline";

  // Lead generation requests
  if (
    text.includes("find leads") ||
    text.includes("generate leads") ||
    text.includes("lead generation") ||
    text.includes("build a lead list") ||
    text.includes("lead list") ||
    text.includes("find potential customers") ||
    text.includes("potential customers") ||
    text.includes("find businesses to contact") ||
    text.includes("businesses to contact") ||
    text.includes("identify potential clients") ||
    text.includes("potential clients") ||
    text.includes("find prospects") ||
    text.includes("prospect research") ||
    text.includes("research and qualify") ||
    text.includes("leads.csv")
  ) return "lead-generation";

  // Research requests
  if (
    text.includes("research") ||
    text.includes("research market") ||
    text.includes("research competitors") ||
    text.includes("analyze source") ||
    text.includes("analyze url") ||
    text.includes("analyze file") ||
    text.includes("analyze competitor") ||
    text.includes("competitor analysis") ||
    text.includes("competitors") ||
    text.includes("competitor") ||
    text.includes("verify") ||
    text.includes("sources") ||
    text.includes("evidence")
  ) return "research";

  if (
    text.includes("idea") ||
    text.includes("ideas") ||
    text.includes("opportunity") ||
    text.includes("opportunities") ||
    text.includes("find a business") ||
    text.includes("what should i build") ||
    text.includes("market gap") ||
    text.includes("niche") ||
    text.includes("discover")
  ) return "discovery";

  if (
    text.includes("strategy") ||
    text.includes("pricing") ||
    text.includes("go to market") ||
    text.includes("gtm") ||
    text.includes("positioning") ||
    text.includes("validate") ||
    text.includes("validation")
  ) return "strategy";

  if (
    text.includes("find customers") ||
    text.includes("find customer") ||
    text.includes("customer acquisition") ||
    text.includes("leads") ||
    text.includes("sales") ||
    text.includes("outreach") ||
    text.includes("cold message") ||
    text.includes("prospects") ||
    text.includes("draft message") ||
    text.includes("draft email") ||
    text.includes("draft whatsapp") ||
    text.includes("prepare message") ||
    text.includes("prepare email") ||
    text.includes("prepare whatsapp") ||
    text.includes("prepare outreach") ||
    text.includes("show messages") ||
    text.includes("show templates") ||
    text.includes("communication templates") ||
    text.includes("communication workspace") ||
    text.includes("communication events") ||
    text.includes("show communication events") ||
    text.includes("show communication status") ||
    text.includes("send message") ||
    text.includes("simulate delivered") ||
    text.includes("simulate read") ||
    text.includes("simulate reply") ||
    text.includes("simulate failure") ||
    text.includes("approve message") ||
    text.includes("copy message")
  ) return "outreach";

  if (
    text.includes("revenue") ||
    text.includes("profit") ||
    text.includes("money") ||
    text.includes("cost") ||
    text.includes("expenses") ||
    text.includes("margin") ||
    text.includes("break even") ||
    text.includes("financial")
  ) return "finance";

  if (
    text.includes("build") ||
    text.includes("develop") ||
    text.includes("code") ||
    text.includes("mvp") ||
    text.includes("product") ||
    text.includes("app") ||
    text.includes("website") ||
    text.includes("deploy") ||
    text.includes("launch") ||
    text.includes("ship")
  ) return "product";

  return "strategy";
}

function route(message, options = {}) {
  const targetId = resolveIntent(message);

  // Validate agent existence against registry as source of truth
  if (!hasAgent(targetId)) {
    return null;
  }

  // Check if agent is enabled
  if (!isAgentEnabled(targetId)) {
    if (options.allowDisabled) {
      return targetId;
    }
    return null;
  }

  return targetId;
}

module.exports = {
  route,
  resolveIntent
};
