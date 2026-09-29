const {
  findClient,
  createProject,
  getProject,
  getProjects,
  getProjectByClientId,
  updateProject,
  createOnboarding,
  getOnboarding,
  getOnboardingByProjectId,
  updateOnboarding,
  addRequirement,
  getRequirements,
  updateRequirement,
  createMilestone,
  getMilestones,
  updateMilestone,
  createTask,
  getTasks,
  updateTask,
  getProjectOverview,
  getClientDeliveryProfile
} = require("../memory/serviceDeliveryStore");
const { getClients } = require("../memory/crmStore");

function formatProjectOverviewReport(overview, projects) {
  let out = `CLIENT PROJECTS OVERVIEW\n\n`;
  out += `Total Projects: ${overview.totalProjects}\n`;
  out += `- Planned: ${overview.projectsByStatus.PLANNED}\n`;
  out += `- Onboarding: ${overview.projectsByStatus.ONBOARDING}\n`;
  out += `- In Progress: ${overview.projectsByStatus.IN_PROGRESS}\n`;
  out += `- Client Review: ${overview.projectsByStatus.CLIENT_REVIEW}\n`;
  out += `- Blocked: ${overview.projectsByStatus.BLOCKED}\n`;
  out += `- Completed: ${overview.projectsByStatus.COMPLETED}\n`;
  out += `- Cancelled: ${overview.projectsByStatus.CANCELLED}\n\n`;

  out += `Delivery Health:\n`;
  out += `- Active Onboardings: ${overview.onboardingActive}\n`;
  out += `- Requirements: ${overview.totalRequirements} (Pending: ${overview.requirementsPending}, Confirmed: ${overview.requirementsConfirmed})\n`;
  out += `- Milestones: ${overview.totalMilestones} (Completed: ${overview.milestonesCompleted})\n`;
  out += `- Tasks: ${overview.tasks.total} (Done: ${overview.tasks.DONE}, In Progress: ${overview.tasks.IN_PROGRESS}, Blocked: ${overview.tasks.BLOCKED}, Todo: ${overview.tasks.TODO})\n\n`;

  if (projects.length === 0) {
    out += `No client projects currently recorded.\n`;
    out += `To start a project: node index.js "create project for <Client Name>"\n`;
    return out;
  }

  out += `Active Client Projects:\n`;
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    out += `${i + 1}. ${p.projectName} (ID: ${p.id})\n`;
    out += `   Client ID: ${p.clientId} | Status: ${p.status} | Priority: ${p.priority} | Progress: ${p.progress}%\n`;
    out += `   Service Type: ${p.serviceType}\n`;
    out += `   Start Date: ${p.startDate} | Target Date: ${p.targetDate}\n\n`;
  }

  return out;
}

function formatClientDeliveryProfileReport(profile) {
  if (!profile.found) {
    let out = `CLIENT DELIVERY PROFILE\n\n`;
    out += `Status: ${profile.error}\n`;
    return out;
  }

  const { client, project, onboarding, requirements, milestones, tasks, blockers, nextAction } = profile;

  let out = `CLIENT DELIVERY PROFILE\n\n`;
  out += `Client: ${client.companyName} (ID: ${client.id})\n`;
  if (client.primaryContact) {
    const cp = client.primaryContact;
    out += `Primary Contact: ${cp.name} [${cp.role || "RESEARCH REQUIRED"}] | Email: ${cp.email || "RESEARCH REQUIRED"}\n`;
  }
  out += `Contracted Service: ${client.service || "RESEARCH REQUIRED"}\n\n`;

  if (!project) {
    out += `Project Status: NO PROJECT CREATED YET\n`;
    out += `Action Required: Create a project using: node index.js "create project for ${client.companyName}"\n`;
    return out;
  }

  out += `Project Overview:\n`;
  out += `- Project: ${project.projectName} (ID: ${project.id})\n`;
  out += `- Status: ${project.status}\n`;
  out += `- Priority: ${project.priority}\n`;
  out += `- Progress: ${project.progress}%\n`;
  out += `- Start Date: ${project.startDate}\n`;
  out += `- Target Date: ${project.targetDate}\n\n`;

  out += `Onboarding Workflow:\n`;
  if (onboarding) {
    out += `- Status: ${onboarding.status}\n`;
    out += `- Completed Items: ${onboarding.completedItems.length > 0 ? onboarding.completedItems.join(", ") : "None"}\n`;
    out += `- Pending Items:\n`;
    if (onboarding.pendingItems.length > 0) {
      for (const item of onboarding.pendingItems) {
        out += `  * ${item}\n`;
      }
    } else {
      out += `  * None\n`;
    }
  } else {
    out += `- Status: NOT INITIALIZED\n`;
  }
  out += `\n`;

  out += `Requirements (${requirements.length}):\n`;
  if (requirements.length > 0) {
    for (const r of requirements) {
      out += `- [${r.status}] [${r.source}] ${r.title}: ${r.description} (ID: ${r.id})\n`;
    }
  } else {
    out += `None recorded yet. To add: node index.js "add requirement <title> for ${client.companyName}"\n`;
  }
  out += `\n`;

  out += `Milestones (${milestones.length}):\n`;
  if (milestones.length > 0) {
    for (const m of milestones) {
      out += `${m.order}. [${m.status}] ${m.name} (Target: ${m.targetDate}) - ${m.description} (ID: ${m.id})\n`;
    }
  } else {
    out += `None configured yet.\n`;
  }
  out += `\n`;

  out += `Project Tasks (${tasks.length}):\n`;
  if (tasks.length > 0) {
    for (const t of tasks) {
      out += `- [${t.status}] [${t.priority}] ${t.title} (Owner: ${t.owner}, Due: ${t.dueDate}) (ID: ${t.id})\n`;
    }
  } else {
    out += `No tasks recorded yet.\n`;
  }
  out += `\n`;

  out += `Current Blockers:\n`;
  if (blockers.length > 0) {
    for (const b of blockers) {
      out += `⚠️  ${b}\n`;
    }
  } else {
    out += `None\n`;
  }
  out += `\n`;

  out += `Recommended Next Action:\n`;
  out += `[RECOMMENDATION] ${nextAction}\n`;

  return out;
}

function formatOnboardingReport(targetQuery) {
  let client = null;
  if (targetQuery) {
    client = findClient(targetQuery);
  }

  const overview = getProjectOverview();
  let out = `CLIENT ONBOARDING REPORT\n\n`;
  out += `Total Onboarding Workflows: ${overview.totalOnboardings}\n`;
  out += `Active: ${overview.onboardingActive} | Completed: ${overview.totalOnboardings - overview.onboardingActive}\n\n`;

  if (client) {
    const profile = getClientDeliveryProfile(client.id);
    if (!profile.onboarding) {
      out += `No onboarding record found for client: ${client.companyName}.\n`;
      return out;
    }
    const onb = profile.onboarding;
    out += `Client: ${client.companyName} (ID: ${client.id})\n`;
    out += `Project: ${profile.project ? profile.project.projectName : "N/A"}\n`;
    out += `Status: ${onb.status}\n`;
    out += `Completed Items: ${onb.completedItems.length > 0 ? onb.completedItems.join(", ") : "None"}\n`;
    out += `Pending Items:\n`;
    for (const item of onb.pendingItems) {
      out += `- ${item}\n`;
    }
    return out;
  }

  const projects = getProjects();
  if (projects.length === 0) {
    out += `No projects or onboarding records found.\n`;
    return out;
  }

  for (const p of projects) {
    const onb = getOnboardingByProjectId(p.id);
    if (onb) {
      out += `- Project: ${p.projectName} (ID: ${p.id})\n`;
      out += `  Status: ${onb.status}\n`;
      out += `  Completed: ${onb.completedItems.length} | Pending: ${onb.pendingItems.length}\n`;
      if (onb.pendingItems.length > 0) {
        out += `  Next Step: ${onb.pendingItems[0]}\n`;
      }
      out += `\n`;
    }
  }

  return out;
}

function formatTasksReport(targetQuery, statusFilter = null) {
  let project = null;
  if (targetQuery) {
    const client = findClient(targetQuery);
    if (client) {
      const projects = getProjects({ clientId: client.id });
      project = projects[0] || null;
    } else {
      project = getProject(targetQuery);
    }
  }

  let filter = {};
  if (project) filter.projectId = project.id;
  if (statusFilter) filter.status = statusFilter;

  const tasks = getTasks(filter);

  let out = `PROJECT TASKS REPORT${project ? ` — ${project.projectName}` : ""}\n\n`;
  out += `Total Tasks: ${tasks.length}${statusFilter ? ` [Filter: ${statusFilter}]` : ""}\n\n`;

  if (tasks.length === 0) {
    out += `No tasks match the specified criteria.\n`;
    return out;
  }

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    out += `${i + 1}. [${t.status}] [${t.priority}] ${t.title}\n`;
    out += `   ID: ${t.id} | Project ID: ${t.projectId}\n`;
    out += `   Owner: ${t.owner} | Due Date: ${t.dueDate}\n`;
    if (t.description && t.description !== t.title) {
      out += `   Description: ${t.description}\n`;
    }
    if (t.notes) {
      out += `   Notes: ${t.notes}\n`;
    }
    out += `\n`;
  }

  return out;
}

function formatBlockedTasksReport() {
  const overview = getProjectOverview();
  const blockedTasks = getTasks({ status: "BLOCKED" });

  let out = `BLOCKED ITEMS REPORT\n\n`;
  out += `Total Blocked Items: ${overview.blockedItems.length}\n\n`;

  if (overview.blockedItems.length === 0) {
    out += `✅ No blocked projects, milestones, or tasks detected.\n`;
    return out;
  }

  out += `Active Blockers:\n`;
  for (let i = 0; i < overview.blockedItems.length; i++) {
    out += `${i + 1}. ⚠️  ${overview.blockedItems[i]}\n`;
  }
  out += `\n`;

  if (blockedTasks.length > 0) {
    out += `Blocked Tasks Detail:\n`;
    for (const t of blockedTasks) {
      out += `- ${t.title} (ID: ${t.id}, Project: ${t.projectId})\n`;
      out += `  Owner: ${t.owner} | Due: ${t.dueDate}\n`;
      out += `  Notes: ${t.notes || "No explanation recorded"}\n`;
    }
  }

  return out;
}

function formatRequirementsReport(statusFilter = null) {
  let filter = {};
  if (statusFilter) filter.status = statusFilter;

  const reqs = getRequirements(filter);

  let out = `PROJECT REQUIREMENTS REPORT\n\n`;
  out += `Total Requirements: ${reqs.length}${statusFilter ? ` [Filter: ${statusFilter}]` : ""}\n\n`;

  if (reqs.length === 0) {
    out += `No requirements found with status ${statusFilter || "ANY"}.\n`;
    return out;
  }

  for (let i = 0; i < reqs.length; i++) {
    const r = reqs[i];
    out += `${i + 1}. [${r.status}] [${r.source}] ${r.title}\n`;
    out += `   ID: ${r.id} | Project ID: ${r.projectId}\n`;
    if (r.description && r.description !== r.title) {
      out += `   Description: ${r.description}\n`;
    }
    out += `\n`;
  }

  return out;
}

function formatMilestonesReport(targetQuery) {
  let project = null;
  if (targetQuery) {
    const client = findClient(targetQuery);
    if (client) {
      const projects = getProjects({ clientId: client.id });
      project = projects[0] || null;
    } else {
      project = getProject(targetQuery);
    }
  }

  const milestones = getMilestones(project ? project.id : null);

  let out = `PROJECT MILESTONES REPORT${project ? ` — ${project.projectName}` : ""}\n\n`;
  out += `Total Milestones: ${milestones.length}\n\n`;

  if (milestones.length === 0) {
    out += `No milestones recorded.\n`;
    return out;
  }

  for (const m of milestones) {
    out += `${m.order}. [${m.status}] ${m.name} (Target Date: ${m.targetDate})\n`;
    out += `   ID: ${m.id} | Project ID: ${m.projectId}\n`;
    out += `   Description: ${m.description}\n`;
    if (m.completedAt) {
      out += `   Completed At: ${m.completedAt}\n`;
    }
    out += `\n`;
  }

  return out;
}

function extractUserRequest(message) {
  if (!message) return "";
  const match = message.match(/CURRENT USER REQUEST:\s*([\s\S]*)$/i);
  return match ? match[1].trim() : message.trim();
}

async function runProduct(message, askOllama) {
  const userRequest = extractUserRequest(message);
  const targetText = userRequest || message || "";
  const msgText = targetText.toLowerCase().trim();

  // 1. Project Creation (e.g. "create project for Luigi's Trattoria")
  const createProjMatch = targetText.match(/create\s+project(?:\s+for\s+(.+))?/i);
  if (createProjMatch) {
    const rawTarget = createProjMatch[1] ? createProjMatch[1].trim() : "";
    if (!rawTarget) {
      return `PROJECT CREATION REPORT\n\nStatus: CLIENT NOT SPECIFIED\nPlease specify which client to create a project for.\nExample: node index.js "create project for Luigi's Trattoria"`;
    }

    const client = findClient(rawTarget);
    if (!client) {
      return `PROJECT CREATION REPORT\n\nStatus: CLIENT NOT FOUND\nPlease convert/create the client first.\nAvailable clients: ${getClients().map(c => c.companyName).join(", ") || "None"}`;
    }

    const res = createProject({
      clientId: client.id,
      projectName: `${client.companyName} Service Delivery`,
      serviceType: client.service || "RESEARCH REQUIRED",
      description: `Service delivery implementation for ${client.companyName}`
    });

    if (!res.success) {
      return `PROJECT CREATION REPORT\n\nStatus: ERROR\n${res.error}`;
    }

    const p = res.project;
    let out = `PROJECT CREATION REPORT\n\n`;
    out += `Project: ${p.projectName} (ID: ${p.id})\n`;
    out += `Client: ${client.companyName} (ID: ${client.id})\n`;
    out += `Service Type: ${p.serviceType}\n`;
    out += `Status: ${p.status}\n`;
    out += `Priority: ${p.priority}\n`;
    out += `Start Date: ${p.startDate}\n`;
    out += `Target Date: ${p.targetDate}\n`;
    out += `Onboarding: Initialized (NOT_STARTED)\n\n`;
    out += `Recommended Next Action:\n`;
    out += `[RECOMMENDATION] Review onboarding requirements: node index.js "show delivery profile for ${client.companyName}"\n`;
    return out;
  }

  // 2. Delivery Profile (e.g. "show delivery profile for Luigi's Trattoria", "delivery profile for ...")
  const profileMatch = targetText.match(/(?:show\s+)?(?:delivery\s+profile|client\s+delivery\s+profile)(?:\s+for\s+(.+))?/i);
  if (profileMatch) {
    const rawTarget = profileMatch[1] ? profileMatch[1].trim() : "";
    if (!rawTarget) {
      return `CLIENT DELIVERY PROFILE\n\nStatus: CLIENT NOT SPECIFIED\nPlease specify which client delivery profile to inspect.\nExample: node index.js "show delivery profile for Luigi's Trattoria"`;
    }

    const profile = getClientDeliveryProfile(rawTarget);
    return formatClientDeliveryProfileReport(profile);
  }

  // 3. Project Overview / Show Projects (e.g. "show projects", "show my projects", "show client projects")
  const isShowProjects = /^(?:show\s+)?(?:my\s+|client\s+)?projects$/i.test(msgText) ||
    /show\s+projects|show\s+client\s+projects|show\s+my\s+projects/i.test(msgText) ||
    msgText === "projects" || msgText === "show projects";
  if (isShowProjects) {
    const overview = getProjectOverview();
    const projects = getProjects();
    return formatProjectOverviewReport(overview, projects);
  }

  // 4. Show Onboarding (e.g. "show onboarding for Luigi's Trattoria", "show onboarding")
  const onboardingMatch = targetText.match(/show\s+onboarding(?:\s+for\s+(.+))?/i);
  if (onboardingMatch) {
    const rawTarget = onboardingMatch[1] ? onboardingMatch[1].trim() : "";
    return formatOnboardingReport(rawTarget);
  }

  // 5. Show Tasks (e.g. "show project tasks for Luigi's Trattoria", "show project tasks", "show tasks")
  const tasksMatch = targetText.match(/show\s+(?:project\s+)?tasks(?:\s+for\s+(.+))?/i);
  if (tasksMatch && !msgText.includes("blocked tasks")) {
    const rawTarget = tasksMatch[1] ? tasksMatch[1].trim() : "";
    return formatTasksReport(rawTarget);
  }

  // 6. Show Blocked Tasks (e.g. "show blocked tasks", "show blockers")
  if (msgText.includes("blocked tasks") || msgText.includes("show blockers") || msgText === "blockers") {
    return formatBlockedTasksReport();
  }

  // 7. Show Requirements (e.g. "show pending requirements", "show requirements")
  if (msgText.includes("pending requirements") || msgText.includes("show requirements")) {
    const filter = msgText.includes("pending") ? "PENDING" : null;
    return formatRequirementsReport(filter);
  }

  // 8. Show Milestones (e.g. "show project milestones for Luigi's Trattoria", "show project milestones", "show milestones")
  const milestonesMatch = targetText.match(/show\s+(?:project\s+)?milestones(?:\s+for\s+(.+))?/i);
  if (milestonesMatch) {
    const rawTarget = milestonesMatch[1] ? milestonesMatch[1].trim() : "";
    return formatMilestonesReport(rawTarget);
  }

  // 9. Update operations:
  // 9.1 Start Project (e.g. "start project <target>")
  const startProjMatch = targetText.match(/start\s+project\s+(.+)/i);
  if (startProjMatch) {
    const target = startProjMatch[1].trim();
    let project = getProject(target);
    if (!project) {
      const client = findClient(target);
      if (client) {
        project = getProjectByClientId(client.id);
      }
    }

    if (!project) {
      return `START PROJECT ERROR\n\nCould not find project or client matching "${target}".`;
    }

    const updated = updateProject(project.id, { status: "IN_PROGRESS" });
    const onb = getOnboardingByProjectId(project.id);
    if (onb && onb.status === "NOT_STARTED") {
      updateOnboarding(onb.id, { status: "WELCOME" });
    }

    return `PROJECT STATUS UPDATED\n\nProject: ${updated.projectName} (ID: ${updated.id})\nStatus: IN_PROGRESS\nOnboarding: ${onb ? onb.status : "N/A"}\nActivity Logged: STATUS_CHANGED`;
  }

  // 9.2 Mark Project Blocked / Completed (e.g. "mark project blocked <target>", "mark project completed <target>")
  const markProjMatch = targetText.match(/mark\s+project\s+(blocked|completed)\s+(.+)/i);
  if (markProjMatch) {
    const newStatus = markProjMatch[1].toUpperCase() === "BLOCKED" ? "BLOCKED" : "COMPLETED";
    const target = markProjMatch[2].trim();
    let project = getProject(target);
    if (!project) {
      const client = findClient(target);
      if (client) {
        project = getProjectByClientId(client.id);
      }
    }

    if (!project) {
      return `UPDATE PROJECT ERROR\n\nCould not find project or client matching "${target}".`;
    }

    const updated = updateProject(project.id, { status: newStatus });
    return `PROJECT STATUS UPDATED\n\nProject: ${updated.projectName} (ID: ${updated.id})\nStatus: ${updated.status}\nActivity Logged: ${newStatus === "COMPLETED" ? "PROJECT_COMPLETED" : "STATUS_CHANGED"}`;
  }

  // 9.3 Mark Task Done (e.g. "mark task done <target>")
  const markTaskDoneMatch = targetText.match(/mark\s+task\s+done\s+(.+)/i);
  if (markTaskDoneMatch) {
    const target = markTaskDoneMatch[1].trim();
    const tasks = getTasks();
    const task = tasks.find(t => t.id === target || t.title.toLowerCase().includes(target.toLowerCase()));

    if (!task) {
      return `UPDATE TASK ERROR\n\nTask not found matching "${target}".\nAvailable tasks: ${tasks.map(t => `${t.title} (${t.id})`).join(", ") || "None"}`;
    }

    const updated = updateTask(task.id, { status: "DONE" });
    const project = getProject(updated.projectId);

    return `TASK UPDATED\n\nTask: ${updated.title} (ID: ${updated.id})\nStatus: DONE\nProject: ${project ? project.projectName : updated.projectId} (Progress: ${project ? project.progress : 0}%)\nOwner: ${updated.owner}`;
  }

  // 9.4 Mark Requirement Received / Confirmed (e.g. "mark requirement received <target>", "mark requirement confirmed <target>")
  const markReqMatch = targetText.match(/mark\s+requirement\s+(received|confirmed)\s+(.+)/i);
  if (markReqMatch) {
    const newStatus = markReqMatch[1].toUpperCase();
    const target = markReqMatch[2].trim();
    const reqs = getRequirements();
    const req = reqs.find(r => r.id === target || r.title.toLowerCase().includes(target.toLowerCase()));

    if (!req) {
      return `UPDATE REQUIREMENT ERROR\n\nRequirement not found matching "${target}".\nAvailable requirements: ${reqs.map(r => `${r.title} (${r.id})`).join(", ") || "None"}`;
    }

    const updated = updateRequirement(req.id, { status: newStatus });
    return `REQUIREMENT UPDATED\n\nRequirement: ${updated.title} (ID: ${updated.id})\nStatus: ${updated.status}\nEvidence Source: ${updated.source}\nActivity Logged: REQUIREMENT_${newStatus}`;
  }

  // 9.5 Mark Milestone Completed (e.g. "mark milestone completed <target>")
  const markMsMatch = targetText.match(/mark\s+milestone\s+completed\s+(.+)/i);
  if (markMsMatch) {
    const target = markMsMatch[1].trim();
    const milestones = getMilestones();
    const ms = milestones.find(m => m.id === target || m.name.toLowerCase().includes(target.toLowerCase()));

    if (!ms) {
      return `UPDATE MILESTONE ERROR\n\nMilestone not found matching "${target}".\nAvailable milestones: ${milestones.map(m => `${m.name} (${m.id})`).join(", ") || "None"}`;
    }

    const updated = updateMilestone(ms.id, { status: "COMPLETED" });
    return `MILESTONE UPDATED\n\nMilestone: ${updated.name} (ID: ${updated.id})\nStatus: COMPLETED\nCompleted At: ${updated.completedAt}\nActivity Logged: MILESTONE_COMPLETED`;
  }

  // 10. AI assistance for project plans and MVP requirements (Section 11)
  const isPlanAssistance = /generate\s+(?:project\s+plan|plan|mvp\s+requirements)|suggest\s+(?:project\s+plan|requirements)/i.test(msgText);
  if (isPlanAssistance) {
    const prompt = `You are the Product Agent inside an AI Business Agent.
You are helping generate a suggested project plan and MVP requirements.

IMPORTANT SAFETY RULES:
- Clearly label this as an [AI SUGGESTION].
- Do NOT fabricate dates or commitments. If dates are mentioned, mark as NOT SET.
- Do NOT turn suggestions into confirmed client requirements automatically.
- Frame features into MUST HAVE, SHOULD HAVE, LATER.

USER REQUEST:
${message}`;

    const aiResponse = await askOllama(prompt);
    return `[AI SUGGESTION]
The following is an AI-generated suggested project plan for your review.
AI suggestions do NOT automatically become confirmed client requirements without user approval.

${aiResponse}`;
  }

  // 11. Standard Product Agent fallback
  const prompt = `You are the Product Agent inside an AI Business Agent.

Your job is to turn a validated business opportunity into a practical MVP and product execution plan.

IMPORTANT:
Never invent technical requirements, user numbers, costs, market statistics, or performance claims.
Clearly distinguish:
- USER-PROVIDED
- ASSUMPTION
- RESEARCH REQUIRED

Analyze the request using this framework:

1. PRODUCT GOAL
- What problem is the product solving?
- Who is the primary user?
- What is the smallest useful version?

2. MVP SCOPE
Separate features into:
MUST HAVE
SHOULD HAVE
LATER

Avoid unnecessary features.

3. CORE USER FLOW
Describe:
Entry → Action → Processing → Result → Follow-up

4. PRODUCT ARCHITECTURE
Recommend appropriate:
- Frontend
- Backend
- Database
- APIs
- Authentication
- Payments if required
- External integrations
- Hosting/deployment

Only recommend technology when it serves the MVP.

5. DATA MODEL
Identify the core entities and relationships required.

6. API / SYSTEM FLOW
Describe the important API endpoints and how the components communicate.

7. SECURITY
Identify:
- Authentication
- Authorization
- Secrets
- Data protection
- Webhook security
- Abuse prevention

8. DEVELOPMENT PLAN
Break implementation into practical phases:

Phase 1:
Phase 2:
Phase 3:
Phase 4:

Each phase should have concrete deliverables.

9. TESTING
Define:
- Unit tests
- Integration tests
- End-to-end tests
- Critical user flows

10. DEPLOYMENT
Explain:
- Environment configuration
- Database migration
- Production deployment
- Monitoring
- Rollback considerations

11. MVP VALIDATION
Explain what real user behavior should be measured after launch.

12. FINAL OUTPUT

MVP:
TECH STACK:
CORE FEATURES:
USER FLOW:
ARCHITECTURE:
DEVELOPMENT PHASES:
TEST PLAN:
DEPLOYMENT:
WHAT WE KNOW:
WHAT WE ASSUME:
WHAT MUST BE VALIDATED:
NEXT 3 ACTIONS:

Be practical and implementation-oriented.

USER REQUEST:
${message}`;

  return await askOllama(prompt);
}

module.exports = {
  runProduct,
  formatProjectOverviewReport,
  formatClientDeliveryProfileReport,
  formatOnboardingReport,
  formatTasksReport,
  formatBlockedTasksReport,
  formatRequirementsReport,
  formatMilestonesReport
};
