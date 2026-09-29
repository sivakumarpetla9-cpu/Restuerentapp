require("dotenv").config();
const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const leadStore = require("./memory/leadStore");
const crmStore = require("./memory/crmStore");
const serviceDeliveryStore = require("./memory/serviceDeliveryStore");
const communicationStore = require("./memory/communicationStore");
const communicationEventsStore = require("./memory/communicationEventsStore");
const gateway = require("./communication/gateway");
const { processWebhook } = require("./communication/webhooks");
const userStore = require("./memory/userStore");
const securityAuditStore = require("./memory/securityAuditStore");
const { getAgents } = require("./agents/registry");
const { testConnection, isPostgresConfigured } = require("./memory/db");
const restaurantRepository = require("./memory/repositories/restaurantRepository");
const restaurantStore = require("./memory/restaurantStore");
const {
  generateQrToken,
  verifyQrToken,
  generateCustomerSessionToken,
  verifyCustomerSessionToken
} = require("./security/qrToken");

const {
  createSession,
  destroySession,
  buildSessionCookie,
  buildClearSessionCookie,
  extractToken
} = require("./security/session");
const {
  authenticate,
  requireAuth,
  requirePermission,
  requireRole
} = require("./security/auth");
const {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  getClientIp
} = require("./security/rateLimiter");

const PORT = process.env.PORT || 3001;
const DIST_DIR = path.join(__dirname, "frontend/dist");

// Bootstrap initial admin if configured and no users exist
userStore.bootstrapAdmin();

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", err => reject(err));
  });
}

function setCorsHeaders(res, req) {
  const origin = req ? (req.headers["origin"] || req.headers["Origin"]) : null;
  const allowedOriginEnv = process.env.FRONTEND_URL || process.env.CORS_ORIGIN;

  if (origin) {
    if (allowedOriginEnv) {
      const allowedList = allowedOriginEnv.split(",").map(o => o.trim().replace(/\/$/, ""));
      const originNormalized = origin.trim().replace(/\/$/, "");
      if (allowedList.includes(originNormalized) || allowedList.includes("*") || originNormalized.includes("vercel.app") || originNormalized.includes("localhost") || originNormalized.includes("127.0.0.1")) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie, X-Session-Token, X-Table-Session, X-Session-Id, Idempotency-Key");
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*"
  );
}

function sendJson(res, statusCode, data) {
  setSecurityHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  };
  return types[ext] || "application/octet-stream";
}

function serveStatic(req, res, pathname) {
  setSecurityHeaders(res);

  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <html>
        <head><title>AI Business Agent Dashboard</title></head>
        <body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc;">
          <h1>AI Business Agent Dashboard API Server</h1>
          <p>API server is running on port ${PORT}.</p>
          <p>To run the frontend dashboard: <code>cd frontend && npm run dev</code></p>
        </body>
      </html>
    `);
    return;
  }

  let filePath = path.join(DIST_DIR, pathname === "/" ? "index.html" : pathname);

  if (!fs.existsSync(filePath)) {
    // SPA fallback to index.html
    filePath = path.join(DIST_DIR, "index.html");
  }

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
}

// Phase 4: In-flight session lock and idempotency cache for order placement
const inFlightOrderSessions = new Set();
const orderIdempotencyCache = new Map();

async function resolveCustomerSession(req) {
  const token =
    req.headers["x-session-token"] ||
    req.headers["x-table-session"] ||
    extractToken(req);

  const rawSessionId = req.headers["x-session-id"];

  let session = null;
  let restaurantId = null;
  let tableId = null;
  let branchId = null;

  if (token) {
    const verified = verifyCustomerSessionToken(token);
    if (!verified.valid) {
      return { error: verified.error || "Invalid session token", status: 401 };
    }
    restaurantId = verified.restaurantId;
    tableId = verified.tableId;
    branchId = verified.branchId;
    session = restaurantStore.getSession(verified.sessionId);
    if (!session && isPostgresConfigured()) {
      try {
        session = await restaurantRepository.getTableSessionById(verified.sessionId);
      } catch (err) {
        console.warn("[resolveCustomerSession PG lookup]", err.message);
      }
    }
    if (!session) {
      return { error: "Session record not found", status: 404 };
    }
  } else if (rawSessionId) {
    session = restaurantStore.getSession(rawSessionId);
    if (!session && isPostgresConfigured()) {
      try {
        session = await restaurantRepository.getTableSessionById(rawSessionId);
      } catch (err) {
        console.warn("[resolveCustomerSession PG lookup]", err.message);
      }
    }
    if (!session) {
      return { error: "Session not found", status: 404 };
    }
    restaurantId = session.restaurantId;
    tableId = session.tableId;
    branchId = session.branchId;
  } else {
    return { error: "Missing customer session token", status: 401 };
  }

  if (session.status !== "ACTIVE") {
    return { error: "Table session is no longer active", status: 403 };
  }

  const table = restaurantStore.getTableById(restaurantId, tableId);
  if (!table || table.isActive === false) {
    return { error: "Table is inactive or deleted", status: 403 };
  }

  return { session, restaurantId, tableId, branchId, table };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;
  const method = req.method;

  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Public Health Checks (Cloud Deployment / Monitoring Probes)
  if ((pathname === "/health" || pathname === "/api/health") && method === "GET") {
    return sendJson(res, 200, {
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: "ai-business-agent",
      environment: process.env.NODE_ENV || "development",
      database: {
        provider: (process.env.DATABASE_PROVIDER || "json").toLowerCase(),
        configured: Boolean(process.env.DATABASE_URL)
      }
    });
  }

  // API Routes
  if (pathname.startsWith("/api/")) {
    try {
      /* ===================================================================== */
      /* AUTHENTICATION & USER SESSIONS (PUBLIC & AUTH ROUTES)                 */
      /* ===================================================================== */

      // 1. Login (Public, Rate Limited)
      if (pathname === "/api/auth/login" && method === "POST") {
        const clientIp = getClientIp(req);
        const rateCheck = checkRateLimit(clientIp);
        if (!rateCheck.allowed) {
          return sendJson(res, 429, { error: rateCheck.error });
        }

        const body = await parseRequestBody(req);
        const { email, password } = body;

        if (!email || !password) {
          recordFailedAttempt(clientIp);
          return sendJson(res, 400, { error: "Email and password are required." });
        }

        const user = userStore.verifyUserCredentials(email, password, clientIp);
        if (!user) {
          recordFailedAttempt(clientIp);
          return sendJson(res, 401, { error: "Invalid email or password." });
        }

        resetRateLimit(clientIp);
        const session = createSession(user);
        const cookieHeader = buildSessionCookie(session.token);

        res.setHeader("Set-Cookie", cookieHeader);
        return sendJson(res, 200, {
          success: true,
          user,
          token: session.token
        });
      }

      // 2. Logout (Invalidates session & clears cookie)
      if (pathname === "/api/auth/logout" && method === "POST") {
        const token = extractToken(req);
        if (token) {
          const user = authenticate(req);
          if (user) {
            securityAuditStore.logSecurityEvent({
              type: "LOGOUT",
              userId: user.id,
              email: user.email,
              ip: getClientIp(req)
            });
          }
          destroySession(token);
        }
        res.setHeader("Set-Cookie", buildClearSessionCookie());
        return sendJson(res, 200, { success: true, message: "Logged out successfully." });
      }

      // 3. Current User Profile
      if (pathname === "/api/auth/me" && method === "GET") {
        const user = authenticate(req);
        if (!user) {
          return sendJson(res, 200, { authenticated: false, user: null });
        }
        return sendJson(res, 200, { authenticated: true, user });
      }

      // 4. User Management (ADMIN Only)
      if (pathname === "/api/users" && method === "GET") {
        if (!requirePermission(req, res, "users.manage", sendJson)) return;
        const users = userStore.getUsers();
        return sendJson(res, 200, { users });
      }

      if (pathname === "/api/users" && method === "POST") {
        if (!requirePermission(req, res, "users.manage", sendJson)) return;
        const body = await parseRequestBody(req);
        try {
          const newUser = userStore.createUser(body);
          return sendJson(res, 201, { success: true, user: newUser });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && method === "PATCH") {
        if (!requirePermission(req, res, "users.manage", sendJson)) return;
        const targetId = userMatch[1];
        const body = await parseRequestBody(req);
        try {
          const updated = userStore.updateUser(targetId, body);
          return sendJson(res, 200, { success: true, user: updated });
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
      }

      // 5. Security Audit Logs (ADMIN Only)
      if (pathname === "/api/security/audit" && method === "GET") {
        if (!requirePermission(req, res, "audit.read", sendJson)) return;
        const filter = {};
        if (searchParams.get("type")) filter.type = searchParams.get("type");
        if (searchParams.get("email")) filter.email = searchParams.get("email");
        const logs = securityAuditStore.getSecurityAuditLogs(filter);
        return sendJson(res, 200, { auditLogs: logs });
      }

      // 5b. Database Health & Persistence Status
      if (pathname === "/api/database/status" && method === "GET") {
        const user = authenticate(req);
        if (!user) return sendError(res, 401, "Authentication required");
        const status = await testConnection();
        const countsRes = await getDatabaseCounts();
        return sendJson(res, 200, {
          database: status,
          counts: countsRes.counts
        });
      }

      /* ===================================================================== */
      /* BUSINESS DOMAIN ROUTES (PROTECTED BY AUTH & RBAC)                     */
      /* ===================================================================== */

      // 6. Dashboard Overview
      if (pathname === "/api/dashboard/overview" && method === "GET") {
        if (!requirePermission(req, res, "dashboard.read", sendJson)) return;

        const leads = leadStore.loadLeads();
        const clients = crmStore.getClients();
        const projects = serviceDeliveryStore.getProjects();
        const projOverview = serviceDeliveryStore.getProjectOverview();
        const activities = crmStore.getActivities();
        const commOverview = communicationStore.getCommunicationOverview();

        const qualifiedCount = leads.filter(l =>
          l.qualificationStatus === "QUALIFIED" ||
          (l.qualification && l.qualification.status === "QUALIFIED")
        ).length;
        const activeOpportunities = leads.filter(l =>
          ["INTERESTED", "DEMO_SCHEDULED", "PROPOSAL_SENT"].includes(l.pipelineStatus)
        ).length;
        const activeProjects = projects.filter(p =>
          ["ONBOARDING", "IN_PROGRESS", "CLIENT_REVIEW"].includes(p.status)
        ).length;

        const openTasks =
          projOverview.tasks.TODO +
          projOverview.tasks.IN_PROGRESS +
          projOverview.tasks.BLOCKED +
          projOverview.tasks.REVIEW;

        const pipelineStages = [
          { key: "LEAD", label: "Leads", count: leads.length },
          { key: "QUALIFIED", label: "Qualified", count: qualifiedCount },
          { key: "CONTACTED", label: "Contacted", count: leads.filter(l => l.pipelineStatus === "CONTACTED").length },
          { key: "INTERESTED", label: "Interested", count: leads.filter(l => l.pipelineStatus === "INTERESTED").length },
          { key: "DEMO_SCHEDULED", label: "Demo", count: leads.filter(l => l.pipelineStatus === "DEMO_SCHEDULED").length },
          { key: "PROPOSAL_SENT", label: "Proposal", count: leads.filter(l => l.pipelineStatus === "PROPOSAL_SENT").length },
          { key: "WON", label: "Won Deals", count: leads.filter(l => l.pipelineStatus === "WON").length },
          { key: "CLIENT", label: "Clients", count: clients.length },
          { key: "PROJECT", label: "Active Projects", count: activeProjects },
          { key: "COMPLETED", label: "Completed Projects", count: projects.filter(p => p.status === "COMPLETED").length }
        ];

        return sendJson(res, 200, {
          kpis: {
            totalLeads: leads.length,
            qualifiedLeads: qualifiedCount,
            activeOpportunities,
            clients: clients.length,
            activeProjects,
            pendingRequirements: projOverview.requirementsPending,
            openTasks,
            blockedItems: projOverview.blockedItems.length,
            totalMessages: commOverview.totalMessages,
            preparedMessages: (commOverview.byStatus.READY_FOR_REVIEW || 0) + (commOverview.byStatus.DRAFT || 0),
            approvedMessages: commOverview.byStatus.APPROVED || 0,
            copiedMessages: commOverview.byStatus.COPIED || 0
          },
          pipelineStages,
          recentActivities: activities.slice(0, 10),
          blockedList: projOverview.blockedItems
        });
      }

      // 7. Agents
      if (pathname === "/api/agents" && method === "GET") {
        if (!requirePermission(req, res, "agents.read", sendJson)) return;
        const rawAgents = getAgents();
        const agents = rawAgents.map(a => ({
          id: a.id,
          name: a.name,
          category: a.category,
          description: a.description,
          status: a.enabled ? "ACTIVE" : "DISABLED"
        }));
        return sendJson(res, 200, { agents });
      }

      // 8. Leads
      if (pathname === "/api/leads" && method === "GET") {
        if (!requirePermission(req, res, "leads.read", sendJson)) return;
        const leads = leadStore.loadLeads();
        return sendJson(res, 200, { leads });
      }

      const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (leadMatch && method === "GET") {
        if (!requirePermission(req, res, "leads.read", sendJson)) return;
        const leadId = leadMatch[1];
        const lead = leadStore.getLead(leadId);
        if (!lead) return sendError(res, 404, "Lead not found");

        const contacts = crmStore.getLeadContacts(lead.id);
        const activities = crmStore.getLeadActivities(lead.id);
        return sendJson(res, 200, { lead, contacts, activities });
      }

      // 9. Pipeline Kanban
      if (pathname === "/api/pipeline" && method === "GET") {
        if (!requirePermission(req, res, "pipeline.read", sendJson)) return;
        const leads = leadStore.loadLeads();
        const stages = [
          "NOT_CONTACTED",
          "CONTACTED",
          "REPLIED",
          "INTERESTED",
          "FOLLOW_UP",
          "DEMO_SCHEDULED",
          "PROPOSAL_SENT",
          "WON",
          "LOST"
        ];

        const columns = stages.map(status => ({
          status,
          title: status.replace(/_/g, " "),
          leads: leads.filter(l => (l.pipelineStatus || "NOT_CONTACTED") === status)
        }));

        return sendJson(res, 200, { columns });
      }

      // 10. Clients
      if (pathname === "/api/clients" && method === "GET") {
        if (!requirePermission(req, res, "crm.read", sendJson)) return;
        const clients = crmStore.getClients();
        return sendJson(res, 200, { clients });
      }

      const clientMatch = pathname.match(/^\/api\/clients\/([^/]+)$/);
      if (clientMatch && method === "GET") {
        if (!requirePermission(req, res, "crm.read", sendJson)) return;
        const clientId = clientMatch[1];
        const profile = serviceDeliveryStore.getClientDeliveryProfile(clientId);
        if (!profile.found) return sendError(res, 404, "Client not found");

        const activities = profile.client.leadId ? crmStore.getLeadActivities(profile.client.leadId) : [];
        const contacts = profile.client.leadId ? crmStore.getLeadContacts(profile.client.leadId) : [];

        return sendJson(res, 200, { ...profile, activities, contacts });
      }

      // 11. Projects
      if (pathname === "/api/projects" && method === "GET") {
        if (!requirePermission(req, res, "projects.read", sendJson)) return;
        const projects = serviceDeliveryStore.getProjects();
        const clients = crmStore.getClients();
        const enriched = projects.map(p => {
          const client = clients.find(c => c.id === p.clientId);
          return {
            ...p,
            clientName: client ? client.companyName : "Unknown Client"
          };
        });
        return sendJson(res, 200, { projects: enriched });
      }

      const projMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projMatch && method === "GET") {
        if (!requirePermission(req, res, "projects.read", sendJson)) return;
        const projId = projMatch[1];
        const project = serviceDeliveryStore.getProject(projId);
        if (!project) return sendError(res, 404, "Project not found");

        const client = crmStore.getClient(project.clientId);
        const onboarding = serviceDeliveryStore.getOnboardingByProjectId(project.id);
        const requirements = serviceDeliveryStore.getRequirements({ projectId: project.id });
        const milestones = serviceDeliveryStore.getMilestones(project.id);
        const tasks = serviceDeliveryStore.getTasks({ projectId: project.id });
        const activities = project.leadId ? crmStore.getLeadActivities(project.leadId) : [];

        return sendJson(res, 200, {
          project,
          client,
          onboarding,
          requirements,
          milestones,
          tasks,
          activities
        });
      }

      // 12. Onboarding
      if (pathname === "/api/onboarding" && method === "GET") {
        if (!requirePermission(req, res, "onboarding.read", sendJson)) return;
        const onboardings = serviceDeliveryStore.getOnboardings();
        const clients = crmStore.getClients();
        const projects = serviceDeliveryStore.getProjects();

        const enriched = onboardings.map(o => {
          const client = clients.find(c => c.id === o.clientId);
          const project = projects.find(p => p.id === o.projectId);
          return {
            ...o,
            clientName: client ? client.companyName : "Unknown Client",
            projectName: project ? project.projectName : "Unknown Project"
          };
        });

        return sendJson(res, 200, { onboardings: enriched });
      }

      // 13. Requirements
      if (pathname === "/api/requirements" && method === "GET") {
        if (!requirePermission(req, res, "requirements.read", sendJson)) return;
        const filter = {};
        if (searchParams.get("status")) filter.status = searchParams.get("status");
        if (searchParams.get("source")) filter.source = searchParams.get("source");

        const requirements = serviceDeliveryStore.getRequirements(filter);
        const projects = serviceDeliveryStore.getProjects();
        const clients = crmStore.getClients();

        const enriched = requirements.map(r => {
          const project = projects.find(p => p.id === r.projectId);
          const client = clients.find(c => c.id === r.clientId);
          return {
            ...r,
            projectName: project ? project.projectName : "Unknown Project",
            clientName: client ? client.companyName : "Unknown Client"
          };
        });

        return sendJson(res, 200, { requirements: enriched });
      }

      // 14. Milestones
      if (pathname === "/api/milestones" && method === "GET") {
        if (!requirePermission(req, res, "milestones.read", sendJson)) return;
        const milestones = serviceDeliveryStore.getMilestones();
        const projects = serviceDeliveryStore.getProjects();

        const enriched = milestones.map(m => {
          const project = projects.find(p => p.id === m.projectId);
          return {
            ...m,
            projectName: project ? project.projectName : "Unknown Project"
          };
        });

        return sendJson(res, 200, { milestones: enriched });
      }

      // 15. Tasks
      if (pathname === "/api/tasks" && method === "GET") {
        if (!requirePermission(req, res, "tasks.read", sendJson)) return;
        const filter = {};
        if (searchParams.get("status")) filter.status = searchParams.get("status");
        if (searchParams.get("priority")) filter.priority = searchParams.get("priority");

        const tasks = serviceDeliveryStore.getTasks(filter);
        const projects = serviceDeliveryStore.getProjects();

        const enriched = tasks.map(t => {
          const project = projects.find(p => p.id === t.projectId);
          return {
            ...t,
            projectName: project ? project.projectName : "Unknown Project"
          };
        });

        return sendJson(res, 200, { tasks: enriched });
      }

      // 16. Activities
      if (pathname === "/api/activities" && method === "GET") {
        if (!requirePermission(req, res, "activity.read", sendJson)) return;
        const activities = crmStore.getActivities();
        const leads = leadStore.loadLeads();

        const enriched = activities.map(a => {
          const lead = leads.find(l => l.id === a.leadId);
          return {
            ...a,
            companyName: lead ? lead.companyName : "General Activity"
          };
        });

        return sendJson(res, 200, { activities: enriched });
      }

      // 17. Messages & Communication Layer
      if (pathname === "/api/messages" && method === "GET") {
        if (!requirePermission(req, res, "communication.read", sendJson)) return;
        const filter = {};
        if (searchParams.get("channel")) filter.channel = searchParams.get("channel");
        if (searchParams.get("status")) filter.status = searchParams.get("status");
        if (searchParams.get("purpose")) filter.purpose = searchParams.get("purpose");
        if (searchParams.get("leadId")) filter.leadId = searchParams.get("leadId");
        if (searchParams.get("clientId")) filter.clientId = searchParams.get("clientId");
        if (searchParams.get("projectId")) filter.projectId = searchParams.get("projectId");

        const messages = communicationStore.getMessages(filter);
        const leads = leadStore.loadLeads();
        const clients = crmStore.getClients();
        const projects = serviceDeliveryStore.getProjects();

        const enriched = messages.map(m => {
          const lead = m.leadId ? leads.find(l => l.id === m.leadId) : null;
          const client = m.clientId ? clients.find(c => c.id === m.clientId) : null;
          const project = m.projectId ? projects.find(p => p.id === m.projectId) : null;
          return {
            ...m,
            leadName: lead ? lead.companyName : null,
            clientName: client ? client.companyName : null,
            projectName: project ? project.projectName : null
          };
        });

        return sendJson(res, 200, { messages: enriched });
      }

      if (pathname === "/api/messages/draft" && method === "POST") {
        if (!requirePermission(req, res, "communication.write", sendJson)) return;
        const body = await parseRequestBody(req);
        const { leadId, clientId, projectId, purpose, channel, options } = body;

        let result;
        if (leadId) {
          result = communicationStore.prepareDraftForLead(leadId, purpose, channel, options);
        } else if (clientId) {
          result = communicationStore.prepareDraftForClient(clientId, purpose, channel, options);
        } else if (projectId) {
          result = communicationStore.prepareDraftForProject(projectId, purpose, channel, options);
        } else {
          return sendError(res, 400, "One of leadId, clientId, or projectId must be provided.");
        }

        if (!result.success) {
          return sendError(res, 400, result.error);
        }

        return sendJson(res, 201, result);
      }

      const msgStatusMatch = pathname.match(/^\/api\/messages\/([^/]+)\/status$/);
      if (msgStatusMatch && (method === "PATCH" || method === "POST")) {
        if (!requirePermission(req, res, "communication.write", sendJson)) return;
        const msgId = msgStatusMatch[1];
        const body = await parseRequestBody(req);
        if (!body.status) return sendError(res, 400, "Status is required");

        if (body.status.toUpperCase().trim() === "SENT") {
          return sendError(res, 400, "Direct sending is disabled in local-first ₹0 mode. Messages are for preparation and review only; mark as APPROVED or COPIED.");
        }

        try {
          const updated = communicationStore.updateMessage(msgId, { status: body.status });
          if (!updated) return sendError(res, 404, "Message not found");
          return sendJson(res, 200, { success: true, message: updated });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      const msgApproveMatch = pathname.match(/^\/api\/messages\/([^/]+)\/approve$/);
      if (msgApproveMatch && method === "POST") {
        if (!requirePermission(req, res, "communication.write", sendJson)) return;
        const msgId = msgApproveMatch[1];
        const updated = communicationStore.markMessageApproved(msgId);
        if (!updated) return sendError(res, 404, "Message not found");
        return sendJson(res, 200, { success: true, message: updated });
      }

      const msgCopyMatch = pathname.match(/^\/api\/messages\/([^/]+)\/copy$/);
      if (msgCopyMatch && method === "POST") {
        if (!requirePermission(req, res, "communication.write", sendJson)) return;
        const msgId = msgCopyMatch[1];
        const updated = communicationStore.markMessageCopied(msgId);
        if (!updated) return sendError(res, 404, "Message not found");
        return sendJson(res, 200, { success: true, message: updated });
      }

      const msgMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
      if (msgMatch && method === "GET") {
        if (!requirePermission(req, res, "communication.read", sendJson)) return;
        const msgId = msgMatch[1];
        const message = communicationStore.getMessage(msgId);
        if (!message) return sendError(res, 404, "Message not found");

        const lead = message.leadId ? leadStore.getLead(message.leadId) : null;
        const client = message.clientId ? crmStore.getClient(message.clientId) : null;
        const project = message.projectId ? serviceDeliveryStore.getProject(message.projectId) : null;

        return sendJson(res, 200, { message, lead, client, project });
      }

      if (msgMatch && method === "DELETE") {
        if (!requirePermission(req, res, "communication.write", sendJson)) return;
        const msgId = msgMatch[1];
        const deleted = communicationStore.deleteMessage(msgId);
        if (!deleted) return sendError(res, 404, "Message not found");
        return sendJson(res, 200, { success: true, deleted: true });
      }

      // 18. Templates
      if (pathname === "/api/templates" && method === "GET") {
        if (!requirePermission(req, res, "communication.read", sendJson)) return;
        const filter = {};
        if (searchParams.get("channel")) filter.channel = searchParams.get("channel");
        if (searchParams.get("purpose")) filter.purpose = searchParams.get("purpose");

        const templates = communicationStore.getTemplates(filter);
        return sendJson(res, 200, { templates });
      }

      // 19. Communication Overview
      if (pathname === "/api/communication/overview" && method === "GET") {
        if (!requirePermission(req, res, "communication.read", sendJson)) return;
        const overview = communicationStore.getCommunicationOverview();
        return sendJson(res, 200, overview);
      }

      // 19.1 Level 3 Communication Gateway - Send Message
      if (pathname === "/api/communication/send" && method === "POST") {
        if (!requirePermission(req, res, "communication.send", sendJson)) return;
        const body = await parseRequestBody(req);
        if (!body.messageId) return sendError(res, 400, "messageId is required to send.");
        try {
          const result = await gateway.sendMessage(body.messageId, body.options || {});
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 19.2 Level 3 Communication Gateway - Simulate Event
      if (pathname === "/api/communication/simulate" && method === "POST") {
        if (!requirePermission(req, res, "communication.send", sendJson)) return;
        const body = await parseRequestBody(req);
        if (!body.messageId) return sendError(res, 400, "messageId is required for simulation.");
        const type = String(body.type || "DELIVERED").toUpperCase().trim();
        try {
          let result = null;
          if (type === "DELIVERED") {
            result = await gateway.simulateDelivery(body.messageId, body.options);
          } else if (type === "READ") {
            result = await gateway.simulateRead(body.messageId, body.options);
          } else if (type === "REPLIED") {
            const replyText = body.replyText || body.text || "Hello, I am interested.";
            result = await gateway.simulateReply(body.messageId, replyText, body.options);
          } else if (type === "FAILED") {
            result = await gateway.simulateFailure(body.messageId, body.reason || "Simulated failure", body.options);
          } else {
            return sendError(res, 400, `Unsupported simulation event type "${type}".`);
          }
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 19.3 Level 3 Communication Gateway - Communication Events
      if (pathname === "/api/communication/events" && method === "GET") {
        if (!requirePermission(req, res, "communication.read", sendJson)) return;
        const filter = {};
        if (searchParams.get("messageId")) filter.messageId = searchParams.get("messageId");
        if (searchParams.get("type")) filter.type = searchParams.get("type");
        const events = communicationEventsStore.getEvents(filter);
        return sendJson(res, 200, { success: true, events });
      }

      // 19.4 Level 3 Communication Gateway - Message Detail & Timeline
      const commStatusMatch = pathname.match(/^\/api\/communication\/messages\/([^/]+)\/status$/);
      if (commStatusMatch && method === "GET") {
        if (!requirePermission(req, res, "communication.read", sendJson)) return;
        const msgId = commStatusMatch[1];
        const statusObj = gateway.getMessageStatus(msgId);
        if (!statusObj) return sendError(res, 404, "Message not found");
        return sendJson(res, 200, { success: true, ...statusObj });
      }

      // 19.5 Level 3 Communication Gateway - Inbound Webhook
      const webhookMatch = pathname.match(/^\/api\/communication\/webhook\/([^/]+)$/);
      if (webhookMatch && method === "POST") {
        const provider = webhookMatch[1];
        const body = await parseRequestBody(req);
        const result = await processWebhook(provider, body, req.headers, Object.fromEntries(searchParams));
        return sendJson(res, result.statusCode, result.body);
      }

      // 20. Global Search
      if (pathname === "/api/search" && method === "GET") {
        if (!requirePermission(req, res, "dashboard.read", sendJson)) return;
        const q = String(searchParams.get("q") || "").trim().toLowerCase();
        if (!q) return sendJson(res, 200, { results: [] });

        const leads = leadStore.loadLeads();
        const clients = crmStore.getClients();
        const projects = serviceDeliveryStore.getProjects();
        const requirements = serviceDeliveryStore.getRequirements();
        const tasks = serviceDeliveryStore.getTasks();
        const messages = communicationStore.getMessages();

        const results = [];

        for (const l of leads) {
          if (
            (l.companyName && l.companyName.toLowerCase().includes(q)) ||
            (l.contactName && l.contactName.toLowerCase().includes(q)) ||
            (l.email && l.email.toLowerCase().includes(q)) ||
            (l.industry && l.industry.toLowerCase().includes(q)) ||
            (l.location && l.location.toLowerCase().includes(q))
          ) {
            results.push({
              category: "Lead",
              id: l.id,
              title: l.companyName,
              subtitle: `${l.industry || "General"} | ${l.qualificationStatus || "Unrated"}`,
              link: "leads"
            });
          }
        }

        for (const c of clients) {
          if (
            (c.companyName && c.companyName.toLowerCase().includes(q)) ||
            (c.service && c.service.toLowerCase().includes(q))
          ) {
            results.push({
              category: "Client",
              id: c.id,
              title: c.companyName,
              subtitle: `Service: ${c.service || "Standard"} (${c.status})`,
              link: "clients"
            });
          }
        }

        for (const p of projects) {
          if (
            (p.projectName && p.projectName.toLowerCase().includes(q)) ||
            (p.serviceType && p.serviceType.toLowerCase().includes(q)) ||
            (p.description && p.description.toLowerCase().includes(q))
          ) {
            results.push({
              category: "Project",
              id: p.id,
              title: p.projectName,
              subtitle: `Status: ${p.status} | Priority: ${p.priority}`,
              link: "projects"
            });
          }
        }

        for (const r of requirements) {
          if (
            (r.title && r.title.toLowerCase().includes(q)) ||
            (r.description && r.description.toLowerCase().includes(q))
          ) {
            results.push({
              category: "Requirement",
              id: r.id,
              title: r.title,
              subtitle: `[${r.status}] [${r.source}]`,
              link: "requirements"
            });
          }
        }

        for (const t of tasks) {
          if (
            (t.title && t.title.toLowerCase().includes(q)) ||
            (t.description && t.description.toLowerCase().includes(q)) ||
            (t.owner && t.owner.toLowerCase().includes(q))
          ) {
            results.push({
              category: "Task",
              id: t.id,
              title: t.title,
              subtitle: `[${t.status}] Priority: ${t.priority} (Owner: ${t.owner})`,
              link: "tasks"
            });
          }
        }

        for (const m of messages) {
          if (
            (m.recipientName && m.recipientName.toLowerCase().includes(q)) ||
            (m.subject && m.subject.toLowerCase().includes(q)) ||
            (m.body && m.body.toLowerCase().includes(q)) ||
            (m.purpose && m.purpose.toLowerCase().includes(q))
          ) {
            results.push({
              category: "Message",
              id: m.id,
              title: m.subject || `${m.channel} Draft (${m.purpose})`,
              subtitle: `[${m.status}] To: ${m.recipientName}`,
              link: "communication"
            });
          }
        }

        return sendJson(res, 200, { results: results.slice(0, 25) });
      }

      // ==========================================
      // RESTAURANT OS v1 — PHASE 2 ENDPOINTS
      // ==========================================

      // 1. Restaurant Profile GET
      if (pathname === "/api/restaurant/profile" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        let profile = restaurantStore.getRestaurantProfile(restaurantId);
        if (!profile && isPostgresConfigured()) {
          try {
            profile = await restaurantRepository.getRestaurantProfile(restaurantId);
          } catch (e) {}
        }

        if (!profile) {
          return sendError(res, 404, "Restaurant profile not found");
        }

        return sendJson(res, 200, { profile });
      }

      // 2. Restaurant Profile PATCH
      if (pathname === "/api/restaurant/profile" && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const body = await parseRequestBody(req);

        if (body.taxRate !== undefined) {
          const tr = parseFloat(body.taxRate);
          if (isNaN(tr) || tr < 0) {
            return sendError(res, 400, "Tax rate must be a valid non-negative number");
          }
        }

        if (body.email !== undefined && body.email !== null) {
          const emailStr = String(body.email).trim();
          if (emailStr && !/^[^\s@]+@([^\s@]+\.[^\s@]+|localhost)$/i.test(emailStr)) {
            return sendError(res, 400, "Invalid email address format");
          }
        }

        try {
          const updated = restaurantStore.updateRestaurantProfile(restaurantId, body);
          if (!updated) {
            return sendError(res, 404, "Restaurant profile not found");
          }
          return sendJson(res, 200, { success: true, profile: updated });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 3. Branches GET
      if (pathname === "/api/restaurant/branches" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const branches = restaurantStore.getBranches(restaurantId);
        return sendJson(res, 200, { branches });
      }

      // 4. Branches POST
      if (pathname === "/api/restaurant/branches" && method === "POST") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const body = await parseRequestBody(req);
        if (!body.name || !String(body.name).trim()) {
          return sendError(res, 400, "Branch name is required");
        }

        try {
          const branch = restaurantStore.createBranch({
            ...body,
            restaurantId
          });
          if (isPostgresConfigured()) {
            try {
              await restaurantRepository.createBranch(branch);
            } catch (e) {}
          }
          return sendJson(res, 201, { success: true, branch });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 5. Branches PATCH :id
      const branchMatch = pathname.match(/^\/api\/restaurant\/branches\/([^/]+)$/);
      if (branchMatch && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const branchId = branchMatch[1];
        const existingBranch = restaurantStore.getBranchById(restaurantId, branchId);
        if (!existingBranch) {
          return sendError(res, 404, "Branch not found");
        }

        const body = await parseRequestBody(req);
        try {
          const updated = restaurantStore.updateBranch(restaurantId, branchId, body);
          if (!updated) {
            return sendError(res, 404, "Branch not found");
          }
          return sendJson(res, 200, { success: true, branch: updated });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 6. Tables GET (support query filters branchId, status)
      if (pathname === "/api/restaurant/tables" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const filters = {};
        const branchFilter = searchParams.get("branchId");
        const statusFilter = searchParams.get("status");
        if (branchFilter) filters.branchId = branchFilter;
        if (statusFilter) filters.status = statusFilter;

        const tables = restaurantStore.getTables(restaurantId, filters);
        return sendJson(res, 200, { tables });
      }

      // 7. Tables POST
      if (pathname === "/api/restaurant/tables" && method === "POST") {
        if (!requirePermission(req, res, "restaurant.tables", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const body = await parseRequestBody(req);
        if (!body.tableNumber || !String(body.tableNumber).trim()) {
          return sendError(res, 400, "Table number is required");
        }

        const cap = parseInt(body.capacity, 10);
        if (isNaN(cap) || cap <= 0) {
          return sendError(res, 400, "Table capacity must be an integer greater than 0");
        }

        try {
          const table = restaurantStore.createTable({
            ...body,
            capacity: cap,
            restaurantId
          });
          if (isPostgresConfigured()) {
            try {
              await restaurantRepository.createTable(table);
            } catch (e) {}
          }
          return sendJson(res, 201, { success: true, table });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 8. Tables PATCH :id
      const tableMatch = pathname.match(/^\/api\/restaurant\/tables\/([^/]+)$/);
      if (tableMatch && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.tables", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) {
          return sendError(res, 400, "No restaurant context associated with current user");
        }

        const tableId = tableMatch[1];
        const existingTable = restaurantStore.getTableById(restaurantId, tableId);
        if (!existingTable) {
          return sendError(res, 404, "Table not found");
        }

        const body = await parseRequestBody(req);
        if (body.capacity !== undefined) {
          const cap = parseInt(body.capacity, 10);
          if (isNaN(cap) || cap <= 0) {
            return sendError(res, 400, "Table capacity must be an integer greater than 0");
          }
        }

        try {
          const updated = restaurantStore.updateTable(restaurantId, tableId, body);
          if (!updated) {
            return sendError(res, 404, "Table not found");
          }
          return sendJson(res, 200, { success: true, table: updated });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // ==========================================
      // RESTAURANT OS v1 — PHASE 3 ENDPOINTS
      // ==========================================

      // 9. Menu Categories GET
      if (pathname === "/api/restaurant/menu/categories" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const categories = restaurantStore.getCategories(restaurantId);
        return sendJson(res, 200, { categories });
      }

      // 10. Menu Categories POST
      if (pathname === "/api/restaurant/menu/categories" && method === "POST") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const body = await parseRequestBody(req);
        if (!body.name || !String(body.name).trim()) {
          return sendError(res, 400, "Category name is required");
        }

        try {
          const category = restaurantStore.createCategory({
            ...body,
            restaurantId
          });
          if (isPostgresConfigured()) {
            try {
              await restaurantRepository.createCategory(category);
            } catch (e) {}
          }
          return sendJson(res, 201, { success: true, category });
        } catch (err) {
          if (err.message && err.message.includes("already exists")) {
            return sendError(res, 409, err.message);
          }
          return sendError(res, 400, err.message);
        }
      }

      // 11. Menu Categories PATCH :id & DELETE :id
      const catMatch = pathname.match(/^\/api\/restaurant\/menu\/categories\/([^/]+)$/);
      if (catMatch && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const categoryId = catMatch[1];
        const existingCategory = restaurantStore.getCategoryById(restaurantId, categoryId);
        if (!existingCategory) return sendError(res, 404, "Category not found");

        const body = await parseRequestBody(req);
        try {
          const updated = restaurantStore.updateCategory(restaurantId, categoryId, body);
          if (!updated) return sendError(res, 404, "Category not found");
          return sendJson(res, 200, { success: true, category: updated });
        } catch (err) {
          if (err.message && err.message.includes("already exists")) {
            return sendError(res, 409, err.message);
          }
          return sendError(res, 400, err.message);
        }
      }

      if (catMatch && method === "DELETE") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const categoryId = catMatch[1];
        const existingCategory = restaurantStore.getCategoryById(restaurantId, categoryId);
        if (!existingCategory) return sendError(res, 404, "Category not found");

        try {
          const result = restaurantStore.deleteCategory(restaurantId, categoryId);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 12. Menu Items GET
      if (pathname === "/api/restaurant/menu/items" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const filters = {};
        const catFilter = searchParams.get("categoryId");
        const availFilter = searchParams.get("isAvailable");
        const activeFilter = searchParams.get("isActive");
        const dietaryFilter = searchParams.get("dietaryType");

        if (catFilter) filters.categoryId = catFilter;
        if (availFilter !== null) filters.isAvailable = availFilter === "true";
        if (activeFilter !== null) filters.isActive = activeFilter === "true";
        if (dietaryFilter) filters.dietaryType = dietaryFilter;

        const items = restaurantStore.getMenuItems(restaurantId, filters);
        return sendJson(res, 200, { items });
      }

      // 13. Menu Items POST
      if (pathname === "/api/restaurant/menu/items" && method === "POST") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const body = await parseRequestBody(req);
        if (!body.name || !String(body.name).trim()) {
          return sendError(res, 400, "Menu item name is required");
        }

        if (body.price === undefined || isNaN(parseFloat(body.price)) || parseFloat(body.price) < 0) {
          return sendError(res, 400, "Menu item price must be a non-negative number");
        }

        if (!body.categoryId) {
          return sendError(res, 400, "Menu item must include a valid categoryId");
        }

        const category = restaurantStore.getCategoryById(restaurantId, body.categoryId);
        if (!category) {
          return sendError(res, 400, "Category not found or does not belong to this restaurant");
        }

        if (body.dietaryType) {
          const dt = String(body.dietaryType).toUpperCase().trim();
          if (!["VEG", "NON_VEG", "VEGAN", "EGG"].includes(dt)) {
            return sendError(res, 400, `Invalid dietary type "${body.dietaryType}". Must be one of: VEG, NON_VEG, VEGAN, EGG`);
          }
        }

        try {
          const item = restaurantStore.createMenuItem({
            ...body,
            restaurantId
          });
          if (isPostgresConfigured()) {
            try {
              await restaurantRepository.createMenuItem(item);
            } catch (e) {}
          }
          return sendJson(res, 201, { success: true, item });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 14. Menu Items PATCH :id & DELETE :id
      const itemMatch = pathname.match(/^\/api\/restaurant\/menu\/items\/([^/]+)$/);
      if (itemMatch && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const itemId = itemMatch[1];
        const existingItem = restaurantStore.getMenuItemById(restaurantId, itemId);
        if (!existingItem) return sendError(res, 404, "Menu item not found");

        const body = await parseRequestBody(req);

        if (body.price !== undefined) {
          const p = parseFloat(body.price);
          if (isNaN(p) || p < 0) {
            return sendError(res, 400, "Menu item price must be a non-negative number");
          }
        }

        if (body.categoryId !== undefined) {
          const category = restaurantStore.getCategoryById(restaurantId, body.categoryId);
          if (!category) {
            return sendError(res, 400, "Category not found or does not belong to this restaurant");
          }
        }

        if (body.dietaryType !== undefined) {
          const dt = String(body.dietaryType).toUpperCase().trim();
          if (!["VEG", "NON_VEG", "VEGAN", "EGG"].includes(dt)) {
            return sendError(res, 400, `Invalid dietary type "${body.dietaryType}". Must be one of: VEG, NON_VEG, VEGAN, EGG`);
          }
        }

        try {
          const updated = restaurantStore.updateMenuItem(restaurantId, itemId, body);
          if (!updated) return sendError(res, 404, "Menu item not found");
          return sendJson(res, 200, { success: true, item: updated });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      if (itemMatch && method === "DELETE") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const itemId = itemMatch[1];
        const existingItem = restaurantStore.getMenuItemById(restaurantId, itemId);
        if (!existingItem) return sendError(res, 404, "Menu item not found");

        try {
          const deleted = restaurantStore.deleteMenuItem(restaurantId, itemId);
          return sendJson(res, 200, { success: true, item: deleted });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 15. Table QR Code GET (:id/qr)
      const tableQrMatch = pathname.match(/^\/api\/restaurant\/tables\/([^/]+)\/qr$/);
      if (tableQrMatch && method === "GET") {
        if (!requirePermission(req, res, "restaurant.tables", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const tableId = tableQrMatch[1];
        const table = restaurantStore.getTableById(restaurantId, tableId);
        if (!table) return sendError(res, 404, "Table not found");

        let qrToken = table.qrCodeToken;
        const verification = qrToken ? verifyQrToken(qrToken) : { valid: false };
        if (!verification.valid) {
          qrToken = generateQrToken(restaurantId, table.id, table.branchId);
          restaurantStore.updateTableQrToken(restaurantId, table.id, qrToken);
        }

        const host = req.headers.host || `localhost:${PORT}`;
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const orderUrl = `/order/${qrToken}`;
        const fullUrl = `${protocol}://${host}${orderUrl}`;

        return sendJson(res, 200, {
          tableId: table.id,
          tableNumber: table.tableNumber,
          tableName: table.name,
          qrToken,
          orderUrl,
          fullUrl
        });
      }

      // 16. Table QR Code Rotate POST (:id/qr/rotate)
      const tableRotateMatch = pathname.match(/^\/api\/restaurant\/tables\/([^/]+)\/qr\/rotate$/);
      if (tableRotateMatch && method === "POST") {
        if (!requirePermission(req, res, "restaurant.tables", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const tableId = tableRotateMatch[1];
        const table = restaurantStore.getTableById(restaurantId, tableId);
        if (!table) return sendError(res, 404, "Table not found");

        const newQrToken = generateQrToken(restaurantId, table.id, table.branchId);
        restaurantStore.updateTableQrToken(restaurantId, table.id, newQrToken);

        const host = req.headers.host || `localhost:${PORT}`;
        const protocol = req.headers["x-forwarded-proto"] || "http";
        const orderUrl = `/order/${newQrToken}`;
        const fullUrl = `${protocol}://${host}${orderUrl}`;

        return sendJson(res, 200, {
          success: true,
          rotated: true,
          previousTokenInvalidated: true,
          tableId: table.id,
          tableNumber: table.tableNumber,
          qrToken: newQrToken,
          orderUrl,
          fullUrl,
          message: "QR token rotated successfully. Previous QR codes for this table are now invalidated."
        });
      }

      // 17. Public Customer QR Menu GET (/api/order/menu/:qrToken)
      const publicMenuMatch = pathname.match(/^\/api\/order\/menu\/([^/]+)$/);
      if (publicMenuMatch && method === "GET") {
        const qrToken = publicMenuMatch[1];
        const tokenValidation = verifyQrToken(qrToken);

        if (!tokenValidation.valid) {
          if (tokenValidation.expired) {
            return sendError(res, 401, "QR token has expired");
          }
          return sendError(res, 401, "Invalid or tampered QR token");
        }

        const { restaurantId, tableId } = tokenValidation;

        let table = restaurantStore.getTableById(restaurantId, tableId);
        if (!table && isPostgresConfigured()) {
          try {
            table = await restaurantRepository.getTableById(restaurantId, tableId);
          } catch (e) {}
        }

        if (!table) {
          return sendError(res, 404, "Table not found");
        }

        if (!table.isActive) {
          return sendError(res, 403, "Table is currently inactive");
        }

        if (table.qrCodeToken !== qrToken) {
          return sendError(res, 401, "QR token has been rotated or invalidated");
        }

        let profile = restaurantStore.getRestaurantProfile(restaurantId);
        if (!profile && isPostgresConfigured()) {
          try {
            profile = await restaurantRepository.getRestaurantProfile(restaurantId);
          } catch (e) {}
        }

        if (!profile) {
          return sendError(res, 404, "Restaurant not found");
        }

        let branchInfo = null;
        if (table.branchId) {
          const branch = restaurantStore.getBranchById(restaurantId, table.branchId);
          if (branch) {
            branchInfo = {
              id: branch.id,
              name: branch.name,
              address: branch.address,
              city: branch.city,
              phone: branch.phone
            };
          }
        }

        const rawCategories = restaurantStore.getCategories(restaurantId);
        const categories = rawCategories
          .filter(c => c.isActive !== false)
          .map(c => ({
            id: c.id,
            name: c.name,
            description: c.description,
            displayOrder: c.displayOrder
          }));

        const rawItems = restaurantStore.getMenuItems(restaurantId, { isAvailable: true, isActive: true });
        const items = rawItems.map(i => ({
          id: i.id,
          categoryId: i.categoryId,
          name: i.name,
          description: i.description,
          price: i.price,
          currency: i.currency,
          taxRate: i.taxRate,
          dietaryType: i.dietaryType,
          imageUrl: i.imageUrl,
          displayOrder: i.displayOrder,
          customizations: i.customizations
        }));

        return sendJson(res, 200, {
          valid: true,
          restaurant: {
            id: profile.id,
            name: profile.name,
            currency: profile.currency,
            taxRate: profile.taxRate,
            operatingHours: profile.operatingHours,
            branding: profile.branding
          },
          table: {
            id: table.id,
            tableNumber: table.tableNumber,
            name: table.name,
            capacity: table.capacity
          },
          branch: branchInfo,
          categories,
          items
        });
      }

      /* ===================================================================== */
      /* RESTAURANT OS v1 - PHASE 4: CUSTOMER SESSION, CART & ORDER CREATION    */
      /* ===================================================================== */

      // 1. Customer Table Session Initialization / Resume
      const sessionTokenMatch = pathname.match(/^\/api\/order\/session\/([^\/]+)$/);
      if (method === "POST" && sessionTokenMatch) {
        const qrToken = decodeURIComponent(sessionTokenMatch[1]);
        const verified = verifyQrToken(qrToken);
        if (!verified.valid) {
          return sendError(res, 401, verified.error || "Invalid or expired QR token");
        }

        const body = await parseRequestBody(req).catch(() => ({}));
        const restaurantId = verified.restaurantId;
        const tableId = verified.tableId;

        const profile = restaurantStore.getRestaurantProfile(restaurantId);
        const table = restaurantStore.getTableById(restaurantId, tableId);

        if (!profile) {
          return sendError(res, 404, "Restaurant not found");
        }
        if (!table || table.isActive === false) {
          return sendError(res, 400, "Table is inactive or not found");
        }

        let session = restaurantStore.getActiveSessionForTable(restaurantId, tableId);
        if (!session && isPostgresConfigured()) {
          try {
            session = await restaurantRepository.getActiveSessionForTable(restaurantId, tableId);
          } catch (e) {
            console.warn("[getActiveSessionForTable PG lookup]", e.message);
          }
        }

        if (!session) {
          session = restaurantStore.createTableSession({
            restaurantId,
            branchId: table.branchId || verified.branchId,
            tableId,
            guestCount: body.guestCount || 1,
            customerName: body.customerName || null
          });
        }

        const sessionToken = generateCustomerSessionToken(
          restaurantId,
          tableId,
          table.branchId || verified.branchId,
          session.id
        );

        const branch = table.branchId ? restaurantStore.getBranchById(restaurantId, table.branchId) : null;
        const branchInfo = branch
          ? { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone }
          : null;

        return sendJson(res, 200, {
          success: true,
          sessionId: session.id,
          sessionToken,
          sessionCode: session.sessionCode,
          restaurant: {
            id: profile.id,
            name: profile.name,
            currency: profile.currency,
            taxRate: profile.taxRate
          },
          table: {
            id: table.id,
            tableNumber: table.tableNumber,
            name: table.name,
            capacity: table.capacity
          },
          branch: branchInfo
        });
      }

      // 2. Customer Cart: View Active Cart
      if (method === "GET" && pathname === "/api/order/cart") {
        const authRes = await resolveCustomerSession(req);
        if (authRes.error) {
          return sendError(res, authRes.status, authRes.error);
        }
        const session = authRes.session;
        const items = restaurantStore.getCartItems(session.id);
        const profile = restaurantStore.getRestaurantProfile(session.restaurantId);
        const taxRate = profile && profile.taxRate !== undefined ? profile.taxRate : 5.0;

        const subtotal = Math.round(items.reduce((acc, it) => acc + (it.lineTotal !== undefined ? it.lineTotal : (it.price * it.quantity)), 0) * 100) / 100;
        const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
        const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

        return sendJson(res, 200, {
          success: true,
          sessionId: session.id,
          items,
          itemCount: items.reduce((acc, it) => acc + it.quantity, 0),
          subtotal,
          taxRate,
          taxAmount,
          totalAmount
        });
      }

      // 3. Customer Cart: Add Item to Cart
      if (method === "POST" && pathname === "/api/order/cart/items") {
        const authRes = await resolveCustomerSession(req);
        if (authRes.error) {
          return sendError(res, authRes.status, authRes.error);
        }
        const session = authRes.session;
        const body = await parseRequestBody(req).catch(() => ({}));

        const { menuItemId, quantity = 1, customizations, notes } = body;
        const qty = parseInt(quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          return sendError(res, 400, "Quantity must be a positive integer.");
        }

        if (!menuItemId) {
          return sendError(res, 400, "menuItemId is required.");
        }

        const menuItem = restaurantStore.getMenuItemById(session.restaurantId, menuItemId);
        if (!menuItem) {
          return sendError(res, 404, "Menu item not found or does not belong to this restaurant.");
        }

        if (menuItem.isActive === false) {
          return sendError(res, 400, `Menu item "${menuItem.name}" is no longer active.`);
        }

        if (menuItem.isAvailable === false) {
          return sendError(res, 400, `Menu item "${menuItem.name}" is currently unavailable.`);
        }

        try {
          const cartItem = restaurantStore.addToCart(session, menuItemId, qty, { customizations, notes });
          return sendJson(res, 201, {
            success: true,
            item: cartItem
          });
        } catch (err) {
          return sendError(res, 400, err.message);
        }
      }

      // 4. Customer Cart: Update Item Quantity or Remove Item
      const cartItemMatch = pathname.match(/^\/api\/order\/cart\/items\/([^\/]+)$/);
      if (cartItemMatch) {
        const cartItemId = decodeURIComponent(cartItemMatch[1]);
        const authRes = await resolveCustomerSession(req);
        if (authRes.error) {
          return sendError(res, authRes.status, authRes.error);
        }
        const session = authRes.session;

        const existing = restaurantStore.getCartItemById(cartItemId);
        if (!existing || existing.tableSessionId !== session.id) {
          return sendError(res, 404, "Cart item not found in this session.");
        }

        if (method === "PATCH") {
          const body = await parseRequestBody(req).catch(() => ({}));
          const qty = parseInt(body.quantity, 10);
          if (isNaN(qty) || qty <= 0) {
            return sendError(res, 400, "Quantity must be an integer greater than 0.");
          }

          const updated = restaurantStore.updateCartItemQuantity(session.id, cartItemId, qty);
          return sendJson(res, 200, {
            success: true,
            item: updated
          });
        }

        if (method === "DELETE") {
          restaurantStore.removeCartItem(session.id, cartItemId);
          return sendJson(res, 200, {
            success: true,
            message: "Item removed from cart."
          });
        }
      }

      // 5. Customer Order Placement (Atomic, Price Snapshot, Double-Submission Protected)
      if (method === "POST" && pathname === "/api/order/place") {
        const authRes = await resolveCustomerSession(req);
        if (authRes.error) {
          return sendError(res, authRes.status, authRes.error);
        }
        const session = authRes.session;
        const body = await parseRequestBody(req).catch(() => ({}));

        const idempotencyKey = req.headers["idempotency-key"] || body.idempotencyKey;
        const idempotencyCacheKey = idempotencyKey ? `${session.id}:${idempotencyKey}` : null;

        if (idempotencyCacheKey && orderIdempotencyCache.has(idempotencyCacheKey)) {
          const cached = orderIdempotencyCache.get(idempotencyCacheKey);
          return sendJson(res, 200, {
            success: true,
            order: cached,
            idempotentReplay: true
          });
        }

        if (inFlightOrderSessions.has(session.id)) {
          return sendError(res, 409, "An order is already being processed for this table session.");
        }
        inFlightOrderSessions.add(session.id);

        try {
          const cartItems = restaurantStore.getCartItems(session.id);
          if (!cartItems || cartItems.length === 0) {
            return sendError(res, 400, "Cart is empty. Add items before placing an order.");
          }

          const profile = restaurantStore.getRestaurantProfile(session.restaurantId);
          const taxRate = profile && profile.taxRate !== undefined ? profile.taxRate : 5.0;

          const orderItems = [];
          let subtotal = 0;

          for (const ci of cartItems) {
            const menuItem = restaurantStore.getMenuItemById(session.restaurantId, ci.menuItemId);
            if (!menuItem) {
              return sendError(res, 400, `Item "${ci.itemName}" is no longer in the menu.`);
            }
            if (menuItem.isActive === false) {
              return sendError(res, 400, `Item "${menuItem.name}" is no longer active.`);
            }
            if (menuItem.isAvailable === false) {
              return sendError(res, 400, `Item "${menuItem.name}" is currently unavailable.`);
            }

            const unitPrice = parseFloat(menuItem.price);
            const qty = parseInt(ci.quantity, 10) || 1;
            const lineSubtotal = Math.round(unitPrice * qty * 100) / 100;
            subtotal += lineSubtotal;

            orderItems.push({
              id: `oi-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
              menuItemId: menuItem.id,
              itemName: menuItem.name,
              quantity: qty,
              unitPrice,
              taxRate: menuItem.taxRate !== undefined ? menuItem.taxRate : taxRate,
              subtotal: lineSubtotal,
              notes: ci.notes || null
            });
          }

          subtotal = Math.round(subtotal * 100) / 100;
          const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
          const discountAmount = 0;
          const totalAmount = Math.round((subtotal + taxAmount - discountAmount) * 100) / 100;

          const orderData = {
            id: `ord-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
            restaurantId: session.restaurantId,
            branchId: session.branchId || null,
            tableId: session.tableId,
            tableSessionId: session.id,
            orderNumber: `ORD-${Date.now().toString().slice(-4)}`,
            status: "NEW",
            subtotal,
            taxAmount,
            discountAmount,
            totalAmount,
            notes: body.notes || null
          };

          const createdOrder = await restaurantStore.placeOrder(orderData, orderItems, session.id);

          if (idempotencyCacheKey) {
            orderIdempotencyCache.set(idempotencyCacheKey, createdOrder);
            setTimeout(() => orderIdempotencyCache.delete(idempotencyCacheKey), 10 * 60 * 1000);
          }

          return sendJson(res, 201, {
            success: true,
            order: createdOrder
          });
        } finally {
          inFlightOrderSessions.delete(session.id);
        }
      }

      // 6. Customer Order Status & Order History
      const orderStatusMatch = pathname.match(/^\/api\/order\/status\/([^\/]+)$/);
      if (method === "GET" && orderStatusMatch) {
        const authRes = await resolveCustomerSession(req);
        if (authRes.error) {
          return sendError(res, authRes.status, authRes.error);
        }
        const session = authRes.session;
        const orderId = decodeURIComponent(orderStatusMatch[1]);

        let order = restaurantStore.getOrder(orderId);
        if (!order && isPostgresConfigured()) {
          try {
            order = await restaurantRepository.getOrderById(orderId);
          } catch (e) {
            console.warn("[getOrderById PG lookup]", e.message);
          }
        }

        if (!order) {
          return sendError(res, 404, "Order not found");
        }

        if (order.tableSessionId !== session.id || order.restaurantId !== session.restaurantId) {
          return sendError(res, 403, "Access denied to this order.");
        }

        return sendJson(res, 200, {
          success: true,
          order
        });
      }

      if (method === "GET" && (pathname === "/api/order/orders" || pathname === "/api/order/session/orders")) {
        const authRes = await resolveCustomerSession(req);
        if (authRes.error) {
          return sendError(res, authRes.status, authRes.error);
        }
        const session = authRes.session;
        const orders = restaurantStore.getOrdersBySession(session.id);
        return sendJson(res, 200, {
          success: true,
          orders
        });
      }

      /* ===================================================================== */
      /* RESTAURANT OS v1 - PHASE 5: KITCHEN DISPLAY & ORDER MANAGEMENT        */
      /* ===================================================================== */

      // 1. Kitchen Display Orders Queue GET
      if (pathname === "/api/restaurant/orders/kitchen" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const filters = {};
        const statusFilter = searchParams.get("status");
        const branchFilter = searchParams.get("branchId");
        const tableFilter = searchParams.get("tableId");

        if (statusFilter) {
          if (statusFilter.includes(",")) {
            filters.status = statusFilter.split(",").map(s => s.trim().toUpperCase());
          } else {
            filters.status = statusFilter.trim().toUpperCase();
          }
        }
        if (branchFilter) filters.branchId = branchFilter;
        if (tableFilter) filters.tableId = tableFilter;

        try {
          const orders = await restaurantStore.getKitchenOrders(restaurantId, filters);
          return sendJson(res, 200, { success: true, orders });
        } catch (err) {
          console.error("[Kitchen Orders GET Error]", err);
          return sendError(res, 500, err.message || "Failed to fetch kitchen orders");
        }
      }

      // 2. Kitchen / Staff Single Order Detail GET
      const restaurantOrderMatch = pathname.match(/^\/api\/restaurant\/orders\/([^/]+)$/);
      if (restaurantOrderMatch && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const orderId = restaurantOrderMatch[1];
        try {
          const order = await restaurantStore.getRestaurantOrderById(restaurantId, orderId);
          if (!order) {
            return sendError(res, 404, "Order not found");
          }
          return sendJson(res, 200, { success: true, order });
        } catch (err) {
          console.error("[Restaurant Order GET Error]", err);
          return sendError(res, 500, err.message || "Failed to fetch order");
        }
      }

      // 3. Staff Order Status Update PATCH
      const restaurantOrderStatusMatch = pathname.match(/^\/api\/restaurant\/orders\/([^/]+)\/status$/);
      if (restaurantOrderStatusMatch && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const orderId = restaurantOrderStatusMatch[1];
        const body = await parseRequestBody(req).catch(() => ({}));

        if (!body.status) {
          return sendError(res, 400, "Status is required");
        }

        const newStatus = String(body.status).toUpperCase().trim();
        const currentExpectedStatus = body.currentStatus ? String(body.currentStatus).toUpperCase().trim() : null;
        const cancelReason = body.cancelReason || null;

        try {
          const result = await restaurantStore.updateOrderStatus(
            restaurantId,
            orderId,
            newStatus,
            currentExpectedStatus,
            cancelReason
          );

          if (!result) {
            return sendError(res, 404, "Order not found");
          }

          if (result.notFound) {
            return sendError(res, 404, result.message || "Order not found");
          }

          if (result.conflict) {
            return sendJson(res, 409, {
              error: result.message || "Order status has changed. Please refresh and try again.",
              currentStatus: result.currentStatus
            });
          }

          if (result.invalidStatus || result.invalidTransition) {
            return sendError(res, 400, result.message || "Invalid status transition");
          }

          // Audit log the status transition
          try {
            securityAuditStore.logSecurityEvent({
              type: "ORDER_STATUS_CHANGED",
              userId: req.user.id || req.user.username,
              ip: getClientIp(req),
              details: {
                restaurantId,
                orderId,
                orderNumber: result.order ? result.order.orderNumber : null,
                fromStatus: result.previousStatus,
                toStatus: result.order ? result.order.status : newStatus,
                changedBy: req.user.username || req.user.id,
                cancelReason
              }
            });
          } catch (auditErr) {
            console.warn("[SecurityAudit Log Warning]", auditErr.message);
          }

          return sendJson(res, 200, {
            success: true,
            order: result.order,
            previousStatus: result.previousStatus
          });
        } catch (err) {
          console.error("[Restaurant Order Status PATCH Error]", err);
          return sendError(res, 500, err.message || "Failed to update order status");
        }
      }

      // =======================================================================
      // PHASE 6: RESTAURANT BILLING & PAYMENTS
      // =======================================================================

      // 1. Billing Settings GET & PATCH
      if (pathname === "/api/restaurant/billing/settings") {
        if (!requirePermission(req, res, method === "GET" ? "restaurant.read" : "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        if (method === "GET") {
          try {
            const settings = await restaurantStore.getBillingSettings(restaurantId);
            return sendJson(res, 200, { success: true, settings });
          } catch (err) {
            console.error("[Restaurant Billing Settings GET Error]", err);
            return sendError(res, 500, err.message || "Failed to fetch billing settings");
          }
        }

        if (method === "PATCH") {
          const body = await parseRequestBody(req).catch(() => ({}));
          try {
            const previous = await restaurantStore.getBillingSettings(restaurantId);
            const updated = await restaurantStore.updateBillingSettings(restaurantId, body);

            // Audit log the setting change
            try {
              securityAuditStore.logSecurityEvent({
                type: "BILLING_SETTING_CHANGED",
                userId: req.user.id || req.user.username,
                ip: getClientIp(req),
                details: {
                  restaurantId,
                  changedBy: req.user.username || req.user.id,
                  previous,
                  updated
                }
              });
            } catch (auditErr) {
              console.warn("[SecurityAudit Log Warning]", auditErr.message);
            }

            return sendJson(res, 200, { success: true, settings: updated });
          } catch (err) {
            console.error("[Restaurant Billing Settings PATCH Error]", err);
            return sendError(res, 400, err.message || "Failed to update billing settings");
          }
        }
      }

      // Helper guard for all transactional billing endpoints
      const checkBillingFeatureEnabled = async (rId) => {
        const s = await restaurantStore.getBillingSettings(rId);
        return Boolean(s && s.billingEnabled);
      };

      // 2. Generate Bill for an Order POST /api/restaurant/billing/orders/:orderId/bill
      const generateBillMatch = pathname.match(/^\/api\/restaurant\/billing\/orders\/([^/]+)\/bill$/);
      if (generateBillMatch && method === "POST") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const enabled = await checkBillingFeatureEnabled(restaurantId);
        if (!enabled) {
          return sendJson(res, 403, {
            error: "Billing & Payments module is disabled for this restaurant.",
            code: "BILLING_DISABLED",
            billingEnabled: false
          });
        }

        const orderId = generateBillMatch[1];
        const body = await parseRequestBody(req).catch(() => ({}));

        try {
          const result = await restaurantStore.createBillForOrder(restaurantId, orderId, body);
          if (!result) {
            return sendError(res, 500, "Failed to create bill");
          }

          if (result.notFound) {
            return sendError(res, 404, result.message || "Order not found");
          }

          if (result.ineligible) {
            return sendError(res, 400, result.message || "Order is ineligible for billing");
          }

          if (result.noItems) {
            return sendError(res, 400, result.message || "Order has no items");
          }

          if (result.alreadyExisted) {
            return sendJson(res, 200, {
              success: true,
              alreadyExisted: true,
              bill: result.bill
            });
          }

          // Audit log bill creation
          try {
            securityAuditStore.logSecurityEvent({
              type: "BILL_CREATED",
              userId: req.user.id || req.user.username,
              ip: getClientIp(req),
              details: {
                restaurantId,
                billId: result.bill.id,
                billNumber: result.bill.billNumber,
                orderId,
                grandTotal: result.bill.totalAmount,
                createdBy: req.user.username || req.user.id
              }
            });
          } catch (auditErr) {
            console.warn("[SecurityAudit Log Warning]", auditErr.message);
          }

          return sendJson(res, 201, {
            success: true,
            bill: result.bill
          });
        } catch (err) {
          console.error("[Restaurant Create Bill Error]", err);
          return sendError(res, 500, err.message || "Failed to create bill");
        }
      }

      // 3. Record Payment for Bill PATCH /api/restaurant/billing/:id/payment
      const billPaymentMatch = pathname.match(/^\/api\/restaurant\/billing\/([^/]+)\/payment$/);
      if (billPaymentMatch && method === "PATCH") {
        if (!requirePermission(req, res, "restaurant.write", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const enabled = await checkBillingFeatureEnabled(restaurantId);
        if (!enabled) {
          return sendJson(res, 403, {
            error: "Billing & Payments module is disabled for this restaurant.",
            code: "BILLING_DISABLED",
            billingEnabled: false
          });
        }

        const billId = billPaymentMatch[1];
        const body = await parseRequestBody(req).catch(() => ({}));

        try {
          const result = await restaurantStore.recordBillPayment(restaurantId, billId, {
            ...body,
            settledBy: req.user.username || req.user.id
          });

          if (!result) {
            return sendError(res, 404, "Bill not found");
          }

          if (result.notFound) {
            return sendError(res, 404, result.message || "Bill not found");
          }

          if (result.invalidStatus || result.invalidMethod || result.invalidTransition) {
            return sendError(res, 400, result.message || "Invalid payment modification");
          }

          // Audit log payment recording
          try {
            const auditType = result.bill.paymentStatus === "VOID" 
              ? "BILL_VOIDED" 
              : (result.bill.paymentStatus === "REFUNDED" ? "BILL_REFUNDED" : "PAYMENT_RECORDED");
            securityAuditStore.logSecurityEvent({
              type: auditType,
              userId: req.user.id || req.user.username,
              ip: getClientIp(req),
              details: {
                restaurantId,
                billId,
                billNumber: result.bill.billNumber,
                paymentStatus: result.bill.paymentStatus,
                paymentMethod: result.bill.paymentMethod,
                previousStatus: result.previousStatus,
                recordedBy: req.user.username || req.user.id
              }
            });
          } catch (auditErr) {
            console.warn("[SecurityAudit Log Warning]", auditErr.message);
          }

          return sendJson(res, 200, {
            success: true,
            bill: result.bill,
            previousStatus: result.previousStatus
          });
        } catch (err) {
          console.error("[Restaurant Bill Payment Error]", err);
          return sendError(res, 500, err.message || "Failed to record payment");
        }
      }

      // 4. Receipt Printable View GET /api/restaurant/billing/:id/receipt
      const billReceiptMatch = pathname.match(/^\/api\/restaurant\/billing\/([^/]+)\/receipt$/);
      if (billReceiptMatch && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const enabled = await checkBillingFeatureEnabled(restaurantId);
        if (!enabled) {
          return sendJson(res, 403, {
            error: "Billing & Payments module is disabled for this restaurant.",
            code: "BILLING_DISABLED",
            billingEnabled: false
          });
        }

        const billId = billReceiptMatch[1];
        try {
          const bill = await restaurantStore.getRestaurantBillById(restaurantId, billId);
          if (!bill) {
            return sendError(res, 404, "Bill not found");
          }
          const profile = await restaurantStore.getRestaurantProfile(restaurantId);

          const receipt = {
            restaurant: {
              name: (profile && profile.name) || "Restaurant",
              company: (profile && profile.company) || null,
              phone: (profile && profile.phone) || null,
              email: (profile && profile.email) || null,
              gstNumber: (profile && profile.gstNumber) || null
            },
            billNumber: bill.billNumber,
            orderNumber: bill.orderNumber || null,
            tableNumber: bill.tableNumber || null,
            tableName: bill.tableName || null,
            createdAt: bill.createdAt,
            paidAt: bill.paidAt || bill.settledAt,
            paymentStatus: bill.paymentStatus,
            paymentMethod: bill.paymentMethod,
            paymentRef: bill.paymentRef,
            items: (bill.items || []).map(it => ({
              itemName: it.itemName,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              subtotal: it.subtotal,
              dietaryType: it.dietaryType
            })),
            financials: {
              subtotal: bill.subtotal,
              discount: bill.discountAmount,
              tax: bill.taxAmount,
              serviceCharge: bill.serviceCharge,
              grandTotal: bill.totalAmount
            }
          };

          return sendJson(res, 200, { success: true, receipt, bill });
        } catch (err) {
          console.error("[Restaurant Receipt GET Error]", err);
          return sendError(res, 500, err.message || "Failed to fetch receipt");
        }
      }

      // 5. Single Bill Detail GET /api/restaurant/billing/:id
      const billDetailMatch = pathname.match(/^\/api\/restaurant\/billing\/([^/]+)$/);
      if (billDetailMatch && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const enabled = await checkBillingFeatureEnabled(restaurantId);
        if (!enabled) {
          return sendJson(res, 403, {
            error: "Billing & Payments module is disabled for this restaurant.",
            code: "BILLING_DISABLED",
            billingEnabled: false
          });
        }

        const billId = billDetailMatch[1];
        try {
          const bill = await restaurantStore.getRestaurantBillById(restaurantId, billId);
          if (!bill) {
            return sendError(res, 404, "Bill not found");
          }
          return sendJson(res, 200, { success: true, bill });
        } catch (err) {
          console.error("[Restaurant Bill GET Error]", err);
          return sendError(res, 500, err.message || "Failed to fetch bill");
        }
      }

      // 6. Bills List GET /api/restaurant/billing
      if (pathname === "/api/restaurant/billing" && method === "GET") {
        if (!requirePermission(req, res, "restaurant.read", sendJson)) return;
        const restaurantId = req.user.restaurantId;
        if (!restaurantId) return sendError(res, 400, "No restaurant context associated with current user");

        const enabled = await checkBillingFeatureEnabled(restaurantId);
        if (!enabled) {
          return sendJson(res, 403, {
            error: "Billing & Payments module is disabled for this restaurant.",
            code: "BILLING_DISABLED",
            billingEnabled: false
          });
        }

        const filters = {
          paymentStatus: searchParams.get("paymentStatus") || searchParams.get("status") || null,
          paymentMethod: searchParams.get("paymentMethod") || null,
          orderId: searchParams.get("orderId") || null,
          tableId: searchParams.get("tableId") || null
        };

        try {
          const bills = await restaurantStore.getBills(restaurantId, filters);
          return sendJson(res, 200, { success: true, bills });
        } catch (err) {
          console.error("[Restaurant Bills List GET Error]", err);
          return sendError(res, 500, err.message || "Failed to fetch bills");
        }
      }

      return sendError(res, 404, "Endpoint not found");
    } catch (err) {
      console.error("API Error:", err);
      return sendError(res, 500, "Internal server error");
    }
  }

  // Static files or SPA fallback
  serveStatic(req, res, pathname);
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AI Business Agent Dashboard Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"} | Database Provider: ${process.env.DATABASE_PROVIDER || "json"}`);
  });

  const handleShutdown = (signal) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);
    server.close(async () => {
      try {
        const { closePool } = require("./memory/db");
        await closePool();
        console.log("Database connection pool closed.");
      } catch (err) {
        console.error("Error closing database pool:", err.message);
      }
      console.log("AI Business Agent Server stopped cleanly.");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}

// Global process error safety
process.on("unhandledRejection", (reason) => {
  console.error("[Unhandled Rejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Uncaught Exception]", err);
});

module.exports = server;
