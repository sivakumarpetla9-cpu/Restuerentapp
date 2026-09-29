require("dotenv").config();
const http = require("http");
const assert = require("assert");

// Import server
const server = require("../server");

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

async function verifyAuthServer() {
  console.log("Starting server verification...");
  const PORT = 3099;

  await new Promise((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  try {
    // 1. Unauthenticated request to protected endpoint -> 401
    const unauthedRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/dashboard/overview",
      method: "GET"
    });
    assert.strictEqual(unauthedRes.statusCode, 401, "Expected 401 for unauthenticated request");
    assert.strictEqual(unauthedRes.headers["x-content-type-options"], "nosniff");
    assert.strictEqual(unauthedRes.headers["x-frame-options"], "DENY");
    console.log("✔ Protected endpoint rejected unauthenticated request (401)");

    // 2. Failed login attempt -> 401
    const badLoginRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, { email: "admin@localhost", password: "wrongpassword" });
    assert.strictEqual(badLoginRes.statusCode, 401, "Expected 401 for bad password");
    console.log("✔ Failed login rejected (401)");

    // 3. Successful login -> 200, returns user & session cookie
    const goodLoginRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" }
    }, { email: "admin@localhost", password: "localdevadmin123" });
    assert.strictEqual(goodLoginRes.statusCode, 200, "Expected 200 for valid login");
    assert.strictEqual(goodLoginRes.data.success, true);
    assert.strictEqual(goodLoginRes.data.user.role, "ADMIN");
    assert.strictEqual(goodLoginRes.data.user.passwordHash, undefined);

    const setCookie = goodLoginRes.headers["set-cookie"];
    assert(setCookie && setCookie.length > 0, "Expected Set-Cookie header");
    const cookieVal = setCookie[0].split(";")[0];
    const token = goodLoginRes.data.token;
    console.log("✔ Successful login issued cookie & token (200)");

    // 4. Authenticated request using Cookie -> 200
    const authedOverviewCookie = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/dashboard/overview",
      method: "GET",
      headers: { "Cookie": cookieVal }
    });
    assert.strictEqual(authedOverviewCookie.statusCode, 200, "Expected 200 for authed overview via cookie");
    assert(authedOverviewCookie.data.kpis !== undefined);
    console.log("✔ Authenticated request via Cookie succeeded (200)");

    // 5. Authenticated request using Bearer Token -> 200
    const authedOverviewBearer = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/auth/me",
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.strictEqual(authedOverviewBearer.statusCode, 200, "Expected 200 for /api/auth/me via Bearer");
    assert.strictEqual(authedOverviewBearer.data.user.email, "admin@localhost");
    console.log("✔ Authenticated request via Bearer token succeeded (200)");

    // 6. Admin accessing users management -> 200
    const usersRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/users",
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.strictEqual(usersRes.statusCode, 200, "Expected 200 for /api/users");
    assert(Array.isArray(usersRes.data.users));
    console.log("✔ Admin accessed /api/users (200)");

    // 7. Security audit logs retrieval -> 200
    const auditRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/security/audit",
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    });
    assert.strictEqual(auditRes.statusCode, 200, "Expected 200 for /api/security/audit");
    assert(Array.isArray(auditRes.data.auditLogs));
    console.log("✔ Admin accessed /api/security/audit (200)");

    // 8. Logout -> 200 & clear cookie
    const logoutRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/auth/logout",
      method: "POST",
      headers: { "Cookie": cookieVal }
    });
    assert.strictEqual(logoutRes.statusCode, 200, "Expected 200 for logout");
    const logoutCookie = logoutRes.headers["set-cookie"][0];
    assert(logoutCookie.includes("Max-Age=0"));
    console.log("✔ Logout invalidated session and cleared cookie (200)");

    // 9. Post-logout request -> authenticated: false
    const postLogoutRes = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/auth/me",
      method: "GET",
      headers: { "Cookie": cookieVal }
    });
    assert.strictEqual(postLogoutRes.statusCode, 200);
    assert.strictEqual(postLogoutRes.data.authenticated, false);
    console.log("✔ Post-logout /api/auth/me returns authenticated: false (200)");

    // 10. Post-logout protected route -> 401
    const postLogoutProtected = await doRequest({
      hostname: "127.0.0.1",
      port: PORT,
      path: "/api/dashboard/overview",
      method: "GET",
      headers: { "Cookie": cookieVal }
    });
    assert.strictEqual(postLogoutProtected.statusCode, 401, "Expected 401 on protected route after logout");
    console.log("✔ Post-logout protected endpoint rejected (401)");

    console.log("\nALL SERVER AUTH INTEGRATION CHECKS PASSED!");
  } finally {
    server.close();
  }
}

verifyAuthServer().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
