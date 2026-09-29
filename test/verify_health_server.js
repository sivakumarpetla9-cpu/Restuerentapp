const http = require("http");
const assert = require("assert");
const server = require("../server");

const TEST_PORT = 3095;

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk.toString()));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {}
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function run() {
  console.log("Starting Production Health & Static Asset Verification...");

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Test server running on port ${TEST_PORT}`);

  try {
    // 1. GET /health
    const health = await makeRequest("GET", "/health");
    assert.strictEqual(health.status, 200, "GET /health must return 200");
    assert.strictEqual(health.json.status, "ok", "status must be ok");
    assert.strictEqual(typeof health.json.uptime, "number", "uptime must be number");
    assert.strictEqual(health.json.service, "ai-business-agent", "service name check");
    assert(health.json.database, "database object must be present");
    console.log("✔ GET /health returned 200 with service & database metadata");

    // 2. GET /api/health
    const apiHealth = await makeRequest("GET", "/api/health");
    assert.strictEqual(apiHealth.status, 200, "GET /api/health must return 200");
    assert.strictEqual(apiHealth.json.status, "ok", "api health status must be ok");
    console.log("✔ GET /api/health returned 200 without authentication headers");

    // 3. Security headers on /health
    const csp = health.headers["content-security-policy"] || "";
    assert(csp.includes("https:"), "CSP must permit https: connect-src");
    console.log("✔ Security headers and CSP with https: verified");

    // 4. GET / serves static frontend index.html
    const root = await makeRequest("GET", "/");
    assert.strictEqual(root.status, 200, "GET / must return 200");
    assert(root.headers["content-type"].includes("text/html"), "Content-Type must be text/html");
    assert(root.body.includes("<div id=\"root\"></div>") || root.body.includes("html"), "Must serve frontend html");
    console.log("✔ GET / serves built React SPA index.html");

    // 5. SPA routing fallback for deep URLs (e.g. /leads, /pipeline)
    const spaFallback = await makeRequest("GET", "/pipeline");
    assert.strictEqual(spaFallback.status, 200, "SPA fallback must return 200");
    assert(spaFallback.headers["content-type"].includes("text/html"), "SPA fallback must be text/html");
    console.log("✔ SPA client-side route fallback to index.html verified");

    console.log("\n=========================================");
    console.log("ALL PRODUCTION HEALTH & STATIC CHECKS PASSED!");
    console.log("=========================================\n");
  } finally {
    server.close();
    const { closePool } = require("../memory/db");
    await closePool();
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
