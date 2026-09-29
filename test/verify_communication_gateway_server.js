require("dotenv").config();
const http = require("http");
const assert = require("assert");

// Import server & memory stores
const server = require("../server");
const communicationStore = require("../memory/communicationStore");
const communicationEventsStore = require("../memory/communicationEventsStore");
const leadStore = require("../memory/leadStore");
const crmStore = require("../memory/crmStore");
const userStore = require("../memory/userStore");
const sessionManager = require("../security/session");

function doRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on("error", reject);

    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function verifyCommunicationGatewayServer() {
  console.log("Starting Level 3 Communication Gateway Server verification...");
  const PORT = 3098;

  await new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  try {
    // Clean state
    communicationStore.clearCommunicationStore();
    communicationEventsStore.clearCommunicationEvents();
    leadStore.clearLeads();
    crmStore.clearCRM();

    // 1. Authenticate as Admin
    const loginRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, { email: "admin@localhost", password: "localdevadmin123" });

    assert.strictEqual(loginRes.statusCode, 200, "Admin login should succeed");
    const cookieHeader = loginRes.headers["set-cookie"];
    assert(cookieHeader, "Session cookie must be returned");
    const sessionCookie = cookieHeader[0].split(";")[0];
    const authHeaders = {
      "Cookie": sessionCookie,
      "Content-Type": "application/json"
    };
    console.log("✔ Admin logged in successfully");

    // 2. GET /api/communication/events (Protected)
    const eventsRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/events",
      method: "GET",
      headers: authHeaders
    });
    assert.strictEqual(eventsRes.statusCode, 200);
    assert.strictEqual(eventsRes.data.success, true);
    assert(Array.isArray(eventsRes.data.events));
    console.log("✔ GET /api/communication/events returned 200");

    // 3. Create Lead and Prepare Draft
    const testLead = leadStore.createLeadRecord({
      companyName: "Gateway Trattoria",
      industry: "Restaurant",
      contactName: "Luigi Gateway",
      email: "luigi.gateway@example.com",
      phone: "312-555-7788",
      potentialNeed: "Automated WhatsApp Reservations",
      qualificationStatus: "QUALIFIED",
      pipelineStatus: "NOT_CONTACTED"
    });
    leadStore.addLead(testLead);

    const draft = communicationStore.prepareDraftForLead(testLead.id, "INITIAL_OUTREACH", "EMAIL");
    const msgId = draft.message.id;
    console.log(`✔ Draft prepared for lead: ${msgId}`);

    // 4. POST /api/communication/send on unapproved message -> 400
    const unapprovedSend = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/send",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId });
    assert.strictEqual(unapprovedSend.statusCode, 400, "Unapproved message must be rejected");
    assert(unapprovedSend.data.error.includes("Approval Required") || unapprovedSend.data.error.includes("APPROVED"));
    console.log("✔ POST /api/communication/send rejected unapproved message (400)");

    // 5. Approve draft and send via POST /api/communication/send -> 200
    communicationStore.markMessageApproved(msgId);
    const approvedSend = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/send",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId });
    assert.strictEqual(approvedSend.statusCode, 200, "Approved message send must succeed");
    assert.strictEqual(approvedSend.data.success, true);
    assert.strictEqual(approvedSend.data.message.status, "SENT");
    assert.strictEqual(approvedSend.data.message.provider, "local");
    console.log("✔ POST /api/communication/send successfully dispatched message via Local Simulator");

    // 6. GET /api/communication/messages/:id/status
    const statusRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: `/api/communication/messages/${msgId}/status`,
      method: "GET",
      headers: authHeaders
    });
    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.data.success, true);
    assert.strictEqual(statusRes.data.message.status, "SENT");
    assert(statusRes.data.events.length > 0);
    assert(statusRes.data.activities.length > 0);
    console.log("✔ GET /api/communication/messages/:id/status returned full timeline");

    // 7. POST /api/communication/simulate (DELIVERED)
    const simDelivered = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/simulate",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId, type: "DELIVERED" });
    assert.strictEqual(simDelivered.statusCode, 200);
    assert.strictEqual(simDelivered.data.message.status, "DELIVERED");
    console.log("✔ POST /api/communication/simulate (DELIVERED) succeeded");

    // 8. POST /api/communication/simulate (READ)
    const simRead = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/simulate",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId, type: "READ" });
    assert.strictEqual(simRead.statusCode, 200);
    assert.strictEqual(simRead.data.message.status, "READ");
    console.log("✔ POST /api/communication/simulate (READ) succeeded");

    // 9. POST /api/communication/simulate (REPLIED with customer text)
    const replyText = "We are interested in a demo this coming Friday.";
    const simReplied = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/simulate",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId, type: "REPLIED", replyText });
    assert.strictEqual(simReplied.statusCode, 200);
    assert.strictEqual(simReplied.data.message.status, "REPLIED");
    assert.strictEqual(simReplied.data.message.inboundReplies.length, 1);
    assert.strictEqual(simReplied.data.message.inboundReplies[0].text, replyText);
    console.log("✔ POST /api/communication/simulate (REPLIED) recorded customer text as evidence");

    // 10. POST /api/communication/webhook/local (Webhook endpoint - no session cookie required!)
    const draft2 = communicationStore.prepareDraftForLead(testLead.id, "FOLLOW_UP", "EMAIL");
    communicationStore.markMessageApproved(draft2.message.id);
    await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/send",
      method: "POST",
      headers: authHeaders
    }, { messageId: draft2.message.id });

    // Webhook delivered event on SENT message
    const webhookRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/local",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      eventId: "wh_live_test_999",
      messageId: draft2.message.id,
      type: "DELIVERED",
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(webhookRes.statusCode, 200);
    assert.strictEqual(webhookRes.data.success, true);
    assert.strictEqual(webhookRes.data.duplicate, false);

    // Duplicate webhook with same eventId -> duplicate: true
    const dupWebhookRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/local",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      eventId: "wh_live_test_999",
      messageId: draft2.message.id,
      type: "DELIVERED",
      timestamp: new Date().toISOString()
    });
    assert.strictEqual(dupWebhookRes.statusCode, 200);
    assert.strictEqual(dupWebhookRes.data.duplicate, true);
    console.log("✔ POST /api/communication/webhook/local processed webhook & enforced idempotency without session cookie");

    let viewerUser = userStore.getUserByEmail("viewer@company.local");
    if (!viewerUser) {
      viewerUser = userStore.createUser({
        email: "viewer@company.local",
        password: "ViewerPassword123!",
        name: "Viewer Staff",
        role: "VIEWER"
      });
    }
    const viewerSession = sessionManager.createSession(viewerUser);
    const viewerHeaders = {
      "Cookie": `ai_biz_session=${viewerSession.token}`,
      "Content-Type": "application/json"
    };

    const viewerSend = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/send",
      method: "POST",
      headers: viewerHeaders
    }, { messageId: msgId });
    assert.strictEqual(viewerSend.statusCode, 403, "Viewer role must be denied 403 Forbidden");
    assert(viewerSend.data.error.includes("Forbidden") || viewerSend.data.error.includes("Permission denied"));
    console.log("✔ RBAC enforced: VIEWER role denied communication.send permission (403)");

    console.log("\n=========================================");
    console.log("COMMUNICATION GATEWAY SERVER VERIFIED 100%!");
    console.log("=========================================\n");
  } finally {
    server.close();
  }
}

verifyCommunicationGatewayServer().catch(err => {
  console.error("Communication gateway server verification failed:", err);
  process.exit(1);
});
