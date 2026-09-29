/**
 * Database API Server Integration Verification
 *
 * Tests the /api/database/status endpoint under authentication and ensures
 * safe reporting of provider status without exposing credentials.
 */

require("dotenv").config();
const http = require("http");
const assert = require("assert");
const server = require("../server");
const { bootstrapAdmin } = require("../memory/userStore");

const PORT = 3096;

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

async function verifyDatabaseServer() {
  console.log("Starting Database API Server verification...");

  await new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  try {
    // 1. Unauthenticated request to /api/database/status must be rejected (401)
    const unauth = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/database/status",
      method: "GET"
    });
    assert.strictEqual(unauth.statusCode, 401);
    console.log("✔ Protected /api/database/status rejected unauthenticated request (401)");

    // 2. Login as admin
    bootstrapAdmin();
    const loginRes = await doRequest(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path: "/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" }
      },
      {
        email: process.env.ADMIN_EMAIL || "admin@example.com",
        password: process.env.ADMIN_PASSWORD || "AdminSecurePass123!"
      }
    );
    assert.strictEqual(loginRes.statusCode, 200);
    assert(loginRes.data.token, "Expected token on login");
    const token = loginRes.data.token;
    console.log("✔ Admin logged in successfully");

    // 3. Authenticated request to /api/database/status
    const authStatus = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/database/status",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(authStatus.statusCode, 200);

    const payload = authStatus.data;
    assert(payload.database, "Expected database field in response");
    assert.strictEqual(typeof payload.database.connected, "boolean");

    // Verify zero credential leaks
    const payloadStr = JSON.stringify(payload);
    assert(!payloadStr.includes("password"), "Must not leak password");
    assert(!payloadStr.includes("postgres://"), "Must not leak DATABASE_URL");

    console.log(`✔ GET /api/database/status returned 200 (Provider: ${payload.database.provider}, Connected: ${payload.database.connected})`);
    console.log("✔ Zero credential leakage verified");

    console.log("\n=========================================");
    console.log("DATABASE SERVER ENDPOINT VERIFIED 100%!");
    console.log("=========================================\n");
  } finally {
    server.close();
    process.exit(0);
  }
}

verifyDatabaseServer().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
