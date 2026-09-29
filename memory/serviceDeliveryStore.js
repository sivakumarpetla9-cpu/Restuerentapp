const fs = require("fs");
const path = require("path");
const crmStore = require("./crmStore");
const { isPostgresConfigured, isSyncEnabled } = require("./db");
const serviceDeliveryRepository = require("./repositories/serviceDeliveryRepository");

const DATA_DIR = path.join(__dirname, "../data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const ONBOARDING_FILE = path.join(DATA_DIR, "onboarding.json");
const REQUIREMENTS_FILE = path.join(DATA_DIR, "requirements.json");
const MILESTONES_FILE = path.join(DATA_DIR, "milestones.json");
const TASKS_FILE = path.join(DATA_DIR, "project_tasks.json");

const PROJECT_STATUSES = [
  "PLANNED",
  "ONBOARDING",
  "IN_PROGRESS",
  "CLIENT_REVIEW",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED"
];

const ONBOARDING_STATUSES = [
  "NOT_STARTED",
  "WELCOME",
  "REQUIREMENTS_COLLECTION",
  "REQUIREMENTS_CONFIRMED",
  "PROJECT_SETUP",
  "ONBOARDING_COMPLETED"
];

const REQUIREMENT_STATUSES = [
  "PENDING",
  "RECEIVED",
  "CONFIRMED",
  "BLOCKED"
];

const REQUIREMENT_SOURCES = [
  "USER-PROVIDED",
  "VERIFIED",
  "ASSUMPTION",
  "RESEARCH REQUIRED"
];

const MILESTONE_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "BLOCKED",
  "CLIENT_REVIEW",
  "COMPLETED"
];

const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "REVIEW",
  "DONE"
];

const PRIORITIES = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT"
];

function ensureStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_FILE)) {
    fs.writeFileSync(PROJECTS_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(ONBOARDING_FILE)) {
    fs.writeFileSync(ONBOARDING_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(REQUIREMENTS_FILE)) {
    fs.writeFileSync(REQUIREMENTS_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(MILESTONES_FILE)) {
    fs.writeFileSync(MILESTONES_FILE, "[]", "utf8");
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, "[]", "utf8");
  }
}

function loadJson(filePath) {
  ensureStoreExists();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJson(filePath, data) {
  ensureStoreExists();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

/* ========================================================================= */
/* CLIENT RESOLUTION                                                         */
/* ========================================================================= */

function findClient(query) {
  if (!query) return null;
  const clients = crmStore.getClients();
  const q = String(query).trim().toLowerCase();

  // 1. Direct ID match
  const byId = clients.find(c => c.id === query);
  if (byId) return byId;

  // 2. Direct Lead ID match
  const byLeadId = clients.find(c => c.leadId === query);
  if (byLeadId) return byLeadId;

  // 3. Exact companyName match
  const exact = clients.find(c => c.companyName.toLowerCase() === q);
  if (exact) return exact;

  // 4. Fuzzy / substring match
  const fuzzy = clients.find(c => {
    const name = c.companyName.toLowerCase();
    return name.includes(q) || q.includes(name);
  });
  return fuzzy || null;
}

/* ========================================================================= */
/* PROJECTS                                                                  */
/* ========================================================================= */

function loadProjects() {
  return loadJson(PROJECTS_FILE);
}

function saveProjects(projects) {
  saveJson(PROJECTS_FILE, projects);
}

function createProject(data = {}) {
  // Validate client existence
  let client = null;
  if (data.clientId) {
    client = findClient(data.clientId);
  } else if (data.clientName) {
    client = findClient(data.clientName);
  } else if (data.companyName) {
    client = findClient(data.companyName);
  }

  if (!client) {
    return {
      success: false,
      error: "CLIENT NOT FOUND\nPlease convert/create the client first."
    };
  }

  const projects = loadProjects();
  const projectName = String(data.projectName || `${client.companyName} Service Delivery`).trim();

  // Duplicate prevention: check if an active project with the same name exists for this client
  const duplicate = projects.find(p =>
    p.clientId === client.id &&
    p.projectName.toLowerCase() === projectName.toLowerCase() &&
    p.status !== "COMPLETED" &&
    p.status !== "CANCELLED"
  );

  if (duplicate) {
    return {
      success: false,
      error: `Duplicate project: An active project named "${projectName}" already exists for ${client.companyName} (ID: ${duplicate.id}).`,
      project: duplicate
    };
  }

  const statusCandidate = String(data.status || "PLANNED").toUpperCase().trim();
  const status = PROJECT_STATUSES.includes(statusCandidate) ? statusCandidate : "PLANNED";

  const priorityCandidate = String(data.priority || "MEDIUM").toUpperCase().trim();
  const priority = PRIORITIES.includes(priorityCandidate) ? priorityCandidate : "MEDIUM";

  const now = new Date().toISOString();
  const project = {
    id: data.id || `proj-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    clientId: client.id,
    leadId: client.leadId || null,
    projectName,
    serviceType: data.serviceType || client.service || "RESEARCH REQUIRED",
    description: data.description ? String(data.description).trim() : `Service delivery and implementation for ${client.companyName}`,
    status,
    priority,
    startDate: data.startDate && String(data.startDate).trim().length > 0 ? String(data.startDate).trim() : "NOT SET",
    targetDate: data.targetDate && String(data.targetDate).trim().length > 0 ? String(data.targetDate).trim() : "NOT SET",
    currentMilestoneId: data.currentMilestoneId || null,
    progress: typeof data.progress === "number" ? Math.min(100, Math.max(0, data.progress)) : 0,
    notes: data.notes ? String(data.notes).trim() : "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  projects.push(project);
  saveProjects(projects);

  if (isSyncEnabled()) {
    serviceDeliveryRepository.createProject({
      id: project.id,
      clientId: project.clientId,
      name: project.projectName,
      status: project.status,
      description: project.description,
      startDate: project.startDate !== "NOT SET" ? project.startDate : null,
      targetEndDate: project.targetDate !== "NOT SET" ? project.targetDate : null,
      metadata: {
        serviceType: project.serviceType,
        priority: project.priority,
        progress: project.progress,
        leadId: project.leadId,
        notes: project.notes
      },
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }).catch(err => {
      console.warn("[ServiceDeliveryStore PG Sync Warning]", err.message);
    });
  }

  // Automatically initialize an Onboarding record if none exists for this project
  const existingOnb = getOnboardingByProjectId(project.id);
  if (!existingOnb) {
    createOnboarding({
      clientId: client.id,
      projectId: project.id,
      status: "NOT_STARTED",
      pendingItems: [
        "Welcome call and kickoff",
        "Requirements collection & confirmation",
        "Technical access and project setup"
      ]
    });
  }

  // Record CRM activity
  try {
    crmStore.addActivity({
      leadId: client.leadId,
      type: "PROJECT_CREATED",
      description: `Project "${project.projectName}" created for ${client.companyName} (${project.serviceType})`,
      metadata: { projectId: project.id, clientId: client.id }
    });
  } catch {
    // Graceful fallback
  }

  return {
    success: true,
    project
  };
}

function getProject(id) {
  const projects = loadProjects();
  return projects.find(p => p.id === id) || null;
}

function getProjects(filter = {}) {
  const projects = loadProjects();
  return projects.filter(p => {
    if (filter.clientId && p.clientId !== filter.clientId) return false;
    if (filter.leadId && p.leadId !== filter.leadId) return false;
    if (filter.status && p.status !== filter.status.toUpperCase().trim()) return false;
    if (filter.priority && p.priority !== filter.priority.toUpperCase().trim()) return false;
    return true;
  });
}

function getProjectByClientId(clientId) {
  const projects = getProjects({ clientId });
  return projects[0] || null;
}

function updateProject(id, updates = {}) {
  const projects = loadProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return null;

  const current = projects[idx];
  const updated = {
    ...current,
    ...updates,
    id: current.id,
    clientId: current.clientId,
    leadId: current.leadId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (updates.status) {
    const s = String(updates.status).toUpperCase().trim();
    if (PROJECT_STATUSES.includes(s)) updated.status = s;
  }

  if (updates.priority) {
    const p = String(updates.priority).toUpperCase().trim();
    if (PRIORITIES.includes(p)) updated.priority = p;
  }

  if (typeof updates.progress === "number") {
    updated.progress = Math.min(100, Math.max(0, updates.progress));
  }

  // Ensure dates are not arbitrarily invented
  if (updates.startDate === undefined) updated.startDate = current.startDate || "NOT SET";
  if (updates.targetDate === undefined) updated.targetDate = current.targetDate || "NOT SET";

  projects[idx] = updated;
  saveProjects(projects);

  if (isSyncEnabled()) {
    serviceDeliveryRepository.updateProject(id, {
      name: updated.projectName,
      status: updated.status,
      description: updated.description,
      startDate: updated.startDate !== "NOT SET" ? updated.startDate : null,
      targetEndDate: updated.targetDate !== "NOT SET" ? updated.targetDate : null,
      metadata: {
        serviceType: updated.serviceType,
        priority: updated.priority,
        progress: updated.progress,
        notes: updated.notes
      }
    }).catch(err => {
      console.warn("[ServiceDeliveryStore PG Sync Warning]", err.message);
    });
  }

  // CRM Activity logging for major status transitions
  if (updates.status && updates.status !== current.status) {
    let actType = "STATUS_CHANGED";
    if (updates.status === "COMPLETED") actType = "PROJECT_COMPLETED";
    if (updates.status === "CLIENT_REVIEW") actType = "CLIENT_REVIEW";

    try {
      crmStore.addActivity({
        leadId: updated.leadId,
        type: actType,
        description: `Project "${updated.projectName}" status updated to ${updated.status}`,
        metadata: { projectId: updated.id, oldStatus: current.status, newStatus: updated.status }
      });
    } catch {
      // Graceful fallback
    }
  }

  return updated;
}

/* ========================================================================= */
/* ONBOARDING                                                                */
/* ========================================================================= */

function loadOnboardings() {
  return loadJson(ONBOARDING_FILE);
}

function saveOnboardings(onboardings) {
  saveJson(ONBOARDING_FILE, onboardings);
}

function createOnboarding(data = {}) {
  const onboardings = loadOnboardings();
  const statusCandidate = String(data.status || "NOT_STARTED").toUpperCase().trim();
  const status = ONBOARDING_STATUSES.includes(statusCandidate) ? statusCandidate : "NOT_STARTED";

  const now = new Date().toISOString();
  const onboarding = {
    id: data.id || `onb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    clientId: data.clientId,
    projectId: data.projectId,
    status,
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    completedItems: Array.isArray(data.completedItems) ? data.completedItems : [],
    pendingItems: Array.isArray(data.pendingItems)
      ? data.pendingItems
      : [
          "Welcome call and kickoff",
          "Requirements collection & confirmation",
          "Technical access and project setup"
        ],
    notes: data.notes ? String(data.notes).trim() : "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  onboardings.push(onboarding);
  saveOnboardings(onboardings);
  return onboarding;
}

function getOnboarding(id) {
  const onboardings = loadOnboardings();
  return onboardings.find(o => o.id === id) || null;
}

function getOnboardingByProjectId(projectId) {
  const onboardings = loadOnboardings();
  return onboardings.find(o => o.projectId === projectId) || null;
}

function getOnboardingByClientId(clientId) {
  const onboardings = loadOnboardings();
  return onboardings.find(o => o.clientId === clientId) || null;
}

function updateOnboarding(id, updates = {}) {
  const onboardings = loadOnboardings();
  const idx = onboardings.findIndex(o => o.id === id);
  if (idx === -1) return null;

  const current = onboardings[idx];
  const updated = {
    ...current,
    ...updates,
    id: current.id,
    clientId: current.clientId,
    projectId: current.projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (updates.status) {
    const s = String(updates.status).toUpperCase().trim();
    if (ONBOARDING_STATUSES.includes(s)) updated.status = s;
  }

  // Handle completing specific item
  if (updates.completeItem) {
    const item = String(updates.completeItem).trim();
    if (!updated.completedItems.includes(item)) {
      updated.completedItems.push(item);
    }
    updated.pendingItems = updated.pendingItems.filter(i => i.toLowerCase() !== item.toLowerCase());
  }

  onboardings[idx] = updated;
  saveOnboardings(onboardings);

  // If onboarding completed, update project status from ONBOARDING to IN_PROGRESS
  if (updated.status === "ONBOARDING_COMPLETED") {
    const project = getProject(updated.projectId);
    if (project && (project.status === "ONBOARDING" || project.status === "PLANNED")) {
      updateProject(project.id, { status: "IN_PROGRESS" });
    }
  }

  return updated;
}

/* ========================================================================= */
/* REQUIREMENTS                                                              */
/* ========================================================================= */

function loadRequirements() {
  return loadJson(REQUIREMENTS_FILE);
}

function saveRequirements(requirements) {
  saveJson(REQUIREMENTS_FILE, requirements);
}

function addRequirement(data = {}) {
  if (!data.projectId) {
    return { success: false, error: "projectId is required to record a requirement." };
  }
  const project = getProject(data.projectId);
  if (!project) {
    return { success: false, error: `Project not found for ID: ${data.projectId}` };
  }

  const requirements = loadRequirements();
  const title = String(data.title || "").trim();
  if (!title) {
    return { success: false, error: "Requirement title cannot be empty." };
  }

  const statusCandidate = String(data.status || "PENDING").toUpperCase().trim();
  const status = REQUIREMENT_STATUSES.includes(statusCandidate) ? statusCandidate : "PENDING";

  const sourceCandidate = String(data.source || "USER-PROVIDED").toUpperCase().trim();
  const source = REQUIREMENT_SOURCES.includes(sourceCandidate) ? sourceCandidate : "USER-PROVIDED";

  const now = new Date().toISOString();
  const req = {
    id: data.id || `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    projectId: project.id,
    clientId: project.clientId,
    title,
    description: data.description ? String(data.description).trim() : title,
    status,
    source,
    notes: data.notes ? String(data.notes).trim() : "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  requirements.push(req);
  saveRequirements(requirements);

  // Link into onboarding if onboarding exists
  const onb = getOnboardingByProjectId(project.id);
  if (onb && !onb.requirements.includes(req.id)) {
    updateOnboarding(onb.id, {
      requirements: [...onb.requirements, req.id]
    });
  }

  // Record CRM activity
  try {
    crmStore.addActivity({
      leadId: project.leadId,
      type: "REQUIREMENT_RECEIVED",
      description: `Requirement added for ${project.projectName}: "${req.title}" [${req.source}]`,
      metadata: { requirementId: req.id, projectId: project.id }
    });
  } catch {
    // Graceful fallback
  }

  return { success: true, requirement: req };
}

function getRequirements(filter = {}) {
  const requirements = loadRequirements();
  return requirements.filter(r => {
    if (filter.projectId && r.projectId !== filter.projectId) return false;
    if (filter.clientId && r.clientId !== filter.clientId) return false;
    if (filter.status && r.status !== filter.status.toUpperCase().trim()) return false;
    if (filter.source && r.source !== filter.source.toUpperCase().trim()) return false;
    return true;
  });
}

function updateRequirement(id, updates = {}) {
  const requirements = loadRequirements();
  const idx = requirements.findIndex(r => r.id === id);
  if (idx === -1) return null;

  const current = requirements[idx];
  const updated = {
    ...current,
    ...updates,
    id: current.id,
    projectId: current.projectId,
    clientId: current.clientId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (updates.status) {
    const s = String(updates.status).toUpperCase().trim();
    if (REQUIREMENT_STATUSES.includes(s)) updated.status = s;
  }

  if (updates.source) {
    const src = String(updates.source).toUpperCase().trim();
    if (REQUIREMENT_SOURCES.includes(src)) updated.source = src;
  }

  requirements[idx] = updated;
  saveRequirements(requirements);

  // If confirmed, record CRM activity
  if (updated.status === "CONFIRMED" && current.status !== "CONFIRMED") {
    const project = getProject(updated.projectId);
    if (project) {
      try {
        crmStore.addActivity({
          leadId: project.leadId,
          type: "REQUIREMENT_CONFIRMED",
          description: `Requirement confirmed: "${updated.title}" for ${project.projectName}`,
          metadata: { requirementId: updated.id, projectId: project.id }
        });
      } catch {
        // Graceful fallback
      }
    }
  }

  return updated;
}

/* ========================================================================= */
/* MILESTONES                                                                */
/* ========================================================================= */

function loadMilestones() {
  return loadJson(MILESTONES_FILE);
}

function saveMilestones(milestones) {
  saveJson(MILESTONES_FILE, milestones);
}

function createMilestone(data = {}) {
  if (!data.projectId) {
    return { success: false, error: "projectId is required to create a milestone." };
  }
  const project = getProject(data.projectId);
  if (!project) {
    return { success: false, error: `Project not found for ID: ${data.projectId}` };
  }

  const milestones = loadMilestones();
  const name = String(data.name || "").trim();
  if (!name) {
    return { success: false, error: "Milestone name cannot be empty." };
  }

  const statusCandidate = String(data.status || "NOT_STARTED").toUpperCase().trim();
  const status = MILESTONE_STATUSES.includes(statusCandidate) ? statusCandidate : "NOT_STARTED";

  const existingProjectMilestones = milestones.filter(m => m.projectId === project.id);
  const order = typeof data.order === "number" ? data.order : existingProjectMilestones.length + 1;

  const now = new Date().toISOString();
  const milestone = {
    id: data.id || `ms-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    projectId: project.id,
    name,
    description: data.description ? String(data.description).trim() : name,
    status,
    order,
    startDate: data.startDate && String(data.startDate).trim().length > 0 ? String(data.startDate).trim() : "NOT SET",
    targetDate: data.targetDate && String(data.targetDate).trim().length > 0 ? String(data.targetDate).trim() : "NOT SET",
    completedAt: data.completedAt || null,
    notes: data.notes ? String(data.notes).trim() : "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  milestones.push(milestone);
  saveMilestones(milestones);

  return { success: true, milestone };
}

function getMilestones(projectId) {
  const milestones = loadMilestones();
  const filtered = projectId ? milestones.filter(m => m.projectId === projectId) : milestones;
  return filtered.sort((a, b) => a.order - b.order);
}

function updateMilestone(id, updates = {}) {
  const milestones = loadMilestones();
  const idx = milestones.findIndex(m => m.id === id);
  if (idx === -1) return null;

  const current = milestones[idx];
  const updated = {
    ...current,
    ...updates,
    id: current.id,
    projectId: current.projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (updates.status) {
    const s = String(updates.status).toUpperCase().trim();
    if (MILESTONE_STATUSES.includes(s)) {
      updated.status = s;
      if (s === "COMPLETED" && !updated.completedAt) {
        updated.completedAt = new Date().toISOString();
      }
    }
  }

  // Ensure dates are not arbitrarily invented
  if (updates.startDate === undefined) updated.startDate = current.startDate || "NOT SET";
  if (updates.targetDate === undefined) updated.targetDate = current.targetDate || "NOT SET";

  milestones[idx] = updated;
  saveMilestones(milestones);

  if (updated.status === "COMPLETED" && current.status !== "COMPLETED") {
    const project = getProject(updated.projectId);
    if (project) {
      try {
        crmStore.addActivity({
          leadId: project.leadId,
          type: "MILESTONE_COMPLETED",
          description: `Milestone "${updated.name}" completed for ${project.projectName}`,
          metadata: { milestoneId: updated.id, projectId: project.id }
        });
      } catch {
        // Graceful fallback
      }
    }
  }

  return updated;
}

/* ========================================================================= */
/* TASKS                                                                     */
/* ========================================================================= */

function loadTasks() {
  return loadJson(TASKS_FILE);
}

function saveTasks(tasks) {
  saveJson(TASKS_FILE, tasks);
}

function createTask(data = {}) {
  if (!data.projectId) {
    return { success: false, error: "projectId is required to create a task." };
  }
  const project = getProject(data.projectId);
  if (!project) {
    return { success: false, error: `Project not found for ID: ${data.projectId}` };
  }

  const tasks = loadTasks();
  const title = String(data.title || "").trim();
  if (!title) {
    return { success: false, error: "Task title cannot be empty." };
  }

  const statusCandidate = String(data.status || "TODO").toUpperCase().trim();
  const status = TASK_STATUSES.includes(statusCandidate) ? statusCandidate : "TODO";

  const priorityCandidate = String(data.priority || "MEDIUM").toUpperCase().trim();
  const priority = PRIORITIES.includes(priorityCandidate) ? priorityCandidate : "MEDIUM";

  const now = new Date().toISOString();
  const task = {
    id: data.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    projectId: project.id,
    milestoneId: data.milestoneId || null,
    title,
    description: data.description ? String(data.description).trim() : title,
    status,
    priority,
    owner: data.owner && String(data.owner).trim().length > 0 ? String(data.owner).trim() : "UNASSIGNED",
    dueDate: data.dueDate && String(data.dueDate).trim().length > 0 ? String(data.dueDate).trim() : "NOT SET",
    notes: data.notes ? String(data.notes).trim() : "",
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };

  tasks.push(task);
  saveTasks(tasks);

  // Recalculate project progress
  recalculateProjectProgress(project.id);

  return { success: true, task };
}

function getTasks(filter = {}) {
  const tasks = loadTasks();
  return tasks.filter(t => {
    if (filter.projectId && t.projectId !== filter.projectId) return false;
    if (filter.milestoneId && t.milestoneId !== filter.milestoneId) return false;
    if (filter.status && t.status !== filter.status.toUpperCase().trim()) return false;
    if (filter.priority && t.priority !== filter.priority.toUpperCase().trim()) return false;
    return true;
  });
}

function updateTask(id, updates = {}) {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;

  const current = tasks[idx];
  const updated = {
    ...current,
    ...updates,
    id: current.id,
    projectId: current.projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (updates.status) {
    const s = String(updates.status).toUpperCase().trim();
    if (TASK_STATUSES.includes(s)) updated.status = s;
  }

  if (updates.priority) {
    const p = String(updates.priority).toUpperCase().trim();
    if (PRIORITIES.includes(p)) updated.priority = p;
  }

  // Safety: never invent owner or dueDate
  if (updates.owner === undefined) updated.owner = current.owner || "UNASSIGNED";
  if (updates.dueDate === undefined) updated.dueDate = current.dueDate || "NOT SET";

  tasks[idx] = updated;
  saveTasks(tasks);

  recalculateProjectProgress(current.projectId);

  return updated;
}

function recalculateProjectProgress(projectId) {
  const projectTasks = getTasks({ projectId });
  if (projectTasks.length === 0) return;

  const doneCount = projectTasks.filter(t => t.status === "DONE").length;
  const progress = Math.round((doneCount / projectTasks.length) * 100);

  const project = getProject(projectId);
  if (project && project.progress !== progress) {
    updateProject(projectId, { progress });
  }
}

/* ========================================================================= */
/* AGGREGATED REPORTING & DASHBOARD-READY INTERFACES                          */
/* ========================================================================= */

function getProjectOverview() {
  const projects = loadProjects();
  const onboardings = loadOnboardings();
  const requirements = loadRequirements();
  const milestones = loadMilestones();
  const tasks = loadTasks();

  const byStatus = {
    PLANNED: 0,
    ONBOARDING: 0,
    IN_PROGRESS: 0,
    CLIENT_REVIEW: 0,
    BLOCKED: 0,
    COMPLETED: 0,
    CANCELLED: 0
  };

  for (const p of projects) {
    if (byStatus[p.status] !== undefined) byStatus[p.status]++;
  }

  const taskStats = {
    total: tasks.length,
    TODO: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    REVIEW: 0,
    DONE: 0
  };

  for (const t of tasks) {
    if (taskStats[t.status] !== undefined) taskStats[t.status]++;
  }

  const blockedItems = [
    ...projects.filter(p => p.status === "BLOCKED").map(p => `Project: ${p.projectName}`),
    ...milestones.filter(m => m.status === "BLOCKED").map(m => `Milestone: ${m.name}`),
    ...tasks.filter(t => t.status === "BLOCKED").map(t => `Task: ${t.title}`)
  ];

  return {
    totalProjects: projects.length,
    projectsByStatus: byStatus,
    totalOnboardings: onboardings.length,
    onboardingActive: onboardings.filter(o => o.status !== "ONBOARDING_COMPLETED").length,
    totalRequirements: requirements.length,
    requirementsPending: requirements.filter(r => r.status === "PENDING").length,
    requirementsConfirmed: requirements.filter(r => r.status === "CONFIRMED").length,
    totalMilestones: milestones.length,
    milestonesCompleted: milestones.filter(m => m.status === "COMPLETED").length,
    tasks: taskStats,
    blockedItems
  };
}

function getClientDeliveryProfile(clientQuery) {
  const client = findClient(clientQuery);
  if (!client) {
    return {
      found: false,
      error: "CLIENT NOT FOUND\nPlease convert/create the client first."
    };
  }

  const projects = getProjects({ clientId: client.id });
  const activeProject = projects[0] || null;

  let onboarding = null;
  let requirements = [];
  let milestones = [];
  let tasks = [];
  let blockers = [];

  if (activeProject) {
    onboarding = getOnboardingByProjectId(activeProject.id);
    requirements = getRequirements({ projectId: activeProject.id });
    milestones = getMilestones(activeProject.id);
    tasks = getTasks({ projectId: activeProject.id });

    // Identify active blockers
    if (activeProject.status === "BLOCKED") blockers.push(`Project "${activeProject.projectName}" is BLOCKED`);
    for (const m of milestones) {
      if (m.status === "BLOCKED") blockers.push(`Milestone "${m.name}" is BLOCKED: ${m.notes || "No details provided"}`);
    }
    for (const t of tasks) {
      if (t.status === "BLOCKED") blockers.push(`Task "${t.title}" is BLOCKED: ${t.notes || "No details provided"}`);
    }
    for (const r of requirements) {
      if (r.status === "BLOCKED") blockers.push(`Requirement "${r.title}" is BLOCKED`);
    }
  }

  // Recommended next action
  let nextAction = "No action scheduled";
  if (!activeProject) {
    nextAction = `Create a project for ${client.companyName} using: node index.js "create project for ${client.companyName}"`;
  } else if (activeProject.status === "PLANNED") {
    nextAction = `Start project onboarding using: node index.js "start project ${activeProject.projectName}"`;
  } else if (onboarding && onboarding.status !== "ONBOARDING_COMPLETED") {
    const nextPending = onboarding.pendingItems[0];
    nextAction = `Complete onboarding item: "${nextPending || "Review requirements"}"`;
  } else if (blockers.length > 0) {
    nextAction = `Resolve active blocker: ${blockers[0]}`;
  } else {
    const nextTask = tasks.find(t => t.status === "TODO" || t.status === "IN_PROGRESS");
    if (nextTask) {
      nextAction = `Execute task: "${nextTask.title}" (${nextTask.status})`;
    } else {
      nextAction = `Deliverable review with client for project ${activeProject.projectName}`;
    }
  }

  return {
    found: true,
    client,
    project: activeProject,
    allProjects: projects,
    onboarding,
    requirements,
    milestones,
    tasks,
    blockers,
    nextAction
  };
}

function clearServiceDelivery() {
  ensureStoreExists();
  fs.writeFileSync(PROJECTS_FILE, "[]", "utf8");
  fs.writeFileSync(ONBOARDING_FILE, "[]", "utf8");
  fs.writeFileSync(REQUIREMENTS_FILE, "[]", "utf8");
  fs.writeFileSync(MILESTONES_FILE, "[]", "utf8");
  fs.writeFileSync(TASKS_FILE, "[]", "utf8");

  if (isSyncEnabled()) {
    serviceDeliveryRepository.clearTasks().catch(() => {});
    serviceDeliveryRepository.clearMilestones().catch(() => {});
    serviceDeliveryRepository.clearRequirements().catch(() => {});
    serviceDeliveryRepository.clearOnboarding().catch(() => {});
    serviceDeliveryRepository.clearProjects().catch(() => {});
  }
}

module.exports = {
  findClient,
  createProject,
  getProject,
  getProjects,
  getProjectByClientId,
  updateProject,
  createOnboarding,
  getOnboarding,
  getOnboardings: loadOnboardings,
  getOnboardingByProjectId,
  getOnboardingByClientId,
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
  getClientDeliveryProfile,
  clearServiceDelivery,
  repository: serviceDeliveryRepository,
  PROJECT_STATUSES,
  ONBOARDING_STATUSES,
  REQUIREMENT_STATUSES,
  REQUIREMENT_SOURCES,
  MILESTONE_STATUSES,
  TASK_STATUSES,
  PRIORITIES
};
