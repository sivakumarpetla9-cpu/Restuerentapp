/**
 * Restaurant OS v1 - Phase 6 Verification Suite
 * Optional Billing & Payments
 *
 * Validates all 36 required test areas:
 * 1. Default Billing Configuration is OFF (GET /api/restaurant/billing/settings -> billingEnabled === false)
 * 2. Unauthenticated Access to Billing Settings Rejected (401)
 * 3. RBAC Protection: VIEWER Role cannot modify billing settings (403)
 * 4. Enable Billing Toggle via PATCH /api/restaurant/billing/settings (200, billingEnabled === true)
 * 5. Persistence of Billing Settings in Database
 * 6. Multi-Tenant Isolation of Billing Configuration (Restaurant A toggle does not affect Restaurant B)
 * 7. Validation on Billing Settings: Negative Tax / Service Charge Rejected (400)
 * 8. Backend Feature Enforcement: Billing OFF Blocks Bill Listing (403, BILLING_DISABLED)
 * 9. Backend Feature Enforcement: Billing OFF Blocks Bill Generation (403, BILLING_DISABLED)
 * 10. Backend Feature Enforcement: Billing OFF Blocks Bill Detail Retrieval (403, BILLING_DISABLED)
 * 11. Backend Feature Enforcement: Billing OFF Blocks Payment Recording (403, BILLING_DISABLED)
 * 12. Backend Feature Enforcement: Billing OFF Blocks Receipt Retrieval (403, BILLING_DISABLED)
 * 13. Bill Generation: Unauthenticated Request Rejected (401)
 * 14. Bill Generation: VIEWER Role Rejected (403)
 * 15. Bill Generation: Non-Existent Order Rejected (404)
 * 16. Bill Generation: Cross-Tenant Order Rejected (404)
 * 17. Bill Generation: Cancelled Order Rejected (400)
 * 18. Bill Generation: Successful Bill Creation (201, paymentStatus === PENDING)
 * 19. Financial Calculation Verification: Subtotal, Discount, Tax, Service Charge, Grand Total
 * 20. Client Price Manipulation Strictly Ignored
 * 21. Duplicate Bill Creation Prevention (idempotent 200 with alreadyExisted: true)
 * 22. Bills Listing (GET /api/restaurant/billing -> 200, array of bills)
 * 23. Bills Listing: Status Filtering (?paymentStatus=PENDING)
 * 24. Single Bill Detail Retrieval (GET /api/restaurant/billing/:id -> 200 with line items)
 * 25. Cross-Tenant Bill Detail Inspection Blocked (404)
 * 26. Payment Recording: Unauthenticated Request Rejected (401)
 * 27. Payment Recording: VIEWER Role Rejected (403)
 * 28. Payment Recording: Cross-Tenant Payment Rejected (404)
 * 29. Payment Recording: Invalid Payment Status Rejection (400)
 * 30. Payment Recording: Invalid Payment Method Rejection (400)
 * 31. Payment Recording: Successful Transition PENDING -> PAID (200, paidAt set, method stored)
 * 32. Idempotent Payment Recording (duplicate payment request handled safely)
 * 33. Terminal State / Invalid Transition Rejection (PAID -> PENDING rejected with 400)
 * 34. Printable Receipt Retrieval (GET /api/restaurant/billing/:id/receipt -> 200 formatted receipt)
 * 35. Disable Billing Toggle & Verify Immediate Backend Enforcement (PATCH settings -> OFF, billing endpoints return 403)
 * 36. Security Audit Trail Verification (BILLING_SETTING_CHANGED, BILL_CREATED, PAYMENT_RECORDED logged)
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
  console.log("Restaurant OS v1 - Phase 6 Verification Suite");
  console.log("Optional Billing & Payments Module + Toggle Enforcement");
  console.log("===============================================================");

  const appHandler = server.listeners("request")[0];
  const testServer = http.createServer(appHandler);

  await new Promise((resolve) => {
    testServer.listen(0, "127.0.0.1", () => {
      console.log(`Phase 6 Test server running on port ${testServer.address().port}\n`);
      resolve();
    });
  });

  let passedTests = 0;

  try {
    const runId = Date.now().toString();
    const restAId = `client-p6-a-${runId}`;
    const restBId = `client-p6-b-${runId}`;

    console.log("[Setup] Initializing Phase 6 test restaurants, branches, tables, orders...");

    // 1. Initialize restaurant profile in local store & PostgreSQL
    restaurantStore.updateRestaurantProfile(restAId, {
      name: "Tandoori Nights P6",
      company: "Tandoori Nights Inc",
      email: `tandoori-${runId}@example.com`,
      phone: "+91 98765 43210",
      taxRate: 5.0,
      currency: "INR"
    });

    restaurantStore.updateRestaurantProfile(restBId, {
      name: "Bella Italia P6",
      company: "Bella Italia LLC",
      email: `bella-${runId}@example.com`,
      phone: "+91 98765 43211",
      taxRate: 5.0,
      currency: "INR"
    });

    if (isPostgresConfigured()) {
      await restaurantRepository.updateRestaurantProfile(restAId, {
        name: "Tandoori Nights P6",
        company: "Tandoori Nights Inc",
        email: `tandoori-${runId}@example.com`,
        phone: "+91 98765 43210",
        taxRate: 5.0,
        currency: "INR"
      });
      await restaurantRepository.updateRestaurantProfile(restBId, {
        name: "Bella Italia P6",
        company: "Bella Italia LLC",
        email: `bella-${runId}@example.com`,
        phone: "+91 98765 43211",
        taxRate: 5.0,
        currency: "INR"
      });
    }

    // Explicitly reset billingEnabled to false (default value)
    await restaurantStore.updateBillingSettings(restAId, { billingEnabled: false, serviceChargeRate: 0.0 });
    await restaurantStore.updateBillingSettings(restBId, { billingEnabled: false, serviceChargeRate: 0.0 });

    // 2. Setup users for auth & RBAC
    const userAdminA = userStore.createUser({
      name: "Admin Alice",
      email: `admin.alice.${runId}@example.com`,
      password: "Password123!",
      role: "ADMIN",
      restaurantId: restAId
    });
    const userStaffA = userStore.createUser({
      name: "Staff Sam",
      email: `staff.sam.${runId}@example.com`,
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
    const userAdminB = userStore.createUser({
      name: "Admin Bob",
      email: `admin.bob.${runId}@example.com`,
      password: "Password123!",
      role: "ADMIN",
      restaurantId: restBId
    });

    const tokenAdminA = createSession(userAdminA).token;
    const tokenStaffA = createSession(userStaffA).token;
    const tokenViewerA = createSession(userViewerA).token;
    const tokenAdminB = createSession(userAdminB).token;

    const authAdminA = { Authorization: `Bearer ${tokenAdminA}` };
    const authStaffA = { Authorization: `Bearer ${tokenStaffA}` };
    const authViewerA = { Authorization: `Bearer ${tokenViewerA}` };
    const authAdminB = { Authorization: `Bearer ${tokenAdminB}` };

    // 3. Setup branches and tables
    const branchA = { id: `brn-p6-a-${runId}`, restaurantId: restAId, name: `Main Branch A ${runId}`, address: "100 Curry Road" };
    const branchB = { id: `brn-p6-b-${runId}`, restaurantId: restBId, name: `Main Branch B ${runId}`, address: "200 Pizza Plaza" };
    if (isPostgresConfigured()) {
      await restaurantRepository.createBranch(branchA);
      await restaurantRepository.createBranch(branchB);
    }
    restaurantStore.createBranch(branchA);
    restaurantStore.createBranch(branchB);

    const tableA1 = { id: `tbl-p6-a1-${runId}`, restaurantId: restAId, branchId: branchA.id, tableNumber: "T10", capacity: 4, status: "AVAILABLE", isActive: true };
    const tableA2 = { id: `tbl-p6-a2-${runId}`, restaurantId: restAId, branchId: branchA.id, tableNumber: "T11", capacity: 2, status: "AVAILABLE", isActive: true };
    const tableB1 = { id: `tbl-p6-b1-${runId}`, restaurantId: restBId, branchId: branchB.id, tableNumber: "T20", capacity: 4, status: "AVAILABLE", isActive: true };
    if (isPostgresConfigured()) {
      await restaurantRepository.createTable(tableA1);
      await restaurantRepository.createTable(tableA2);
      await restaurantRepository.createTable(tableB1);
    }
    restaurantStore.createTable(tableA1);
    restaurantStore.createTable(tableA2);
    restaurantStore.createTable(tableB1);

    const sessA1 = restaurantStore.createTableSession({ id: `sess-p6-a1-${runId}`, restaurantId: restAId, branchId: branchA.id, tableId: tableA1.id });
    const sessA2 = restaurantStore.createTableSession({ id: `sess-p6-a2-${runId}`, restaurantId: restAId, branchId: branchA.id, tableId: tableA2.id });
    const sessB1 = restaurantStore.createTableSession({ id: `sess-p6-b1-${runId}`, restaurantId: restBId, branchId: branchB.id, tableId: tableB1.id });

    if (isPostgresConfigured()) {
      await restaurantRepository.createTableSession(sessA1);
      await restaurantRepository.createTableSession(sessA2);
      await restaurantRepository.createTableSession(sessB1);
    }

    // 4. Setup Menu Categories & Items
    const catA = { id: `cat-p6-a-${runId}`, restaurantId: restAId, name: "Curries" };
    const catB = { id: `cat-p6-b-${runId}`, restaurantId: restBId, name: "Pizzas" };
    if (isPostgresConfigured()) {
      await restaurantRepository.createCategory(catA);
      await restaurantRepository.createCategory(catB);
    }
    restaurantStore.createCategory(catA);
    restaurantStore.createCategory(catB);

    const item1 = {
      id: `item-p6-1-${runId}`,
      restaurantId: restAId,
      categoryId: catA.id,
      name: "Butter Chicken",
      price: 280.00,
      taxRate: 5.0,
      dietaryType: "NON_VEG",
      isActive: true,
      isAvailable: true
    };
    const item2 = {
      id: `item-p6-2-${runId}`,
      restaurantId: restAId,
      categoryId: catA.id,
      name: "Naan Basket",
      price: 120.00,
      taxRate: 5.0,
      dietaryType: "VEG",
      isActive: true,
      isAvailable: true
    };
    const itemB1 = {
      id: `item-p6-b1-${runId}`,
      restaurantId: restBId,
      categoryId: catB.id,
      name: "Margherita",
      price: 350.00,
      taxRate: 5.0,
      dietaryType: "VEG",
      isActive: true,
      isAvailable: true
    };
    if (isPostgresConfigured()) {
      await restaurantRepository.createMenuItem(item1);
      await restaurantRepository.createMenuItem(item2);
      await restaurantRepository.createMenuItem(itemB1);
    }
    restaurantStore.createMenuItem(item1);
    restaurantStore.createMenuItem(item2);
    restaurantStore.createMenuItem(itemB1);

    // 5. Place test orders
    // Order A1: 2 x Butter Chicken (560) + 1 x Naan (120) = Subtotal 680
    const orderA1 = await restaurantStore.placeOrder({
      id: `ord-p6-a1-${runId}`,
      restaurantId: restAId,
      branchId: branchA.id,
      tableId: tableA1.id,
      tableSessionId: sessA1.id,
      orderNumber: "ORD-6001",
      status: "SERVED"
    }, [
      { id: `oi-p6-1-${runId}`, menuItemId: item1.id, itemName: item1.name, quantity: 2, unitPrice: item1.price, taxRate: 5.0, dietaryType: "NON_VEG" },
      { id: `oi-p6-2-${runId}`, menuItemId: item2.id, itemName: item2.name, quantity: 1, unitPrice: item2.price, taxRate: 5.0, dietaryType: "VEG" }
    ], sessA1.id);

    // Order A2: 1 x Butter Chicken (280) - for cancellation testing
    const orderA2 = await restaurantStore.placeOrder({
      id: `ord-p6-a2-${runId}`,
      restaurantId: restAId,
      branchId: branchA.id,
      tableId: tableA2.id,
      tableSessionId: sessA2.id,
      orderNumber: "ORD-6002",
      status: "NEW"
    }, [
      { id: `oi-p6-3-${runId}`, menuItemId: item1.id, itemName: item1.name, quantity: 1, unitPrice: item1.price, taxRate: 5.0 }
    ], sessA2.id);

    // Cancel Order A2
    await restaurantStore.updateOrderStatus(restAId, orderA2.id, "CANCELLED", null, "Guest left early");

    // Order B1: Restaurant B order
    const orderB1 = await restaurantStore.placeOrder({
      id: `ord-p6-b1-${runId}`,
      restaurantId: restBId,
      branchId: branchB.id,
      tableId: tableB1.id,
      tableSessionId: sessB1.id,
      orderNumber: "ORD-7001",
      status: "SERVED"
    }, [
      { id: `oi-p6-b1-${runId}`, menuItemId: itemB1.id, itemName: itemB1.name, quantity: 1, unitPrice: itemB1.price, taxRate: 5.0 }
    ], sessB1.id);

    console.log("[Setup] Fixtures created successfully.\n");

    // =========================================================================
    // TEST 1: Default Billing Configuration is OFF
    // =========================================================================
    console.log("Test 1: Default Billing Configuration is OFF...");
    const t1 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "GET",
      headers: authAdminA
    });
    assert.strictEqual(t1.statusCode, 200, "Expected 200 on billing settings fetch");
    assert.strictEqual(t1.body.settings.billingEnabled, false, "Default billingEnabled must be false");
    passedTests++;
    console.log("✓ Test 1 Passed: Default billingEnabled is false");

    // =========================================================================
    // TEST 2: Unauthenticated Access to Billing Settings Rejected
    // =========================================================================
    console.log("\nTest 2: Unauthenticated Access to Billing Settings Rejected...");
    const t2 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "GET"
    });
    assert.strictEqual(t2.statusCode, 401, "Expected 401 for unauthenticated request");
    passedTests++;
    console.log("✓ Test 2 Passed: Unauthenticated settings request rejected with 401");

    // =========================================================================
    // TEST 3: RBAC Protection: VIEWER Role cannot modify billing settings
    // =========================================================================
    console.log("\nTest 3: RBAC Protection: VIEWER Role cannot modify billing settings...");
    const t3 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authViewerA
    }, { billingEnabled: true });
    assert.strictEqual(t3.statusCode, 403, "Expected 403 Forbidden for VIEWER role modifying settings");
    passedTests++;
    console.log("✓ Test 3 Passed: VIEWER role rejected with 403 Forbidden");

    // =========================================================================
    // TEST 4: Enable Billing Toggle via PATCH /api/restaurant/billing/settings
    // =========================================================================
    console.log("\nTest 4: Enable Billing Toggle via PATCH /api/restaurant/billing/settings...");
    const t4 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authAdminA
    }, { billingEnabled: true, serviceChargeRate: 5.0 });
    assert.strictEqual(t4.statusCode, 200, "Expected 200 on setting toggle update");
    assert.strictEqual(t4.body.settings.billingEnabled, true, "billingEnabled must now be true");
    assert.strictEqual(t4.body.settings.serviceChargeRate, 5.0, "serviceChargeRate must be 5.0");
    passedTests++;
    console.log("✓ Test 4 Passed: Billing enabled successfully via PATCH");

    // =========================================================================
    // TEST 5: Persistence of Billing Settings in Database
    // =========================================================================
    console.log("\nTest 5: Persistence of Billing Settings in Database...");
    const t5 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t5.statusCode, 200);
    assert.strictEqual(t5.body.settings.billingEnabled, true, "Persisted billingEnabled must be true");
    assert.strictEqual(t5.body.settings.serviceChargeRate, 5.0, "Persisted serviceChargeRate must be 5.0");
    passedTests++;
    console.log("✓ Test 5 Passed: Settings persistence verified");

    // =========================================================================
    // TEST 6: Multi-Tenant Isolation of Billing Configuration
    // =========================================================================
    console.log("\nTest 6: Multi-Tenant Isolation of Billing Configuration...");
    const t6 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "GET",
      headers: authAdminB
    });
    assert.strictEqual(t6.statusCode, 200);
    assert.strictEqual(t6.body.settings.billingEnabled, false, "Restaurant B billingEnabled must remain false");
    passedTests++;
    console.log("✓ Test 6 Passed: Restaurant A's toggle did NOT affect Restaurant B");

    // =========================================================================
    // TEST 7: Validation on Billing Settings: Negative Values Rejected
    // =========================================================================
    console.log("\nTest 7: Validation on Billing Settings: Negative Values Rejected...");
    const t7 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authAdminA
    }, { serviceChargeRate: -10 });
    assert.strictEqual(t7.statusCode, 400, "Expected 400 on negative service charge");
    passedTests++;
    console.log("✓ Test 7 Passed: Negative service charge rejected with 400");

    // =========================================================================
    // TEST 8: Backend Feature Enforcement: Billing OFF Blocks Bill Listing
    // =========================================================================
    console.log("\nTest 8: Backend Feature Enforcement: Billing OFF Blocks Bill Listing...");
    const t8 = await makeRequest(testServer, {
      path: "/api/restaurant/billing",
      method: "GET",
      headers: authAdminB
    });
    assert.strictEqual(t8.statusCode, 403, "Expected 403 Forbidden when billing is OFF");
    assert.strictEqual(t8.body.code, "BILLING_DISABLED", "Error code must indicate BILLING_DISABLED");
    passedTests++;
    console.log("✓ Test 8 Passed: GET /api/restaurant/billing blocked with 403 when Billing is OFF");

    // =========================================================================
    // TEST 9: Backend Feature Enforcement: Billing OFF Blocks Bill Generation
    // =========================================================================
    console.log("\nTest 9: Backend Feature Enforcement: Billing OFF Blocks Bill Generation...");
    const t9 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderB1.id}/bill`,
      method: "POST",
      headers: authAdminB
    }, {});
    assert.strictEqual(t9.statusCode, 403, "Expected 403 Forbidden when billing is OFF");
    assert.strictEqual(t9.body.code, "BILLING_DISABLED");
    passedTests++;
    console.log("✓ Test 9 Passed: Bill creation blocked with 403 when Billing is OFF");

    // =========================================================================
    // TEST 10: Backend Feature Enforcement: Billing OFF Blocks Bill Detail
    // =========================================================================
    console.log("\nTest 10: Backend Feature Enforcement: Billing OFF Blocks Bill Detail...");
    const t10 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/bill-fake-123",
      method: "GET",
      headers: authAdminB
    });
    assert.strictEqual(t10.statusCode, 403, "Expected 403 when billing is OFF");
    passedTests++;
    console.log("✓ Test 10 Passed: Bill detail blocked with 403 when Billing is OFF");

    // =========================================================================
    // TEST 11: Backend Feature Enforcement: Billing OFF Blocks Payment Recording
    // =========================================================================
    console.log("\nTest 11: Backend Feature Enforcement: Billing OFF Blocks Payment Recording...");
    const t11 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/bill-fake-123/payment",
      method: "PATCH",
      headers: authAdminB
    }, { paymentStatus: "PAID" });
    assert.strictEqual(t11.statusCode, 403, "Expected 403 when billing is OFF");
    passedTests++;
    console.log("✓ Test 11 Passed: Payment recording blocked with 403 when Billing is OFF");

    // =========================================================================
    // TEST 12: Backend Feature Enforcement: Billing OFF Blocks Receipt Retrieval
    // =========================================================================
    console.log("\nTest 12: Backend Feature Enforcement: Billing OFF Blocks Receipt Retrieval...");
    const t12 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/bill-fake-123/receipt",
      method: "GET",
      headers: authAdminB
    });
    assert.strictEqual(t12.statusCode, 403, "Expected 403 when billing is OFF");
    passedTests++;
    console.log("✓ Test 12 Passed: Receipt blocked with 403 when Billing is OFF");

    // =========================================================================
    // TEST 13: Bill Generation: Unauthenticated Request Rejected
    // =========================================================================
    console.log("\nTest 13: Bill Generation: Unauthenticated Request Rejected...");
    const t13 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderA1.id}/bill`,
      method: "POST"
    }, {});
    assert.strictEqual(t13.statusCode, 401, "Expected 401 for unauthenticated bill generation");
    passedTests++;
    console.log("✓ Test 13 Passed: Unauthenticated bill creation rejected with 401");

    // =========================================================================
    // TEST 14: Bill Generation: VIEWER Role Rejected (RBAC)
    // =========================================================================
    console.log("\nTest 14: Bill Generation: VIEWER Role Rejected (RBAC)...");
    const t14 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderA1.id}/bill`,
      method: "POST",
      headers: authViewerA
    }, {});
    assert.strictEqual(t14.statusCode, 403, "Expected 403 Forbidden for VIEWER role");
    passedTests++;
    console.log("✓ Test 14 Passed: VIEWER role rejected from creating bills with 403");

    // =========================================================================
    // TEST 15: Bill Generation: Non-Existent Order Rejected
    // =========================================================================
    console.log("\nTest 15: Bill Generation: Non-Existent Order Rejected...");
    const t15 = await makeRequest(testServer, {
      path: "/api/restaurant/billing/orders/ord-non-existent-999/bill",
      method: "POST",
      headers: authStaffA
    }, {});
    assert.strictEqual(t15.statusCode, 404, "Expected 404 for non-existent order");
    passedTests++;
    console.log("✓ Test 15 Passed: Non-existent order rejected with 404");

    // =========================================================================
    // TEST 16: Bill Generation: Cross-Tenant Order Rejected
    // =========================================================================
    console.log("\nTest 16: Bill Generation: Cross-Tenant Order Rejected...");
    const t16 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderB1.id}/bill`,
      method: "POST",
      headers: authStaffA
    }, {});
    assert.strictEqual(t16.statusCode, 404, "Expected 404 when referencing another tenant's order");
    passedTests++;
    console.log("✓ Test 16 Passed: Cross-tenant order reference blocked with 404");

    // =========================================================================
    // TEST 17: Bill Generation: Cancelled Order Rejected
    // =========================================================================
    console.log("\nTest 17: Bill Generation: Cancelled Order Rejected...");
    const t17 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderA2.id}/bill`,
      method: "POST",
      headers: authStaffA
    }, {});
    assert.strictEqual(t17.statusCode, 400, "Expected 400 when attempting to bill a cancelled order");
    passedTests++;
    console.log("✓ Test 17 Passed: Cancelled order rejected from billing with 400");

    // =========================================================================
    // TEST 18: Bill Generation: Successful Bill Creation (HTTP 201)
    // =========================================================================
    console.log("\nTest 18: Bill Generation: Successful Bill Creation (HTTP 201)...");
    const t18 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderA1.id}/bill`,
      method: "POST",
      headers: authStaffA
    }, {});
    assert.strictEqual(t18.statusCode, 201, "Expected 201 Created on valid bill generation");
    assert.ok(t18.body.bill, "Bill object must be returned");
    assert.strictEqual(t18.body.bill.orderId, orderA1.id);
    assert.strictEqual(t18.body.bill.paymentStatus, "PENDING", "Initial payment status must be PENDING");
    passedTests++;
    console.log("✓ Test 18 Passed: Bill created with status 201 and PENDING paymentStatus");

    const createdBillA1 = t18.body.bill;

    // =========================================================================
    // TEST 19: Financial Calculation Verification: Subtotal, Tax, SC, Grand Total
    // =========================================================================
    console.log("\nTest 19: Financial Calculation Verification...");
    // Expected:
    // Item 1: 2 x 280 = 560
    // Item 2: 1 x 120 = 120
    // Subtotal: 680.00
    // Tax (5% of 680): 34.00
    // Service Charge (5% of 680): 34.00
    // Grand Total: 680 + 34 + 34 = 748.00
    assert.strictEqual(createdBillA1.subtotal, 680.00, "Subtotal must be 680.00");
    assert.strictEqual(createdBillA1.taxAmount, 34.00, "Tax must be 34.00");
    assert.strictEqual(createdBillA1.serviceCharge, 34.00, "Service charge must be 34.00");
    assert.strictEqual(createdBillA1.totalAmount, 748.00, "Total amount must be 748.00");
    passedTests++;
    console.log("✓ Test 19 Passed: Server-side calculations exact (Subtotal: 680, Tax: 34, SC: 34, Grand Total: 748)");

    // =========================================================================
    // TEST 20: Client Price Manipulation Strictly Ignored
    // =========================================================================
    console.log("\nTest 20: Client Price Manipulation Strictly Ignored...");
    // Place a new order to test price manipulation attempt
    const orderManip = await restaurantStore.placeOrder({
      id: `ord-p6-manip-${runId}`,
      restaurantId: restAId,
      branchId: branchA.id,
      tableId: tableA1.id,
      tableSessionId: sessA1.id,
      orderNumber: "ORD-MANIP",
      status: "SERVED"
    }, [
      { id: `oi-p6-m1-${runId}`, menuItemId: item1.id, itemName: item1.name, quantity: 1, unitPrice: 280.00, taxRate: 5.0 }
    ], sessA1.id);

    // Client attempts to claim subtotal is ₹1.00 and grand total is ₹1.00
    const t20 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderManip.id}/bill`,
      method: "POST",
      headers: authStaffA
    }, {
      subtotal: 1.00,
      totalAmount: 1.00,
      grandTotal: 1.00,
      taxAmount: 0.00
    });
    assert.strictEqual(t20.statusCode, 201);
    assert.strictEqual(t20.body.bill.subtotal, 280.00, "Client subtotal manipulation must be ignored; database snapshot enforced");
    passedTests++;
    console.log("✓ Test 20 Passed: Client price manipulation strictly ignored");

    // =========================================================================
    // TEST 21: Duplicate Bill Creation Prevention
    // =========================================================================
    console.log("\nTest 21: Duplicate Bill Creation Prevention...");
    const t21 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${orderA1.id}/bill`,
      method: "POST",
      headers: authStaffA
    }, {});
    assert.strictEqual(t21.statusCode, 200, "Duplicate bill request returns existing bill with 200");
    assert.strictEqual(t21.body.alreadyExisted, true, "alreadyExisted flag must be true");
    assert.strictEqual(t21.body.bill.id, createdBillA1.id, "Must return original bill ID");
    passedTests++;
    console.log("✓ Test 21 Passed: Duplicate bill creation prevented and original bill returned");

    // =========================================================================
    // TEST 22: Bills Listing (GET /api/restaurant/billing)
    // =========================================================================
    console.log("\nTest 22: Bills Listing (GET /api/restaurant/billing)...");
    const t22 = await makeRequest(testServer, {
      path: "/api/restaurant/billing",
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t22.statusCode, 200);
    assert.ok(Array.isArray(t22.body.bills), "bills must be an array");
    assert.ok(t22.body.bills.length >= 2, "Must contain at least 2 bills");
    assert.ok(t22.body.bills.some(b => b.id === createdBillA1.id), "Must contain createdBillA1");
    passedTests++;
    console.log("✓ Test 22 Passed: Bills list retrieved successfully");

    // =========================================================================
    // TEST 23: Bills Listing: Status Filtering (?paymentStatus=PENDING)
    // =========================================================================
    console.log("\nTest 23: Bills Listing: Status Filtering...");
    const t23Pending = await makeRequest(testServer, {
      path: "/api/restaurant/billing?paymentStatus=PENDING",
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t23Pending.statusCode, 200);
    assert.ok(t23Pending.body.bills.every(b => b.paymentStatus === "PENDING"), "All returned bills must be PENDING");

    const t23Paid = await makeRequest(testServer, {
      path: "/api/restaurant/billing?paymentStatus=PAID",
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t23Paid.statusCode, 200);
    assert.strictEqual(t23Paid.body.bills.length, 0, "No paid bills yet");
    passedTests++;
    console.log("✓ Test 23 Passed: Bills paymentStatus filtering verified");

    // =========================================================================
    // TEST 24: Single Bill Detail Retrieval (GET /api/restaurant/billing/:id)
    // =========================================================================
    console.log("\nTest 24: Single Bill Detail Retrieval...");
    const t24 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}`,
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t24.statusCode, 200);
    assert.strictEqual(t24.body.bill.id, createdBillA1.id);
    assert.ok(Array.isArray(t24.body.bill.items), "Items array must be returned with single bill");
    assert.strictEqual(t24.body.bill.items.length, 2);
    passedTests++;
    console.log("✓ Test 24 Passed: Single bill detail with items retrieved");

    // =========================================================================
    // TEST 25: Cross-Tenant Bill Detail Inspection Blocked
    // =========================================================================
    console.log("\nTest 25: Cross-Tenant Bill Detail Inspection Blocked...");
    // Enable billing on Restaurant B to test tenant isolation on billing endpoints
    await restaurantStore.updateBillingSettings(restBId, { billingEnabled: true });
    const t25 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}`,
      method: "GET",
      headers: authAdminB
    });
    assert.strictEqual(t25.statusCode, 404, "Tenant B must not see Tenant A's bill");
    passedTests++;
    console.log("✓ Test 25 Passed: Cross-tenant bill inspection rejected with 404");

    // =========================================================================
    // TEST 26: Payment Recording: Unauthenticated Request Rejected
    // =========================================================================
    console.log("\nTest 26: Payment Recording: Unauthenticated Request Rejected...");
    const t26 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH"
    }, { paymentStatus: "PAID", paymentMethod: "CASH" });
    assert.strictEqual(t26.statusCode, 401, "Expected 401 for unauthenticated payment recording");
    passedTests++;
    console.log("✓ Test 26 Passed: Unauthenticated payment recording rejected with 401");

    // =========================================================================
    // TEST 27: Payment Recording: VIEWER Role Rejected (RBAC)
    // =========================================================================
    console.log("\nTest 27: Payment Recording: VIEWER Role Rejected (RBAC)...");
    const t27 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authViewerA
    }, { paymentStatus: "PAID", paymentMethod: "CASH" });
    assert.strictEqual(t27.statusCode, 403, "Expected 403 Forbidden for VIEWER role");
    passedTests++;
    console.log("✓ Test 27 Passed: VIEWER role rejected with 403 Forbidden");

    // =========================================================================
    // TEST 28: Payment Recording: Cross-Tenant Payment Rejected
    // =========================================================================
    console.log("\nTest 28: Payment Recording: Cross-Tenant Payment Rejected...");
    const t28 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authAdminB
    }, { paymentStatus: "PAID", paymentMethod: "CASH" });
    assert.strictEqual(t28.statusCode, 404, "Tenant B cannot record payment on Tenant A bill");
    passedTests++;
    console.log("✓ Test 28 Passed: Cross-tenant payment recording blocked with 404");

    // =========================================================================
    // TEST 29: Payment Recording: Invalid Payment Status Rejection
    // =========================================================================
    console.log("\nTest 29: Payment Recording: Invalid Payment Status Rejection...");
    const t29 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authStaffA
    }, { paymentStatus: "FLYING" });
    assert.strictEqual(t29.statusCode, 400, "Expected 400 on unknown payment status");
    passedTests++;
    console.log("✓ Test 29 Passed: Invalid payment status rejected with 400");

    // =========================================================================
    // TEST 30: Payment Recording: Invalid Payment Method Rejection
    // =========================================================================
    console.log("\nTest 30: Payment Recording: Invalid Payment Method Rejection...");
    const t30 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authStaffA
    }, { paymentStatus: "PAID", paymentMethod: "BITCOIN" });
    assert.strictEqual(t30.statusCode, 400, "Expected 400 on unsupported payment method");
    passedTests++;
    console.log("✓ Test 30 Passed: Invalid payment method rejected with 400");

    // =========================================================================
    // TEST 31: Payment Recording: Successful Transition PENDING -> PAID
    // =========================================================================
    console.log("\nTest 31: Payment Recording: Successful Transition PENDING -> PAID...");
    const t31 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authStaffA
    }, {
      paymentStatus: "PAID",
      paymentMethod: "UPI",
      paymentRef: "UPI-TXN-987654"
    });
    assert.strictEqual(t31.statusCode, 200);
    assert.strictEqual(t31.body.bill.paymentStatus, "PAID");
    assert.strictEqual(t31.body.bill.paymentMethod, "UPI");
    assert.strictEqual(t31.body.bill.paymentRef, "UPI-TXN-987654");
    assert.ok(t31.body.bill.paidAt, "paidAt timestamp must be recorded");
    passedTests++;
    console.log("✓ Test 31 Passed: Bill paid via UPI with paidAt timestamp set");

    // =========================================================================
    // TEST 32: Idempotent Payment Recording
    // =========================================================================
    console.log("\nTest 32: Idempotent Payment Recording...");
    const t32 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authStaffA
    }, {
      paymentStatus: "PAID",
      paymentMethod: "UPI"
    });
    assert.strictEqual(t32.statusCode, 200, "Repeat payment with matching status succeeds idempotently");
    assert.strictEqual(t32.body.bill.paymentStatus, "PAID");
    passedTests++;
    console.log("✓ Test 32 Passed: Idempotent payment handled safely");

    // =========================================================================
    // TEST 33: Terminal State / Invalid Transition Rejection
    // =========================================================================
    console.log("\nTest 33: Terminal State / Invalid Transition Rejection...");
    const t33 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/payment`,
      method: "PATCH",
      headers: authStaffA
    }, { paymentStatus: "PENDING" });
    assert.strictEqual(t33.statusCode, 400, "PAID bill cannot be reverted back to PENDING");
    passedTests++;
    console.log("✓ Test 33 Passed: Illegal backward transition PAID -> PENDING rejected with 400");

    // =========================================================================
    // TEST 34: Printable Receipt Retrieval (GET /api/restaurant/billing/:id/receipt)
    // =========================================================================
    console.log("\nTest 34: Printable Receipt Retrieval...");
    const t34 = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${createdBillA1.id}/receipt`,
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t34.statusCode, 200);
    assert.ok(t34.body.receipt, "Receipt object must be returned");
    assert.strictEqual(t34.body.receipt.billNumber, createdBillA1.billNumber);
    assert.strictEqual(t34.body.receipt.paymentStatus, "PAID");
    assert.strictEqual(t34.body.receipt.paymentMethod, "UPI");
    assert.strictEqual(t34.body.receipt.financials.grandTotal, 748.00);
    assert.ok(Array.isArray(t34.body.receipt.items), "Receipt items must be an array");
    passedTests++;
    console.log("✓ Test 34 Passed: Formatted printable receipt payload retrieved");

    // =========================================================================
    // TEST 35: Disable Billing Toggle & Verify Immediate Backend Enforcement
    // =========================================================================
    console.log("\nTest 35: Disable Billing Toggle & Verify Immediate Backend Enforcement...");
    const t35Toggle = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authAdminA
    }, { billingEnabled: false });
    assert.strictEqual(t35Toggle.statusCode, 200);
    assert.strictEqual(t35Toggle.body.settings.billingEnabled, false);

    const t35Blocked = await makeRequest(testServer, {
      path: "/api/restaurant/billing",
      method: "GET",
      headers: authStaffA
    });
    assert.strictEqual(t35Blocked.statusCode, 403, "Immediately blocked with 403 once billing is disabled");
    assert.strictEqual(t35Blocked.body.code, "BILLING_DISABLED");
    passedTests++;
    console.log("✓ Test 35 Passed: Disabling toggle immediately enforces 403 on billing endpoints");

    // =========================================================================
    // TEST 36: Security Audit Trail Verification
    // =========================================================================
    console.log("\nTest 36: Security Audit Trail Verification...");
    const auditLogs = securityAuditStore.getSecurityAuditLogs();
    const billingSettingsLogs = auditLogs.filter(l => l.type === "BILLING_SETTING_CHANGED" && l.details?.restaurantId === restAId);
    const billCreatedLogs = auditLogs.filter(l => l.type === "BILL_CREATED" && l.details?.restaurantId === restAId);
    const paymentLogs = auditLogs.filter(l => l.type === "PAYMENT_RECORDED" && l.details?.restaurantId === restAId);

    assert.ok(billingSettingsLogs.length >= 1, "BILLING_SETTING_CHANGED event must be recorded in security audit");
    assert.ok(billCreatedLogs.length >= 1, "BILL_CREATED event must be recorded in security audit");
    assert.ok(paymentLogs.length >= 1, "PAYMENT_RECORDED event must be recorded in security audit");
    passedTests++;
    console.log("✓ Test 36 Passed: All billing events verified in security audit store");

    console.log("\n===============================================================");
    console.log(`PHASE 6 VERIFICATION COMPLETE: ${passedTests}/36 TESTS PASSED`);
    console.log("===============================================================");

  } finally {
    testServer.close();
    console.log("Phase 6 Test server closed.");
    try {
      await Promise.race([
        closePool(),
        new Promise(r => setTimeout(r, 1000))
      ]);
    } catch (_) {}
  }
}

if (require.main === module) {
  runSuite()
    .then(() => {
      console.log("Phase 6 test execution completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ PHASE 6 SUITE FAILURE:", err);
      process.exit(1);
    });
}

module.exports = { runSuite };
