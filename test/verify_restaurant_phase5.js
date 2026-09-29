/**
 * Restaurant OS v1 - Phase 5 Verification Suite
 * Kitchen Display + Order Management
 *
 * Validates all 32 required test areas:
 * 1. Staff Authentication Required for Kitchen Queue (401 without auth)
 * 2. Kitchen Display Queue Retrieval (200, active orders list)
 * 3. Kitchen Queue Viewer Access (200, VIEWER role has restaurant.read)
 * 4. Multi-Tenant Isolation for Kitchen Queue (Tenant A cannot see Tenant B orders)
 * 5. FIFO Queue Sorting Verification (created_at ASC)
 * 6. Kitchen Queue Single Status Filter (?status=NEW)
 * 7. Kitchen Queue Multi-Status Filter (?status=NEW,ACCEPTED)
 * 8. Kitchen Queue Branch Filter (?branchId=...)
 * 9. Kitchen Queue Table Filter (?tableId=...)
 * 10. Kitchen Order Data Completeness (orderNumber, status, totals, table, items)
 * 11. Dietary Type Persistence on Order Line Items (VEG, NON_VEG, etc.)
 * 12. Single Order Detail Retrieval (GET /api/restaurant/orders/:id -> 200)
 * 13. Single Order Detail Multi-Tenant Isolation (Tenant A requesting Tenant B order -> 404)
 * 14. Non-existent Order Detail Retrieval (404)
 * 15. Order Status Update Auth Required (401 without auth)
 * 16. RBAC Protection: VIEWER role cannot update order status (403 Forbidden)
 * 17. RBAC Protection: Customer cannot update order status (401/403)
 * 18. Missing Status in Body Rejection (400)
 * 19. Invalid Status Value Rejection (400)
 * 20. Valid Transition 1: NEW -> ACCEPTED (200, acceptedAt set)
 * 21. Valid Transition 2: ACCEPTED -> PREPARING (200, preparingAt set)
 * 22. Valid Transition 3: PREPARING -> READY (200, readyAt set)
 * 23. Valid Transition 4: READY -> SERVED (200, servedAt set)
 * 24. Valid Cancellation from NEW: NEW -> CANCELLED (200, cancelledAt set)
 * 25. Valid Cancellation from ACCEPTED: ACCEPTED -> CANCELLED (200, cancelledAt set)
 * 26. Invalid Transition Rejection: NEW -> READY (400)
 * 27. Invalid Transition Rejection: NEW -> SERVED (400)
 * 28. Invalid Backward Transition Rejection: PREPARING -> ACCEPTED (400)
 * 29. Terminal State Immutability: SERVED -> anything (400)
 * 30. Terminal State Immutability: CANCELLED -> anything (400)
 * 31. Concurrency / Optimistic Locking Protection (stale currentStatus -> 409 Conflict)
 * 32. Table Occupancy Synchronization & Audit Trail Verification
 */

const assert = require("assert");
const http = require("http");
require("dotenv").config();

const server = require("../server");
const restaurantStore = require("../memory/restaurantStore");
const restaurantRepository = require("../memory/repositories/restaurantRepository");
const userStore = require("../memory/userStore");
const securityAuditStore = require("../memory/securityAuditStore");
const { createSession } = require("../security/session");
const { generateCustomerSessionToken } = require("../security/qrToken");
const { isPostgresConfigured, closePool } = require("../memory/db");

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

    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timed out after 30000ms: ${options.method || "GET"} ${options.path}`));
    });

    req.on("error", reject);

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runSuite() {
  console.log("===============================================================");
  console.log("Restaurant OS v1 - Phase 5 Verification Suite");
  console.log("Kitchen Display + Order Management + State Machine");
  console.log("===============================================================");

  const testServer = http.createServer(server.listeners("request")[0]);
  await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const testPort = testServer.address().port;
  console.log(`Phase 5 Test server running on port ${testPort}`);

  let passedTests = 0;
  const totalTests = 32;

  const runId = Date.now();
  const restAId = `rest-p5-a-${runId}`;
  const restBId = `rest-p5-b-${runId}`;
  const branchAId = `br-p5-a-${runId}`;
  const branchBId = `br-p5-b-${runId}`;
  const tableA1Id = `tbl-p5-a1-${runId}`;
  const tableA2Id = `tbl-p5-a2-${runId}`;
  const tableB1Id = `tbl-p5-b1-${runId}`;

  let authAdminA, authDeliveryA, authViewerA, authDeliveryB;
  let orderA1, orderA2, orderA3, orderB1;

  try {
    console.log("\n[Setup] Initializing Phase 5 test restaurants, tables, users, and orders...");

    // 1. Profiles
    if (isPostgresConfigured()) {
      await restaurantRepository.updateRestaurantProfile(restAId, {
        name: "Kitchen King A",
        currency: "INR",
        taxRate: 5.0
      });
      await restaurantRepository.updateRestaurantProfile(restBId, {
        name: "Kitchen King B",
        currency: "INR",
        taxRate: 5.0
      });
    }
    restaurantStore.updateRestaurantProfile(restAId, {
      name: "Kitchen King A",
      currency: "INR",
      taxRate: 5.0
    });
    restaurantStore.updateRestaurantProfile(restBId, {
      name: "Kitchen King B",
      currency: "INR",
      taxRate: 5.0
    });

    // 2. Branches
    const brA = { id: branchAId, restaurantId: restAId, name: "Alpha Central", address: "100 King St" };
    const brB = { id: branchBId, restaurantId: restBId, name: "Beta Central", address: "200 King St" };
    if (isPostgresConfigured()) {
      await restaurantRepository.createBranch(brA);
      await restaurantRepository.createBranch(brB);
    }
    restaurantStore.createBranch(brA);
    restaurantStore.createBranch(brB);

    // 3. Tables
    const tA1 = { id: tableA1Id, restaurantId: restAId, branchId: branchAId, tableNumber: "T-01", name: "Window 1", capacity: 4, status: "AVAILABLE", isActive: true };
    const tA2 = { id: tableA2Id, restaurantId: restAId, branchId: branchAId, tableNumber: "T-02", name: "Booth 2", capacity: 2, status: "AVAILABLE", isActive: true };
    const tB1 = { id: tableB1Id, restaurantId: restBId, branchId: branchBId, tableNumber: "T-01", name: "Table 1", capacity: 4, status: "AVAILABLE", isActive: true };
    if (isPostgresConfigured()) {
      await restaurantRepository.createTable(tA1);
      await restaurantRepository.createTable(tA2);
      await restaurantRepository.createTable(tB1);
    }
    restaurantStore.createTable(tA1);
    restaurantStore.createTable(tA2);
    restaurantStore.createTable(tB1);

    // 4. Staff Users & Sessions
    const userAdminA = userStore.createUser({
      name: "Admin Alice",
      email: `admin.alice.${runId}@example.com`,
      password: "Password123!",
      role: "ADMIN",
      restaurantId: restAId
    });
    const userDeliveryA = userStore.createUser({
      name: "Cook Dan",
      email: `cook.dan.${runId}@example.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: restAId
    });
    const userViewerA = userStore.createUser({
      name: "Viewer Vic",
      email: `viewer.vic.${runId}@example.com`,
      password: "Password123!",
      role: "VIEWER",
      restaurantId: restAId
    });
    const userDeliveryB = userStore.createUser({
      name: "Chef Bob",
      email: `chef.bob.${runId}@example.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: restBId
    });

    const sAdminA = createSession(userAdminA);
    const sDeliveryA = createSession(userDeliveryA);
    const sViewerA = createSession(userViewerA);
    const sDeliveryB = createSession(userDeliveryB);

    authAdminA = { Authorization: `Bearer ${sAdminA.token}` };
    authDeliveryA = { Authorization: `Bearer ${sDeliveryA.token}` };
    authViewerA = { Authorization: `Bearer ${sViewerA.token}` };
    authDeliveryB = { Authorization: `Bearer ${sDeliveryB.token}` };

    // 5. Menu Items with dietary types
    const catAId = `cat-p5-a-${runId}`;
    if (isPostgresConfigured()) {
      await restaurantRepository.createCategory({ id: catAId, restaurantId: restAId, name: "Mains" });
    }
    restaurantStore.createCategory({ id: catAId, restaurantId: restAId, name: "Mains" });

    const miVeg = {
      id: `mi-veg-${runId}`,
      restaurantId: restAId,
      categoryId: catAId,
      name: "Paneer Tikka",
      price: 250,
      currency: "INR",
      taxRate: 5.0,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    };
    const miNonVeg = {
      id: `mi-nonveg-${runId}`,
      restaurantId: restAId,
      categoryId: catAId,
      name: "Chicken Biryani",
      price: 350,
      currency: "INR",
      taxRate: 5.0,
      dietaryType: "NON_VEG",
      isAvailable: true,
      isActive: true
    };
    if (isPostgresConfigured()) {
      await restaurantRepository.createMenuItem(miVeg);
      await restaurantRepository.createMenuItem(miNonVeg);
    }
    restaurantStore.createMenuItem(miVeg);
    restaurantStore.createMenuItem(miNonVeg);

    // 6. Create Table Sessions & Orders
    const sessA1 = restaurantStore.createTableSession({ restaurantId: restAId, branchId: branchAId, tableId: tableA1Id });
    const sessA2 = restaurantStore.createTableSession({ restaurantId: restAId, branchId: branchAId, tableId: tableA2Id });
    const sessB1 = restaurantStore.createTableSession({ restaurantId: restBId, branchId: branchBId, tableId: tableB1Id });

    if (isPostgresConfigured()) {
      await restaurantRepository.createTableSession(sessA1);
      await restaurantRepository.createTableSession(sessA2);
      await restaurantRepository.createTableSession(sessB1);
    }

    // Place initial orders
    orderA1 = await restaurantStore.placeOrder({
      id: `ord-p5-a1-${runId}`,
      restaurantId: restAId,
      branchId: branchAId,
      tableId: tableA1Id,
      tableSessionId: sessA1.id,
      orderNumber: `ORD-5001`,
      status: "NEW",
      notes: "Less spicy please"
    }, [{
      id: `oi-p5-1-${runId}`,
      menuItemId: miVeg.id,
      itemName: miVeg.name,
      quantity: 2,
      unitPrice: miVeg.price,
      taxRate: 5.0,
      dietaryType: "VEG"
    }], sessA1.id);

    // Slight delay to ensure FIFO timestamp separation
    await new Promise(r => setTimeout(r, 50));

    orderA2 = await restaurantStore.placeOrder({
      id: `ord-p5-a2-${runId}`,
      restaurantId: restAId,
      branchId: branchAId,
      tableId: tableA1Id,
      tableSessionId: sessA1.id,
      orderNumber: `ORD-5002`,
      status: "NEW"
    }, [{
      id: `oi-p5-2-${runId}`,
      menuItemId: miNonVeg.id,
      itemName: miNonVeg.name,
      quantity: 1,
      unitPrice: miNonVeg.price,
      taxRate: 5.0,
      dietaryType: "NON_VEG"
    }], sessA1.id);

    await new Promise(r => setTimeout(r, 50));

    orderA3 = await restaurantStore.placeOrder({
      id: `ord-p5-a3-${runId}`,
      restaurantId: restAId,
      branchId: branchAId,
      tableId: tableA2Id,
      tableSessionId: sessA2.id,
      orderNumber: `ORD-5003`,
      status: "NEW"
    }, [{
      id: `oi-p5-3-${runId}`,
      menuItemId: miVeg.id,
      itemName: miVeg.name,
      quantity: 1,
      unitPrice: miVeg.price,
      taxRate: 5.0,
      dietaryType: "VEG"
    }], sessA2.id);

    orderB1 = await restaurantStore.placeOrder({
      id: `ord-p5-b1-${runId}`,
      restaurantId: restBId,
      branchId: branchBId,
      tableId: tableB1Id,
      tableSessionId: sessB1.id,
      orderNumber: `ORD-9001`,
      status: "NEW"
    }, [{
      id: `oi-p5-b1-${runId}`,
      itemName: "Pasta",
      quantity: 1,
      unitPrice: 300,
      taxRate: 5.0
    }], sessB1.id);

    console.log("[Setup] Fixtures created successfully.\n");

    // =========================================================================
    // TEST 1: Staff Authentication Required for Kitchen Queue
    // =========================================================================
    console.log("Test 1: Staff Authentication Required for Kitchen Queue...");
    const t1 = await makeRequest(testServer, { path: "/api/restaurant/orders/kitchen", method: "GET" });
    assert.strictEqual(t1.statusCode, 401, "Expected 401 Unauthorized without auth header");
    passedTests++;
    console.log("✓ Test 1 Passed: Unauthenticated request rejected with 401");

    // =========================================================================
    // TEST 2: Kitchen Display Queue Retrieval
    // =========================================================================
    console.log("\nTest 2: Kitchen Display Queue Retrieval...");
    const t2 = await makeRequest(testServer, {
      path: "/api/restaurant/orders/kitchen",
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t2.statusCode, 200, "Expected 200 OK for kitchen orders");
    assert.ok(Array.isArray(t2.body.orders), "Expected orders array in response");
    assert.ok(t2.body.orders.length >= 3, "Expected at least 3 orders for Restaurant A");
    passedTests++;
    console.log(`✓ Test 2 Passed: Fetched ${t2.body.orders.length} active kitchen orders`);

    // =========================================================================
    // TEST 3: Kitchen Queue Viewer Access (restaurant.read permission)
    // =========================================================================
    console.log("\nTest 3: Kitchen Queue Viewer Access...");
    const t3 = await makeRequest(testServer, {
      path: "/api/restaurant/orders/kitchen",
      method: "GET",
      headers: authViewerA
    });
    assert.strictEqual(t3.statusCode, 200, "Expected 200 OK for VIEWER role (has restaurant.read)");
    assert.ok(Array.isArray(t3.body.orders));
    passedTests++;
    console.log("✓ Test 3 Passed: VIEWER role permitted to read kitchen queue");

    // =========================================================================
    // TEST 4: Multi-Tenant Isolation for Kitchen Queue
    // =========================================================================
    console.log("\nTest 4: Multi-Tenant Isolation for Kitchen Queue...");
    const t4A = await makeRequest(testServer, {
      path: "/api/restaurant/orders/kitchen",
      method: "GET",
      headers: authDeliveryA
    });
    const t4B = await makeRequest(testServer, {
      path: "/api/restaurant/orders/kitchen",
      method: "GET",
      headers: authDeliveryB
    });
    const idsA = t4A.body.orders.map(o => o.id);
    const idsB = t4B.body.orders.map(o => o.id);
    assert.ok(!idsA.includes(orderB1.id), "Restaurant A kitchen must NOT see Restaurant B orders");
    assert.ok(idsB.includes(orderB1.id), "Restaurant B kitchen should see its own order");
    assert.ok(!idsB.some(id => idsA.includes(id)), "No overlap between Restaurant A and B orders");
    passedTests++;
    console.log("✓ Test 4 Passed: Strict multi-tenant isolation enforced in kitchen queue");

    // =========================================================================
    // TEST 5: FIFO Queue Sorting Verification (created_at ASC)
    // =========================================================================
    console.log("\nTest 5: FIFO Queue Sorting Verification...");
    const queueOrders = t4A.body.orders;
    for (let i = 0; i < queueOrders.length - 1; i++) {
      const tPrev = new Date(queueOrders[i].createdAt).getTime();
      const tNext = new Date(queueOrders[i + 1].createdAt).getTime();
      assert.ok(tPrev <= tNext, `Order ${i} must be created before or equal to order ${i+1} for FIFO`);
    }
    passedTests++;
    console.log("✓ Test 5 Passed: Orders sorted FIFO (oldest first)");

    // =========================================================================
    // TEST 6: Kitchen Queue Single Status Filter (?status=NEW)
    // =========================================================================
    console.log("\nTest 6: Kitchen Queue Single Status Filter (?status=NEW)...");
    const t6 = await makeRequest(testServer, {
      path: "/api/restaurant/orders/kitchen?status=NEW",
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t6.statusCode, 200);
    assert.ok(t6.body.orders.every(o => o.status === "NEW"), "All returned orders must have status NEW");
    passedTests++;
    console.log(`✓ Test 6 Passed: Filtered to ${t6.body.orders.length} NEW orders`);

    // =========================================================================
    // TEST 7: Kitchen Queue Multi-Status Filter (?status=NEW,ACCEPTED)
    // =========================================================================
    console.log("\nTest 7: Kitchen Queue Multi-Status Filter (?status=NEW,ACCEPTED)...");
    const t7 = await makeRequest(testServer, {
      path: "/api/restaurant/orders/kitchen?status=NEW,ACCEPTED",
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t7.statusCode, 200);
    assert.ok(t7.body.orders.every(o => ["NEW", "ACCEPTED"].includes(o.status)));
    passedTests++;
    console.log("✓ Test 7 Passed: Multi-status comma-separated filtering verified");

    // =========================================================================
    // TEST 8: Kitchen Queue Branch Filter (?branchId=...)
    // =========================================================================
    console.log("\nTest 8: Kitchen Queue Branch Filter (?branchId=...)...");
    const t8 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/kitchen?branchId=${branchAId}`,
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t8.statusCode, 200);
    assert.ok(t8.body.orders.every(o => o.branchId === branchAId));
    passedTests++;
    console.log("✓ Test 8 Passed: Branch filtering verified");

    // =========================================================================
    // TEST 9: Kitchen Queue Table Filter (?tableId=...)
    // =========================================================================
    console.log("\nTest 9: Kitchen Queue Table Filter (?tableId=...)...");
    const t9 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/kitchen?tableId=${tableA1Id}`,
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t9.statusCode, 200);
    assert.ok(t9.body.orders.every(o => o.tableId === tableA1Id));
    assert.ok(t9.body.orders.length >= 2, "Expected at least 2 orders for Table A1");
    passedTests++;
    console.log("✓ Test 9 Passed: Table filtering verified");

    // =========================================================================
    // TEST 10: Kitchen Order Data Completeness
    // =========================================================================
    console.log("\nTest 10: Kitchen Order Data Completeness...");
    const sampleOrder = t4A.body.orders.find(o => o.id === orderA1.id);
    assert.ok(sampleOrder, "Order A1 should exist in response");
    assert.ok(sampleOrder.orderNumber, "Missing orderNumber");
    assert.strictEqual(sampleOrder.status, "NEW");
    assert.ok(sampleOrder.totalAmount !== undefined, "Missing totalAmount");
    assert.ok(sampleOrder.tableName || sampleOrder.tableNumber, "Missing table info");
    assert.ok(Array.isArray(sampleOrder.items) && sampleOrder.items.length > 0, "Missing order items");
    assert.strictEqual(sampleOrder.notes, "Less spicy please");
    passedTests++;
    console.log("✓ Test 10 Passed: Order object includes all required kitchen fields and metadata");

    // =========================================================================
    // TEST 11: Dietary Badge / Type on Order Line Items
    // =========================================================================
    console.log("\nTest 11: Dietary Badge / Type on Order Line Items...");
    const vegItem = sampleOrder.items.find(i => i.itemName === "Paneer Tikka");
    assert.ok(vegItem, "Paneer Tikka item expected");
    assert.strictEqual(vegItem.dietaryType, "VEG", "Expected dietaryType VEG");
    const sampleOrder2 = t4A.body.orders.find(o => o.id === orderA2.id);
    const nonVegItem = sampleOrder2.items.find(i => i.itemName === "Chicken Biryani");
    assert.ok(nonVegItem, "Chicken Biryani item expected");
    assert.strictEqual(nonVegItem.dietaryType, "NON_VEG", "Expected dietaryType NON_VEG");
    passedTests++;
    console.log("✓ Test 11 Passed: Dietary types correctly populated on line items");

    // =========================================================================
    // TEST 12: Single Order Detail Retrieval
    // =========================================================================
    console.log("\nTest 12: Single Order Detail Retrieval (GET /api/restaurant/orders/:id)...");
    const t12 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}`,
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t12.statusCode, 200);
    assert.strictEqual(t12.body.order.id, orderA1.id);
    assert.strictEqual(t12.body.order.orderNumber, "ORD-5001");
    passedTests++;
    console.log("✓ Test 12 Passed: Single order detail fetched successfully");

    // =========================================================================
    // TEST 13: Single Order Detail Multi-Tenant Isolation
    // =========================================================================
    console.log("\nTest 13: Single Order Detail Multi-Tenant Isolation...");
    const t13 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderB1.id}`,
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t13.statusCode, 404, "Expected 404 when accessing another restaurant's order");
    passedTests++;
    console.log("✓ Test 13 Passed: Cross-tenant single order access blocked with 404");

    // =========================================================================
    // TEST 14: Non-existent Order Detail Retrieval
    // =========================================================================
    console.log("\nTest 14: Non-existent Order Detail Retrieval...");
    const t14 = await makeRequest(testServer, {
      path: "/api/restaurant/orders/non-existent-order-id-xyz",
      method: "GET",
      headers: authDeliveryA
    });
    assert.strictEqual(t14.statusCode, 404);
    passedTests++;
    console.log("✓ Test 14 Passed: Non-existent order returns 404");

    // =========================================================================
    // TEST 15: Order Status Update Auth Required
    // =========================================================================
    console.log("\nTest 15: Order Status Update Auth Required...");
    const t15 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH"
    }, { status: "ACCEPTED" });
    assert.strictEqual(t15.statusCode, 401, "Expected 401 Unauthorized without auth header");
    passedTests++;
    console.log("✓ Test 15 Passed: Unauthenticated status update rejected with 401");

    // =========================================================================
    // TEST 16: RBAC Protection: VIEWER role cannot update order status
    // =========================================================================
    console.log("\nTest 16: RBAC Protection: VIEWER role cannot update order status...");
    const t16 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authViewerA
    }, { status: "ACCEPTED" });
    assert.strictEqual(t16.statusCode, 403, "Expected 403 Forbidden for VIEWER role (lacks restaurant.write)");
    passedTests++;
    console.log("✓ Test 16 Passed: VIEWER role rejected with 403 Forbidden");

    // =========================================================================
    // TEST 17: RBAC Protection: Customer Session Token cannot update status
    // =========================================================================
    console.log("\nTest 17: RBAC Protection: Customer cannot update status...");
    const customerToken = generateCustomerSessionToken(restAId, tableA1Id, branchAId, sessA1.id);
    const t17 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: { "X-Session-Token": customerToken }
    }, { status: "ACCEPTED" });
    assert.ok([401, 403].includes(t17.statusCode), "Expected 401/403 when customer attempts staff status patch");
    passedTests++;
    console.log("✓ Test 17 Passed: Customer token rejected from staff status modification");

    // =========================================================================
    // TEST 18: Missing Status in Body Rejection
    // =========================================================================
    console.log("\nTest 18: Missing Status in Body Rejection...");
    const t18 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, {});
    assert.strictEqual(t18.statusCode, 400, "Expected 400 when status is missing in payload");
    passedTests++;
    console.log("✓ Test 18 Passed: Missing status in payload rejected with 400");

    // =========================================================================
    // TEST 19: Invalid Status Value Rejection
    // =========================================================================
    console.log("\nTest 19: Invalid Status Value Rejection...");
    const t19 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "FLYING" });
    assert.strictEqual(t19.statusCode, 400, "Expected 400 on invalid status enum");
    passedTests++;
    console.log("✓ Test 19 Passed: Unknown status enum rejected with 400");

    // =========================================================================
    // TEST 20: Valid State Transition 1: NEW -> ACCEPTED
    // =========================================================================
    console.log("\nTest 20: Valid Transition 1: NEW -> ACCEPTED...");
    const t20 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "ACCEPTED" });
    assert.strictEqual(t20.statusCode, 200, "Expected 200 OK on transition to ACCEPTED");
    assert.strictEqual(t20.body.order.status, "ACCEPTED");
    assert.ok(t20.body.order.acceptedAt, "acceptedAt timestamp must be set");
    passedTests++;
    console.log("✓ Test 20 Passed: Order transitioned to ACCEPTED with acceptedAt timestamp");

    // =========================================================================
    // TEST 21: Valid State Transition 2: ACCEPTED -> PREPARING
    // =========================================================================
    console.log("\nTest 21: Valid Transition 2: ACCEPTED -> PREPARING...");
    const t21 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "PREPARING" });
    assert.strictEqual(t21.statusCode, 200);
    assert.strictEqual(t21.body.order.status, "PREPARING");
    assert.ok(t21.body.order.preparingAt, "preparingAt timestamp must be set");
    passedTests++;
    console.log("✓ Test 21 Passed: Order transitioned to PREPARING with preparingAt timestamp");

    // =========================================================================
    // TEST 22: Valid State Transition 3: PREPARING -> READY
    // =========================================================================
    console.log("\nTest 22: Valid Transition 3: PREPARING -> READY...");
    const t22 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "READY" });
    assert.strictEqual(t22.statusCode, 200);
    assert.strictEqual(t22.body.order.status, "READY");
    assert.ok(t22.body.order.readyAt, "readyAt timestamp must be set");
    passedTests++;
    console.log("✓ Test 22 Passed: Order transitioned to READY with readyAt timestamp");

    // =========================================================================
    // TEST 23: Valid State Transition 4: READY -> SERVED
    // =========================================================================
    console.log("\nTest 23: Valid Transition 4: READY -> SERVED...");
    const t23 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "SERVED" });
    assert.strictEqual(t23.statusCode, 200);
    assert.strictEqual(t23.body.order.status, "SERVED");
    assert.ok(t23.body.order.servedAt, "servedAt timestamp must be set");
    passedTests++;
    console.log("✓ Test 23 Passed: Order transitioned to SERVED with servedAt timestamp");

    // =========================================================================
    // TEST 24: Valid Cancellation from NEW: NEW -> CANCELLED
    // =========================================================================
    console.log("\nTest 24: Valid Cancellation from NEW: NEW -> CANCELLED...");
    const t24 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA2.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "CANCELLED", cancelReason: "Item 86'd out of stock" });
    assert.strictEqual(t24.statusCode, 200);
    assert.strictEqual(t24.body.order.status, "CANCELLED");
    assert.ok(t24.body.order.cancelledAt, "cancelledAt timestamp must be set");
    assert.strictEqual(t24.body.order.cancelReason, "Item 86'd out of stock");
    passedTests++;
    console.log("✓ Test 24 Passed: NEW order cancelled with reason recorded");

    // =========================================================================
    // TEST 25: Valid Cancellation from ACCEPTED: ACCEPTED -> CANCELLED
    // =========================================================================
    console.log("\nTest 25: Valid Cancellation from ACCEPTED: ACCEPTED -> CANCELLED...");
    // First accept orderA3
    await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA3.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "ACCEPTED" });

    // Now cancel from ACCEPTED
    const t25 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA3.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "CANCELLED", cancelReason: "Guest changed mind" });
    assert.strictEqual(t25.statusCode, 200);
    assert.strictEqual(t25.body.order.status, "CANCELLED");
    assert.ok(t25.body.order.cancelledAt);
    assert.strictEqual(t25.body.order.cancelReason, "Guest changed mind");
    passedTests++;
    console.log("✓ Test 25 Passed: ACCEPTED order cancelled successfully");

    // =========================================================================
    // TEST 26: Invalid Transition Rejection: NEW -> READY (Skips ACCEPTED & PREPARING)
    // =========================================================================
    console.log("\nTest 26: Invalid Transition Rejection: NEW -> READY...");
    // Create fresh order for invalid transition tests
    const freshOrder1 = await restaurantStore.placeOrder({
      id: `ord-p5-fresh1-${runId}`,
      restaurantId: restAId,
      branchId: branchAId,
      tableId: tableA1Id,
      tableSessionId: sessA1.id,
      orderNumber: "ORD-9901",
      status: "NEW"
    }, [{ itemName: "Roti", quantity: 2, unitPrice: 30, taxRate: 5.0 }], sessA1.id);

    const t26 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "READY" });
    assert.strictEqual(t26.statusCode, 400, "Expected 400 on illegal transition NEW -> READY");
    passedTests++;
    console.log("✓ Test 26 Passed: Illegal transition NEW -> READY rejected with 400");

    // =========================================================================
    // TEST 27: Invalid Transition Rejection: NEW -> SERVED
    // =========================================================================
    console.log("\nTest 27: Invalid Transition Rejection: NEW -> SERVED...");
    const t27 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "SERVED" });
    assert.strictEqual(t27.statusCode, 400, "Expected 400 on illegal transition NEW -> SERVED");
    passedTests++;
    console.log("✓ Test 27 Passed: Illegal transition NEW -> SERVED rejected with 400");

    // =========================================================================
    // TEST 28: Invalid Backward Transition Rejection: PREPARING -> ACCEPTED
    // =========================================================================
    console.log("\nTest 28: Invalid Backward Transition: PREPARING -> ACCEPTED...");
    await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "ACCEPTED" });
    await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "PREPARING" });

    const t28 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "ACCEPTED" });
    assert.strictEqual(t28.statusCode, 400, "Expected 400 on backward transition PREPARING -> ACCEPTED");
    passedTests++;
    console.log("✓ Test 28 Passed: Backward transition PREPARING -> ACCEPTED rejected with 400");

    // =========================================================================
    // TEST 29: Terminal State Immutability: SERVED -> anything
    // =========================================================================
    console.log("\nTest 29: Terminal State Immutability: SERVED -> anything...");
    const t29 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "CANCELLED" });
    assert.strictEqual(t29.statusCode, 400, "Expected 400 attempting to transition terminal SERVED order");
    passedTests++;
    console.log("✓ Test 29 Passed: Terminal state SERVED cannot be mutated");

    // =========================================================================
    // TEST 30: Terminal State Immutability: CANCELLED -> anything
    // =========================================================================
    console.log("\nTest 30: Terminal State Immutability: CANCELLED -> anything...");
    const t30 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${orderA2.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "ACCEPTED" });
    assert.strictEqual(t30.statusCode, 400, "Expected 400 attempting to transition terminal CANCELLED order");
    passedTests++;
    console.log("✓ Test 30 Passed: Terminal state CANCELLED cannot be mutated");

    // =========================================================================
    // TEST 31: Concurrency / Optimistic Locking Protection (409 Conflict)
    // =========================================================================
    console.log("\nTest 31: Concurrency / Optimistic Locking Protection...");
    // freshOrder1 is currently in PREPARING.
    // Client sends currentStatus = "ACCEPTED" (stale)
    const t31 = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "READY", currentStatus: "ACCEPTED" });
    assert.strictEqual(t31.statusCode, 409, "Expected 409 Conflict on stale expected status");
    assert.strictEqual(t31.body.currentStatus, "PREPARING");

    // Now send with correct currentStatus = "PREPARING" -> should succeed 200
    const t31Success = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "READY", currentStatus: "PREPARING" });
    assert.strictEqual(t31Success.statusCode, 200);
    assert.strictEqual(t31Success.body.order.status, "READY");
    passedTests++;
    console.log("✓ Test 31 Passed: Stale optimistic status rejected with 409 Conflict; matching status succeeds");

    // =========================================================================
    // TEST 32: Table Occupancy Synchronization & Audit Trail Verification
    // =========================================================================
    console.log("\nTest 32: Table Occupancy Synchronization & Audit Trail...");
    // Table A2 currently had orderA3 (which was CANCELLED in Test 25).
    // Let's check Table A2 status.
    const tableA2Check = restaurantStore.getTableById(restAId, tableA2Id);
    assert.strictEqual(tableA2Check.status, "AVAILABLE", "Table A2 should be AVAILABLE after all orders cancelled/served");

    // Now serve the remaining order on Table A1 (freshOrder1)
    await makeRequest(testServer, {
      path: `/api/restaurant/orders/${freshOrder1.id}/status`,
      method: "PATCH",
      headers: authDeliveryA
    }, { status: "SERVED" });

    const tableA1Check = restaurantStore.getTableById(restAId, tableA1Id);
    assert.strictEqual(tableA1Check.status, "AVAILABLE", "Table A1 should revert to AVAILABLE once all orders are SERVED");

    // Verify audit logs exist with ORDER_STATUS_CHANGED
    const auditLogs = securityAuditStore.getSecurityAuditLogs();
    const orderAuditEvents = auditLogs.filter(e => e.type === "ORDER_STATUS_CHANGED");
    assert.ok(orderAuditEvents.length > 0, "Expected at least one ORDER_STATUS_CHANGED audit event");
    const newestAudit = orderAuditEvents[0];
    assert.strictEqual(newestAudit.details.toStatus, "SERVED");
    assert.ok(newestAudit.userId);
    assert.ok(orderAuditEvents.some(e => e.details.toStatus === "CANCELLED"));

    passedTests++;
    console.log("✓ Test 32 Passed: Table status synchronized to AVAILABLE and ORDER_STATUS_CHANGED audit events logged");

    console.log("\n===============================================================");
    console.log(`PHASE 5 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================");

  } finally {
    await new Promise((resolve) => testServer.close(resolve));
    console.log("Phase 5 Test server closed.");
    try {
      await Promise.race([
        closePool(),
        new Promise(r => setTimeout(r, 1000))
      ]);
    } catch (e) {}
  }
}

if (require.main === module) {
  runSuite()
    .then(() => {
      console.log("Phase 5 test execution completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ PHASE 5 SUITE FAILURE:", err);
      process.exit(1);
    });
}

module.exports = { runSuite };
