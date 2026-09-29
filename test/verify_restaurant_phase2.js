/**
 * Restaurant OS v1 - Phase 2 Verification Suite
 * Restaurant Profile & Table Management
 *
 * Validates all 15 Phase 2 requirements:
 * 1. Profile GET (/api/restaurant/profile)
 * 2. Profile update (PATCH /api/restaurant/profile) + validations
 * 3. Branch create (POST /api/restaurant/branches) + duplicate name check
 * 4. Branch list (GET /api/restaurant/branches)
 * 5. Branch update (PATCH /api/restaurant/branches/:id)
 * 6. Table create (POST /api/restaurant/tables)
 * 7. Table list (GET /api/restaurant/tables)
 * 8. Table filtering (by branchId and status)
 * 9. Table update (PATCH /api/restaurant/tables/:id)
 * 10. Duplicate table rejection (in same branch)
 * 11. Invalid capacity rejection (<= 0)
 * 12. Invalid branch assignment rejection (Restaurant A table -> Restaurant B branch)
 * 13. Cross-tenant isolation (Restaurant A cannot view/update Restaurant B branches/tables)
 * 14. Unauthorized access rejection (401 unauthenticated, 403 insufficient permission)
 * 15. Regression against Phase 1 database verification
 */

const assert = require("assert");
const http = require("http");
require("dotenv").config();

const server = require("../server");
const userStore = require("../memory/userStore");
const { createSession } = require("../security/session");
const crmStore = require("../memory/crmStore");
const restaurantStore = require("../memory/restaurantStore");
const restaurantRepository = require("../memory/repositories/restaurantRepository");
const { runRestaurantDbTests } = require("./verify_restaurant_database");
const { closePool } = require("../memory/db");

function makeRequest(testServer, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = testServer.address().port;
    const reqOptions = {
      hostname: "127.0.0.1",
      port,
      path: options.path,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json
        });
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runPhase2Tests() {
  console.log("================================================================");
  console.log("RESTAURANT OS v1 - PHASE 2 VERIFICATION SUITE");
  console.log("Profile, Branch & Table Management with Strict Multi-Tenancy");
  console.log("================================================================\n");

  // Start test server on ephemeral port
  const testServer = http.createServer(server.listeners("request")[0]);
  await new Promise(resolve => testServer.listen(0, "127.0.0.1", resolve));
  const serverPort = testServer.address().port;
  console.log(`Test server running on port ${serverPort}\n`);

  try {
    // -------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------
    const tenantA = "client-phase2-tenant-a";
    const tenantB = "client-phase2-tenant-b";

    // Clean up local restaurant store test records for clean slate
    const allBranches = restaurantStore.getBranches();
    const remainingBranches = allBranches.filter(b => b.restaurantId !== tenantA && b.restaurantId !== tenantB);
    const allTables = restaurantStore.getTables();
    const remainingTables = allTables.filter(t => t.restaurantId !== tenantA && t.restaurantId !== tenantB);

    // Create / seed initial restaurant profiles in crmStore and PostgreSQL
    restaurantStore.updateRestaurantProfile(tenantA, {
      name: "SpiceBox Downtown",
      company: "SpiceBox Hospitality LLC",
      email: "contact@spicebox.example",
      phone: "+1-555-0100",
      currency: "INR",
      taxRate: 5.0,
      gstNumber: "GSTIN-SPICE-01",
      operatingHours: { open: "11:00", close: "23:00" },
      branding: { logo: "https://example.com/spicebox.png", themeColor: "#f97316" },
      settings: { dineIn: true, takeaway: true }
    });
    await restaurantRepository.updateRestaurantProfile(tenantA, {
      name: "SpiceBox Downtown",
      company: "SpiceBox Hospitality LLC",
      email: "contact@spicebox.example",
      phone: "+1-555-0100",
      currency: "INR",
      taxRate: 5.0,
      gstNumber: "GSTIN-SPICE-01",
      operatingHours: { open: "11:00", close: "23:00" },
      branding: { logo: "https://example.com/spicebox.png", themeColor: "#f97316" },
      settings: { dineIn: true, takeaway: true }
    });

    restaurantStore.updateRestaurantProfile(tenantB, {
      name: "Bella Italia",
      company: "Bella Italia Trattoria",
      email: "info@bellaitalia.example",
      phone: "+1-555-0200",
      currency: "EUR",
      taxRate: 10.0,
      gstNumber: "VAT-BELLA-02"
    });
    await restaurantRepository.updateRestaurantProfile(tenantB, {
      name: "Bella Italia",
      company: "Bella Italia Trattoria",
      email: "info@bellaitalia.example",
      phone: "+1-555-0200",
      currency: "EUR",
      taxRate: 10.0,
      gstNumber: "VAT-BELLA-02"
    });

    // Create test users
    const rand = Math.floor(Math.random() * 10000);
    const userA = userStore.createUser({
      name: "Manager SpiceBox",
      email: `manager.spicebox.${rand}@example.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: tenantA
    });

    const userB = userStore.createUser({
      name: "Manager BellaItalia",
      email: `manager.bella.${rand}@example.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: tenantB
    });

    const viewerA = userStore.createUser({
      name: "Viewer SpiceBox",
      email: `viewer.spicebox.${rand}@example.com`,
      password: "Password123!",
      role: "VIEWER",
      restaurantId: tenantA
    });

    const adminUser = userStore.createUser({
      name: "Admin User",
      email: `admin.test.${rand}@example.com`,
      password: "Password123!",
      role: "ADMIN"
    });

    const sessionA = createSession(userA);
    const sessionB = createSession(userB);
    const sessionViewerA = createSession(viewerA);
    const sessionAdmin = createSession(adminUser);

    const authA = { Authorization: `Bearer ${sessionA.token}` };
    const authB = { Authorization: `Bearer ${sessionB.token}` };
    const authViewerA = { Authorization: `Bearer ${sessionViewerA.token}` };
    const authAdmin = { Authorization: `Bearer ${sessionAdmin.token}` };

    console.log("✔ Test fixtures and auth sessions initialized.\n");

    // -------------------------------------------------------------
    // CHECK 1: Profile GET
    // -------------------------------------------------------------
    console.log("Check 1: Verifying Profile GET (/api/restaurant/profile)...");
    const getProfileRes = await makeRequest(testServer, {
      path: "/api/restaurant/profile",
      method: "GET",
      headers: authA
    });

    assert.strictEqual(getProfileRes.statusCode, 200, "Profile GET should return 200");
    assert(getProfileRes.body.profile, "Response must include profile object");
    assert.strictEqual(getProfileRes.body.profile.id, tenantA);
    assert.strictEqual(getProfileRes.body.profile.name, "SpiceBox Downtown");
    assert.strictEqual(getProfileRes.body.profile.currency, "INR");
    assert.strictEqual(getProfileRes.body.profile.taxRate, 5.0);
    assert.strictEqual(getProfileRes.body.profile.gstNumber, "GSTIN-SPICE-01");
    assert.strictEqual(getProfileRes.body.profile.branding.themeColor, "#f97316");
    console.log("✔ Check 1 Passed: Restaurant Profile GET operational.\n");

    // -------------------------------------------------------------
    // CHECK 2: Profile Update (PATCH) & Validations
    // -------------------------------------------------------------
    console.log("Check 2: Verifying Profile PATCH (/api/restaurant/profile)...");
    const patchProfileRes = await makeRequest(testServer, {
      path: "/api/restaurant/profile",
      method: "PATCH",
      headers: authA
    }, {
      name: "SpiceBox Downtown Flagship",
      phone: "+1-555-0999",
      taxRate: 5.5,
      branding: { logo: "https://example.com/spicebox-new.png", themeColor: "#ea580c" },
      settings: { dineIn: true, takeaway: true, qrOrdering: true }
    });

    assert.strictEqual(patchProfileRes.statusCode, 200, "Profile PATCH should return 200");
    assert.strictEqual(patchProfileRes.body.success, true);
    assert.strictEqual(patchProfileRes.body.profile.name, "SpiceBox Downtown Flagship");
    assert.strictEqual(patchProfileRes.body.profile.phone, "+1-555-0999");
    assert.strictEqual(patchProfileRes.body.profile.taxRate, 5.5);
    assert.strictEqual(patchProfileRes.body.profile.branding.themeColor, "#ea580c");
    assert.strictEqual(patchProfileRes.body.profile.settings.qrOrdering, true);

    // Negative tax rate rejection
    const badTaxRes = await makeRequest(testServer, {
      path: "/api/restaurant/profile",
      method: "PATCH",
      headers: authA
    }, {
      taxRate: -2.5
    });
    assert.strictEqual(badTaxRes.statusCode, 400, "Negative tax rate must be rejected with 400");

    // Invalid email rejection
    const badEmailRes = await makeRequest(testServer, {
      path: "/api/restaurant/profile",
      method: "PATCH",
      headers: authA
    }, {
      email: "not-an-email"
    });
    assert.strictEqual(badEmailRes.statusCode, 400, "Invalid email format must be rejected with 400");
    console.log("✔ Check 2 Passed: Restaurant Profile PATCH and validations verified.\n");

    // -------------------------------------------------------------
    // CHECK 3: Branch Create (POST)
    // -------------------------------------------------------------
    console.log("Check 3: Verifying Branch Create (POST /api/restaurant/branches)...");
    const createBranchRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authA
    }, {
      name: "Downtown Main Branch",
      branchCode: "DT-01",
      address: "100 Market St",
      city: "Metropolis",
      phone: "+1-555-1111",
      email: "downtown@spicebox.example"
    });

    assert.strictEqual(createBranchRes.statusCode, 201, "Branch create should return 201");
    assert(createBranchRes.body.branch && createBranchRes.body.branch.id);
    const branchA1Id = createBranchRes.body.branch.id;
    assert.strictEqual(createBranchRes.body.branch.name, "Downtown Main Branch");
    assert.strictEqual(createBranchRes.body.branch.restaurantId, tenantA);

    // Duplicate branch name rejection in same restaurant
    const dupBranchRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authA
    }, {
      name: "Downtown Main Branch"
    });
    assert.strictEqual(dupBranchRes.statusCode, 400, "Duplicate branch name must return 400");

    // Empty branch name rejection
    const emptyBranchRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authA
    }, {
      name: ""
    });
    assert.strictEqual(emptyBranchRes.statusCode, 400, "Empty branch name must return 400");
    console.log("✔ Check 3 Passed: Branch creation and deduplication verified.\n");

    // -------------------------------------------------------------
    // CHECK 4: Branch List (GET)
    // -------------------------------------------------------------
    console.log("Check 4: Verifying Branch List (GET /api/restaurant/branches)...");
    const listBranchesRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "GET",
      headers: authA
    });

    assert.strictEqual(listBranchesRes.statusCode, 200, "Branch list should return 200");
    assert(Array.isArray(listBranchesRes.body.branches));
    const foundBranch = listBranchesRes.body.branches.find(b => b.id === branchA1Id);
    assert(foundBranch, "Created branch must be present in branch list");
    console.log("✔ Check 4 Passed: Branch list verified.\n");

    // -------------------------------------------------------------
    // CHECK 5: Branch Update (PATCH)
    // -------------------------------------------------------------
    console.log("Check 5: Verifying Branch Update (PATCH /api/restaurant/branches/:id)...");
    const patchBranchRes = await makeRequest(testServer, {
      path: `/api/restaurant/branches/${branchA1Id}`,
      method: "PATCH",
      headers: authA
    }, {
      address: "100 Market St, Level 2",
      phone: "+1-555-2222"
    });

    assert.strictEqual(patchBranchRes.statusCode, 200, "Branch update should return 200");
    assert.strictEqual(patchBranchRes.body.branch.address, "100 Market St, Level 2");
    assert.strictEqual(patchBranchRes.body.branch.phone, "+1-555-2222");

    // Non-existent branch update
    const missingBranchRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches/brn-non-existent-999",
      method: "PATCH",
      headers: authA
    }, {
      name: "Ghost Branch"
    });
    assert.strictEqual(missingBranchRes.statusCode, 404, "Non-existent branch update must return 404");
    console.log("✔ Check 5 Passed: Branch update verified.\n");

    // Create a second branch for Restaurant A for filtering tests
    const branchA2Res = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authA
    }, {
      name: "Uptown Express",
      branchCode: "UP-02",
      address: "500 North Ave",
      city: "Metropolis"
    });
    assert.strictEqual(branchA2Res.statusCode, 201);
    const branchA2Id = branchA2Res.body.branch.id;

    // -------------------------------------------------------------
    // CHECK 6: Table Create (POST)
    // -------------------------------------------------------------
    console.log("Check 6: Verifying Table Create (POST /api/restaurant/tables)...");
    const createTableRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA1Id,
      tableNumber: "T-01",
      name: "Window Table 1",
      capacity: 4,
      status: "AVAILABLE"
    });

    assert.strictEqual(createTableRes.statusCode, 201, "Table create should return 201");
    assert(createTableRes.body.table && createTableRes.body.table.id);
    const table1Id = createTableRes.body.table.id;
    assert.strictEqual(createTableRes.body.table.tableNumber, "T-01");
    assert.strictEqual(createTableRes.body.table.capacity, 4);
    assert.strictEqual(createTableRes.body.table.restaurantId, tenantA);
    assert.strictEqual(createTableRes.body.table.branchId, branchA1Id);
    console.log("✔ Check 6 Passed: Table creation verified.\n");

    // -------------------------------------------------------------
    // CHECK 7: Table List (GET)
    // -------------------------------------------------------------
    console.log("Check 7: Verifying Table List (GET /api/restaurant/tables)...");
    const listTablesRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "GET",
      headers: authA
    });

    assert.strictEqual(listTablesRes.statusCode, 200, "Table list should return 200");
    assert(Array.isArray(listTablesRes.body.tables));
    const foundTable = listTablesRes.body.tables.find(t => t.id === table1Id);
    assert(foundTable, "Created table must exist in table list");
    console.log("✔ Check 7 Passed: Table list verified.\n");

    // -------------------------------------------------------------
    // CHECK 8: Table Filtering (by branchId & status)
    // -------------------------------------------------------------
    console.log("Check 8: Verifying Table Filtering by branchId and status...");
    // Create Table T-02 (OCCUPIED) in Branch 1
    const table2Res = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA1Id,
      tableNumber: "T-02",
      name: "Center Booth",
      capacity: 6,
      status: "OCCUPIED"
    });
    assert.strictEqual(table2Res.statusCode, 201);
    const table2Id = table2Res.body.table.id;

    // Create Table T-10 (AVAILABLE) in Branch 2
    const table3Res = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA2Id,
      tableNumber: "T-10",
      name: "Uptown High Top",
      capacity: 2,
      status: "AVAILABLE"
    });
    assert.strictEqual(table3Res.statusCode, 201);
    const table3Id = table3Res.body.table.id;

    // Filter by branchId = branchA1Id
    const filterBranchRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables?branchId=${branchA1Id}`,
      method: "GET",
      headers: authA
    });
    assert.strictEqual(filterBranchRes.statusCode, 200);
    assert(filterBranchRes.body.tables.every(t => t.branchId === branchA1Id), "All returned tables must match branchId");
    assert(filterBranchRes.body.tables.some(t => t.id === table1Id));
    assert(filterBranchRes.body.tables.some(t => t.id === table2Id));
    assert(!filterBranchRes.body.tables.some(t => t.id === table3Id), "Table from Branch 2 must not be returned");

    // Filter by status = OCCUPIED
    const filterStatusRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables?status=OCCUPIED",
      method: "GET",
      headers: authA
    });
    assert.strictEqual(filterStatusRes.statusCode, 200);
    assert(filterStatusRes.body.tables.every(t => t.status === "OCCUPIED"), "All returned tables must have status OCCUPIED");
    assert(filterStatusRes.body.tables.some(t => t.id === table2Id));
    assert(!filterStatusRes.body.tables.some(t => t.id === table1Id));
    console.log("✔ Check 8 Passed: Table filtering by branch and status verified.\n");

    // -------------------------------------------------------------
    // CHECK 9: Table Update (PATCH)
    // -------------------------------------------------------------
    console.log("Check 9: Verifying Table Update (PATCH /api/restaurant/tables/:id)...");
    const patchTableRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${table1Id}`,
      method: "PATCH",
      headers: authA
    }, {
      capacity: 6,
      status: "RESERVED",
      name: "VIP Window 1"
    });

    assert.strictEqual(patchTableRes.statusCode, 200, "Table update should return 200");
    assert.strictEqual(patchTableRes.body.table.capacity, 6);
    assert.strictEqual(patchTableRes.body.table.status, "RESERVED");
    assert.strictEqual(patchTableRes.body.table.name, "VIP Window 1");

    // Non-existent table update returns 404
    const badTableUpdateRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables/tbl-non-existent-999",
      method: "PATCH",
      headers: authA
    }, {
      status: "AVAILABLE"
    });
    assert.strictEqual(badTableUpdateRes.statusCode, 404, "Updating non-existent table must return 404");
    console.log("✔ Check 9 Passed: Table update verified.\n");

    // -------------------------------------------------------------
    // CHECK 10: Duplicate Table Rejection
    // -------------------------------------------------------------
    console.log("Check 10: Verifying Duplicate Table Rejection in Same Branch...");
    const dupTableRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA1Id,
      tableNumber: "T-01",
      capacity: 4
    });

    assert.strictEqual(dupTableRes.statusCode, 400, "Duplicate table number in same branch must return 400");
    assert(dupTableRes.body.error && dupTableRes.body.error.includes("already exists"));

    // Verify same table number IN DIFFERENT BRANCH is allowed
    const diffBranchTableRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA2Id,
      tableNumber: "T-01",
      capacity: 4
    });
    assert.strictEqual(diffBranchTableRes.statusCode, 201, "Same table number in different branch must succeed");
    console.log("✔ Check 10 Passed: Duplicate table rejection verified.\n");

    // -------------------------------------------------------------
    // CHECK 11: Invalid Capacity Rejection (<= 0)
    // -------------------------------------------------------------
    console.log("Check 11: Verifying Invalid Capacity Rejection (capacity <= 0)...");
    const zeroCapRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      tableNumber: "T-BAD-ZERO",
      capacity: 0
    });
    assert.strictEqual(zeroCapRes.statusCode, 400, "Capacity 0 must return 400");

    const negCapRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      tableNumber: "T-BAD-NEG",
      capacity: -4
    });
    assert.strictEqual(negCapRes.statusCode, 400, "Negative capacity must return 400");

    const patchBadCapRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${table1Id}`,
      method: "PATCH",
      headers: authA
    }, {
      capacity: -1
    });
    assert.strictEqual(patchBadCapRes.statusCode, 400, "Updating to negative capacity must return 400");
    console.log("✔ Check 11 Passed: Invalid capacity rejection verified.\n");

    // -------------------------------------------------------------
    // CHECK 12: Invalid Branch Assignment Rejection
    // -------------------------------------------------------------
    console.log("Check 12: Verifying Cross-Tenant Branch Assignment Rejection...");
    // Create Branch B for Restaurant B
    const branchBRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authB
    }, {
      name: "Bella Roma",
      branchCode: "BR-01",
      city: "Rome"
    });
    assert.strictEqual(branchBRes.statusCode, 201);
    const branchBId = branchBRes.body.branch.id;

    // Restaurant A attempts to create table assigned to Restaurant B's branch
    const crossBranchTableRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchBId,
      tableNumber: "T-CROSS-TENANT",
      capacity: 4
    });
    assert.strictEqual(crossBranchTableRes.statusCode, 400, "Assigning table to another tenant's branch must return 400");
    assert(crossBranchTableRes.body.error && crossBranchTableRes.body.error.includes("Branch not found"));
    console.log("✔ Check 12 Passed: Invalid branch assignment rejected.\n");

    // -------------------------------------------------------------
    // CHECK 13: Restaurant A/B Isolation (Strict Multi-Tenancy)
    // -------------------------------------------------------------
    console.log("Check 13: Verifying Restaurant A/B Strict Multi-Tenant Isolation...");
    // Create Table for Restaurant B
    const tableBRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authB
    }, {
      branchId: branchBId,
      tableNumber: "TB-01",
      capacity: 4
    });
    assert.strictEqual(tableBRes.statusCode, 201);
    const tableBId = tableBRes.body.table.id;

    // 13.1 Restaurant A listing branches must NOT see Branch B
    const restABranches = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "GET",
      headers: authA
    });
    assert.strictEqual(restABranches.statusCode, 200);
    assert(!restABranches.body.branches.some(b => b.id === branchBId), "Restaurant A must NEVER see Restaurant B branches");

    // 13.2 Restaurant A listing tables must NOT see Table B
    const restATables = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "GET",
      headers: authA
    });
    assert.strictEqual(restATables.statusCode, 200);
    assert(!restATables.body.tables.some(t => t.id === tableBId), "Restaurant A must NEVER see Restaurant B tables");

    // 13.3 Restaurant A attempts to update Branch B
    const hackBranchRes = await makeRequest(testServer, {
      path: `/api/restaurant/branches/${branchBId}`,
      method: "PATCH",
      headers: authA
    }, {
      name: "Hijacked Branch"
    });
    assert.strictEqual(hackBranchRes.statusCode, 404, "Attempting to update another tenant's branch must return 404");

    // 13.4 Restaurant A attempts to update Table B
    const hackTableRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tableBId}`,
      method: "PATCH",
      headers: authA
    }, {
      status: "HIJACKED"
    });
    assert.strictEqual(hackTableRes.statusCode, 404, "Attempting to update another tenant's table must return 404");

    // 13.5 Non-admin user from Restaurant A attempts to forge header X-Restaurant-Id to access Restaurant B
    const spoofHeaderRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "GET",
      headers: {
        ...authA,
        "X-Restaurant-Id": tenantB
      }
    });
    assert.strictEqual(spoofHeaderRes.statusCode, 200);
    // Even with spoofed header, returned branches MUST still be Restaurant A's!
    assert(!spoofHeaderRes.body.branches.some(b => b.id === branchBId), "Non-admin tenant context cannot be spoofed via header");
    console.log("✔ Check 13 Passed: Cross-tenant isolation fully verified.\n");

    // -------------------------------------------------------------
    // CHECK 14: Unauthorized Access Rejection (401 & 403)
    // -------------------------------------------------------------
    console.log("Check 14: Verifying Unauthorized Access Rejection (401 & 403)...");
    // 14.1 Unauthenticated request (no token) -> 401
    const unauthedRes = await makeRequest(testServer, {
      path: "/api/restaurant/profile",
      method: "GET"
    });
    assert.strictEqual(unauthedRes.statusCode, 401, "Unauthenticated request must return 401");

    // 14.2 VIEWER role attempting to create branch -> 403 (missing restaurant.write)
    const viewerBranchRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authViewerA
    }, {
      name: "Forbidden Branch"
    });
    assert.strictEqual(viewerBranchRes.statusCode, 403, "Viewer role attempting branch creation must return 403");

    // 14.3 VIEWER role attempting to create table -> 403 (missing restaurant.tables)
    const viewerTableRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authViewerA
    }, {
      tableNumber: "T-FORBIDDEN",
      capacity: 4
    });
    assert.strictEqual(viewerTableRes.statusCode, 403, "Viewer role attempting table creation must return 403");

    // 14.4 VIEWER role CAN read profile and branches (restaurant.read permission)
    const viewerReadProfileRes = await makeRequest(testServer, {
      path: "/api/restaurant/profile",
      method: "GET",
      headers: authViewerA
    });
    assert.strictEqual(viewerReadProfileRes.statusCode, 200, "Viewer role has restaurant.read so profile read must return 200");
    console.log("✔ Check 14 Passed: Unauthorized and forbidden access properly rejected.\n");

    // -------------------------------------------------------------
    // CHECK 15: Regression against Phase 1 Database Verification
    // -------------------------------------------------------------
    console.log("Check 15: Verifying Phase 1 Database Regression & Constraints...");
    await runRestaurantDbTests();
    console.log("✔ Check 15 Passed: Neon PostgreSQL schema, foreign keys, and constraints verified 100% intact.\n");

    console.log("================================================================");
    console.log(">>> ALL 15 PHASE 2 CHECKS PASSED SUCCESSFULLY! <<<");
    console.log("================================================================");
  } finally {
    try {
      const { query } = require("../memory/db");
      await query("DELETE FROM clients WHERE id IN ($1, $2)", [tenantA, tenantB]);
    } catch (e) {}
    await new Promise(resolve => testServer.close(resolve));
    await closePool();
  }
}

if (require.main === module) {
  runPhase2Tests()
    .then(() => {
      console.log("\nPhase 2 Verification completed cleanly.");
      process.exit(0);
    })
    .catch(err => {
      console.error("\n❌ Phase 2 Verification Failed:", err);
      process.exit(1);
    });
}

module.exports = { runPhase2Tests };
