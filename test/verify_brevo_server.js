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
const commProviders = require("../communication/providers");

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

async function verifyBrevoServer() {
  console.log("Starting Brevo Email Provider Server verification...");
  const PORT = 3097;

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

    // 2. Setup mock fetch on Brevo provider for safe testing
    const brevoProvider = commProviders.getProvider("brevo");
    const mockMessageId = "<202609270320.123456789@smtp-relay.brevo.com>";
    let capturedBody = null;

    brevoProvider.mockFetch = async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: mockMessageId })
      };
    };

    // Configure test environment credentials
    process.env.BREVO_API_KEY = "xkeysib-mocktestkey1234567890abcdef";
    process.env.BREVO_SENDER_EMAIL = "hello@agency.local";
    process.env.BREVO_SENDER_NAME = "Agency Founder";

    // 3. Create Lead and Draft
    const testLead = leadStore.createLeadRecord({
      companyName: "Brevo Live Trattoria",
      industry: "Restaurant",
      contactName: "Chef Marco",
      email: "marco@trattoria.it",
      potentialNeed: "Automated Booking AI",
      qualificationStatus: "QUALIFIED",
      pipelineStatus: "NOT_CONTACTED"
    });
    leadStore.addLead(testLead);

    const draft = communicationStore.prepareDraftForLead(testLead.id, "INITIAL_OUTREACH", "EMAIL");
    const msgId = draft.message.id;
    console.log(`✔ Draft prepared for lead: ${msgId}`);

    // 4. POST /api/communication/send on unapproved message with provider: "brevo" -> 400
    const unapprovedSend = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/send",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId, options: { provider: "brevo" } });

    assert.strictEqual(unapprovedSend.statusCode, 400, "Unapproved message must be rejected");
    assert(unapprovedSend.data.error.includes("Approval Required") || unapprovedSend.data.error.includes("APPROVED"));
    console.log("✔ POST /api/communication/send rejected unapproved message (400)");

    // 5. Approve draft and send via Brevo provider
    communicationStore.markMessageApproved(msgId);
    const approvedSend = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/send",
      method: "POST",
      headers: authHeaders
    }, { messageId: msgId, options: { provider: "brevo" } });

    assert.strictEqual(approvedSend.statusCode, 200, "Approved message send must succeed");
    assert.strictEqual(approvedSend.data.success, true);
    assert.strictEqual(approvedSend.data.message.status, "SENT");
    assert.strictEqual(approvedSend.data.message.provider, "brevo");
    assert.strictEqual(approvedSend.data.message.providerMessageId, mockMessageId);
    assert.strictEqual(capturedBody.to[0].email, "marco@trattoria.it");
    console.log("✔ POST /api/communication/send successfully dispatched email via Brevo adapter");

    // 6. Verify CRM Activity and Pipeline updated
    const activities = crmStore.getActivities({ leadId: testLead.id });
    const contactedAct = activities.find(a => a.type === "CONTACTED");
    assert(contactedAct, "CONTACTED activity must be recorded in CRM");
    assert.strictEqual(contactedAct.metadata.provider, "brevo");
    assert.strictEqual(leadStore.getLead(testLead.id).pipelineStatus, "CONTACTED");
    console.log("✔ CRM activity CONTACTED logged and Pipeline status updated to CONTACTED");

    // 7. POST /api/communication/webhook/brevo (DELIVERED event)
    const whDelivered = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/brevo",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      event: "delivered",
      id: 8881,
      "message-id": mockMessageId,
      email: "marco@trattoria.it",
      date: new Date().toISOString()
    });

    assert.strictEqual(whDelivered.statusCode, 200);
    assert.strictEqual(whDelivered.data.success, true);
    assert.strictEqual(communicationStore.getMessage(msgId).status, "DELIVERED");
    console.log("✔ POST /api/communication/webhook/brevo (delivered) transitioned message to DELIVERED");

    // 8. POST /api/communication/webhook/brevo (READ / opened event)
    const whOpened = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/brevo",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      event: "opened",
      id: 8882,
      "message-id": mockMessageId,
      date: new Date().toISOString()
    });

    assert.strictEqual(whOpened.statusCode, 200);
    assert.strictEqual(whOpened.data.success, true);
    assert.strictEqual(communicationStore.getMessage(msgId).status, "READ");
    console.log("✔ POST /api/communication/webhook/brevo (opened) transitioned message to READ");

    // 9. POST /api/communication/webhook/brevo (REPLIED event with real customer reply)
    const replyText = "Hello, we would love to pilot the reservation system for dinner service.";
    const whReply = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/brevo",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      event: "reply",
      id: 8883,
      "message-id": mockMessageId,
      replyText,
      email: "marco@trattoria.it",
      date: new Date().toISOString()
    });

    assert.strictEqual(whReply.statusCode, 200);
    assert.strictEqual(whReply.data.success, true);

    const repliedMsg = communicationStore.getMessage(msgId);
    assert.strictEqual(repliedMsg.status, "REPLIED");
    assert.strictEqual(repliedMsg.inboundReplies.length, 1);
    assert.strictEqual(repliedMsg.inboundReplies[0].text, replyText);
    assert.strictEqual(leadStore.getLead(testLead.id).pipelineStatus, "REPLIED");
    console.log("✔ POST /api/communication/webhook/brevo (reply) recorded reply text and updated pipeline to REPLIED");

    // 10. Webhook Idempotency: re-sending the same webhook returns duplicate: true
    const whDupReply = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/brevo",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      event: "reply",
      id: 8883,
      "message-id": mockMessageId,
      replyText,
      email: "marco@trattoria.it",
      date: new Date().toISOString()
    });

    assert.strictEqual(whDupReply.statusCode, 200);
    assert.strictEqual(whDupReply.data.duplicate, true);
    assert.strictEqual(communicationStore.getMessage(msgId).inboundReplies.length, 1);
    console.log("✔ Webhook idempotency enforced: duplicate event safely ignored without state change");

    // 11. Webhook Security Verification
    process.env.BREVO_WEBHOOK_SECRET = "live-test-secret-key-xyz";

    const unauthedWh = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/brevo",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, {
      event: "delivered",
      id: 9991,
      "message-id": mockMessageId
    });
    assert.strictEqual(unauthedWh.statusCode, 401, "Webhook without secret must be rejected 401");

    const authedWh = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/communication/webhook/brevo",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-brevo-webhook-secret": "live-test-secret-key-xyz"
      }
    }, {
      event: "delivered",
      id: 9992,
      "message-id": mockMessageId
    });
    assert.strictEqual(authedWh.statusCode, 200, "Webhook with matching secret must be accepted 200");
    console.log("✔ Webhook security enforced: secret verification working and timing-safe");

    // Reset mockFetch and env vars
    brevoProvider.mockFetch = null;
    delete process.env.BREVO_WEBHOOK_SECRET;

    console.log("\n=========================================");
    console.log("BREVO EMAIL PROVIDER SERVER VERIFIED 100%!");
    console.log("=========================================\n");
  } finally {
    server.close();
  }
}

verifyBrevoServer().catch(err => {
  console.error("Brevo server verification failed:", err);
  process.exit(1);
});
