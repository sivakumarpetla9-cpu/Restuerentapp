/**
 * Restaurant OS v1 - End-to-End Pilot QA Suite
 * 
 * Verifies the entire restaurant operating cycle in a real-world multi-tenant business context:
 * 1. Demo Restaurant Tenant setup (1 branch, 5 tables, 3 categories, 12 items across VEG/NON_VEG)
 * 2. Complete Customer Flow (QR -> Session -> Catalog -> Cart CRUD -> Anti-Tamper -> Atomic Order)
 * 3. Kitchen Flow (FIFO Queue, Dietary Badges, Status Transitions: NEW -> ACCEPTED -> PREPARING -> READY -> SERVED)
 * 4. FSM Invariants & Table Occupancy Synchronization
 * 5. Optional Billing Flow:
 *    - Billing OFF: Complete rejection with 403, normal orders unaffected
 *    - Billing ON: Generation, Server Arithmetic, Duplicate Prevention, Payment (PENDING -> PAID), Receipt
 * 6. Multi-Tenant Isolation & RBAC Security Boundaries
 */

const http = require("http");
const assert = require("assert");
const { URL } = require("url");

// Ensure environment variables are loaded
require("dotenv").config();

// Fix happy eyeballs / IPv6 socket hangs on Windows with Neon
const net = require("net");
const dns = require("dns");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const server = require("../server");
const restaurantStore = require("../memory/restaurantStore");
const restaurantRepository = require("../memory/repositories/restaurantRepository");
const userStore = require("../memory/userStore");
const { createSession } = require("../security/session");
const { isPostgresConfigured, closePool } = require("../memory/db");
const { generateQrToken } = require("../security/qrToken");

// HTTP request helper with reasonable timeout for database operations
function makeRequest(testServer, options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const port = testServer.address().port;
    const reqOptions = {
      hostname: "127.0.0.1",
      port: port,
      path: options.path,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, res => {
      let rawData = "";
      res.on("data", chunk => { rawData += chunk; });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = JSON.parse(rawData);
        } catch (_) {
          parsed = rawData;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        });
      });
    });

    req.setTimeout(25000, () => {
      req.destroy(new Error(`Request to ${options.path} timed out after 25000ms`));
    });

    req.on("error", err => {
      reject(err);
    });

    if (bodyData) {
      req.write(typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function runPilotQASuite() {
  console.log("===============================================================");
  console.log("Restaurant OS v1 - End-to-End Pilot QA Verification");
  console.log("Real-World Lifecycle: Customer -> Kitchen -> Optional Billing");
  console.log("===============================================================");

  const testServer = http.createServer(server.listeners("request")[0]);
  let passedChecks = 0;
  const totalChecks = 40;

  await new Promise(resolve => testServer.listen(0, "127.0.0.1", resolve));
  const port = testServer.address().port;
  console.log(`Pilot QA Test Server running on port ${port}\n`);

  try {
    const runId = Date.now().toString();
    const demoRestId = `client-demo-${runId}`;
    const rivalRestId = `client-rival-${runId}`;

    console.log("[Setup] 1. Creating Isolated 'Demo Restaurant' & 'Rival Restaurant' Tenants...");

    // Create Restaurant Profiles
    const demoProfile = {
      name: "Demo Restaurant & Bar",
      company: "Demo Hospitality Group Pvt Ltd",
      email: `pilot-${runId}@demorestaurant.com`,
      phone: "+91 98765 00001",
      currency: "INR",
      taxRate: 5.0,
      gstNumber: "27AABCT1234F1Z5",
      operatingHours: { open: "11:00", close: "23:30" }
    };
    const rivalProfile = {
      name: "Rival Bistro",
      company: "Rival Enterprises LLC",
      email: `pilot-${runId}@rivalbistro.com`,
      phone: "+91 98765 00002",
      currency: "INR",
      taxRate: 5.0
    };

    if (isPostgresConfigured()) {
      await restaurantRepository.updateRestaurantProfile(demoRestId, demoProfile);
      await restaurantRepository.updateRestaurantProfile(rivalRestId, rivalProfile);
    }
    restaurantStore.updateRestaurantProfile(demoRestId, demoProfile);
    restaurantStore.updateRestaurantProfile(rivalRestId, rivalProfile);

    // Initial Billing Toggle State: strictly OFF by default
    await restaurantStore.updateBillingSettings(demoRestId, { billingEnabled: false, serviceChargeRate: 5.0 });
    await restaurantStore.updateBillingSettings(rivalRestId, { billingEnabled: false, serviceChargeRate: 0.0 });

    // 2. Setup Staff Users
    const userAdmin = userStore.createUser({
      name: "Pilot Manager",
      email: `manager.${runId}@demorestaurant.com`,
      password: "Password123!",
      role: "ADMIN",
      restaurantId: demoRestId
    });
    const userChef = userStore.createUser({
      name: "Head Chef Marco",
      email: `chef.${runId}@demorestaurant.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: demoRestId
    });
    const userViewer = userStore.createUser({
      name: "Auditor Ann",
      email: `auditor.${runId}@demorestaurant.com`,
      password: "Password123!",
      role: "VIEWER",
      restaurantId: demoRestId
    });
    const userRivalAdmin = userStore.createUser({
      name: "Rival Manager",
      email: `manager.${runId}@rivalbistro.com`,
      password: "Password123!",
      role: "ADMIN",
      restaurantId: rivalRestId
    });

    const authAdmin = { Authorization: `Bearer ${createSession(userAdmin).token}` };
    const authChef = { Authorization: `Bearer ${createSession(userChef).token}` };
    const authViewer = { Authorization: `Bearer ${createSession(userViewer).token}` };
    const authRivalAdmin = { Authorization: `Bearer ${createSession(userRivalAdmin).token}` };

    // 3. Branches: 1 Branch for Demo Restaurant
    const branchA = { id: `brn-demo-${runId}`, restaurantId: demoRestId, name: "Downtown Flagship", address: "100 MG Road, Connaught Place" };
    const branchB = { id: `brn-rival-${runId}`, restaurantId: rivalRestId, name: "Uptown Branch", address: "50 Park Street" };
    if (isPostgresConfigured()) {
      await restaurantRepository.createBranch(branchA);
      await restaurantRepository.createBranch(branchB);
    }
    restaurantStore.createBranch(branchA);
    restaurantStore.createBranch(branchB);

    // 4. Tables: Exactly 5 Tables for Demo Restaurant
    const tables = [
      { id: `tbl-demo-1-${runId}`, restaurantId: demoRestId, branchId: branchA.id, tableNumber: "T-01", name: "Window Two-Seater", capacity: 2, status: "AVAILABLE", isActive: true },
      { id: `tbl-demo-2-${runId}`, restaurantId: demoRestId, branchId: branchA.id, tableNumber: "T-02", name: "Central Booth 1", capacity: 4, status: "AVAILABLE", isActive: true },
      { id: `tbl-demo-3-${runId}`, restaurantId: demoRestId, branchId: branchA.id, tableNumber: "T-03", name: "Central Booth 2", capacity: 4, status: "AVAILABLE", isActive: true },
      { id: `tbl-demo-4-${runId}`, restaurantId: demoRestId, branchId: branchA.id, tableNumber: "T-04", name: "Garden Family Table", capacity: 6, status: "AVAILABLE", isActive: true },
      { id: `tbl-demo-5-${runId}`, restaurantId: demoRestId, branchId: branchA.id, tableNumber: "T-05", name: "VIP Dining Room", capacity: 8, status: "AVAILABLE", isActive: true },
    ];
    const rivalTable = { id: `tbl-rival-1-${runId}`, restaurantId: rivalRestId, branchId: branchB.id, tableNumber: "T-R1", name: "Rival Table 1", capacity: 4, status: "AVAILABLE", isActive: true };

    if (isPostgresConfigured()) {
      for (const t of tables) await restaurantRepository.createTable(t);
      await restaurantRepository.createTable(rivalTable);
    }
    for (const t of tables) restaurantStore.createTable(t);
    restaurantStore.createTable(rivalTable);

    // 5. Menu Categories: 3 Categories
    const catStarters = { id: `cat-demo-s-${runId}`, restaurantId: demoRestId, name: "Starters & Appetizers", displayOrder: 1, isActive: true };
    const catMains = { id: `cat-demo-m-${runId}`, restaurantId: demoRestId, name: "Main Course", displayOrder: 2, isActive: true };
    const catDrinks = { id: `cat-demo-d-${runId}`, restaurantId: demoRestId, name: "Beverages & Desserts", displayOrder: 3, isActive: true };

    const catRival = { id: `cat-rival-${runId}`, restaurantId: rivalRestId, name: "Rival Pastas", displayOrder: 1, isActive: true };

    if (isPostgresConfigured()) {
      await restaurantRepository.createCategory(catStarters);
      await restaurantRepository.createCategory(catMains);
      await restaurantRepository.createCategory(catDrinks);
      await restaurantRepository.createCategory(catRival);
    }
    restaurantStore.createCategory(catStarters);
    restaurantStore.createCategory(catMains);
    restaurantStore.createCategory(catDrinks);
    restaurantStore.createCategory(catRival);

    // 6. Menu Items: 12 Realistic Available Items (VEG & NON_VEG) + 1 Unavailable Item
    const menuItems = [
      // Starters
      { id: `mi-1-${runId}`, restaurantId: demoRestId, categoryId: catStarters.id, name: "Paneer Tikka Angara", price: 260.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      { id: `mi-2-${runId}`, restaurantId: demoRestId, categoryId: catStarters.id, name: "Crispy Corn Salt & Pepper", price: 220.00, taxRate: 5.0, dietaryType: "VEGAN", isActive: true, isAvailable: true },
      { id: `mi-3-${runId}`, restaurantId: demoRestId, categoryId: catStarters.id, name: "Chicken Malai Tikka", price: 320.00, taxRate: 5.0, dietaryType: "NON_VEG", isActive: true, isAvailable: true },
      { id: `mi-4-${runId}`, restaurantId: demoRestId, categoryId: catStarters.id, name: "Amritsari Fish Fry", price: 380.00, taxRate: 5.0, dietaryType: "NON_VEG", isActive: true, isAvailable: true },
      // Mains
      { id: `mi-5-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Dal Makhani Grand", price: 280.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      { id: `mi-6-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Paneer Butter Masala", price: 320.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      { id: `mi-7-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Butter Chicken Classic", price: 420.00, taxRate: 5.0, dietaryType: "NON_VEG", isActive: true, isAvailable: true },
      { id: `mi-8-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Mutton Rogan Josh", price: 490.00, taxRate: 5.0, dietaryType: "NON_VEG", isActive: true, isAvailable: true },
      { id: `mi-9-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Butter Garlic Naan", price: 65.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      { id: `mi-10-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Jeera Pulao Rice", price: 160.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      // Beverages & Desserts
      { id: `mi-11-${runId}`, restaurantId: demoRestId, categoryId: catDrinks.id, name: "Alphonso Mango Lassi", price: 120.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      { id: `mi-12-${runId}`, restaurantId: demoRestId, categoryId: catDrinks.id, name: "Gulab Jamun with Rabri", price: 150.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true },
      // Unavailable Item
      { id: `mi-unavail-${runId}`, restaurantId: demoRestId, categoryId: catMains.id, name: "Seasonal Lobster Thermidor", price: 950.00, taxRate: 5.0, dietaryType: "NON_VEG", isActive: true, isAvailable: false }
    ];

    const rivalItem = { id: `mi-rival-${runId}`, restaurantId: rivalRestId, categoryId: catRival.id, name: "Truffle Tagliatelle", price: 650.00, taxRate: 5.0, dietaryType: "VEG", isActive: true, isAvailable: true };

    if (isPostgresConfigured()) {
      for (const mi of menuItems) await restaurantRepository.createMenuItem(mi);
      await restaurantRepository.createMenuItem(rivalItem);
    }
    for (const mi of menuItems) restaurantStore.createMenuItem(mi);
    restaurantStore.createMenuItem(rivalItem);

    console.log("[Setup] Demo Restaurant fixture ready: 1 Branch, 5 Tables, 3 Categories, 13 Items.\n");

    // =========================================================================
    // SECTION 1: CUSTOMER JOURNEY
    // =========================================================================
    console.log("--- SECTION 1: CUSTOMER FLOW ---");

    // 1. Generate Secure QR Token for Table T-01
    const qrRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tables[0].id}/qr`,
      method: "GET",
      headers: authAdmin
    });
    assert.strictEqual(qrRes.statusCode, 200, "Expected 200 on QR token generation");
    assert.ok(qrRes.body.qrToken, "QR token must be returned");
    const qrTokenT1 = qrRes.body.qrToken;
    passedChecks++;
    console.log(`[PASS 01/${totalChecks}] Secure QR token generated for Table T-01`);

    // 2. Fetch Public Order Menu with QR Token
    const menuRes = await makeRequest(testServer, {
      path: `/api/order/menu/${qrTokenT1}`,
      method: "GET"
    });
    assert.strictEqual(menuRes.statusCode, 200, "Public menu must return 200");
    assert.strictEqual(menuRes.body.restaurant.name, "Demo Restaurant & Bar");
    assert.strictEqual(menuRes.body.table.tableNumber, "T-01");
    // Verify only available items are returned (12 available, 1 unavailable excluded)
    const returnedItems = menuRes.body.items || [];
    assert.strictEqual(returnedItems.length, 12, "Customer menu must exclude unavailable items");
    assert.ok(!returnedItems.some(i => i.name.includes("Lobster")), "Unavailable lobster must not appear in customer menu");
    passedChecks++;
    console.log(`[PASS 02/${totalChecks}] Public menu loaded cleanly (12 available items, unavailable excluded)`);

    // 3. Initialize Customer Table Session
    const sessRes = await makeRequest(testServer, {
      path: `/api/order/session/${qrTokenT1}`,
      method: "POST"
    }, { guestCount: 2, customerName: "Pilot Guest" });
    assert.strictEqual(sessRes.statusCode, 200, "Session initialization must return 200");
    assert.ok(sessRes.body.sessionToken, "Session token must be provided");
    const customerToken = sessRes.body.sessionToken;
    const customerHeaders = {
      "X-Session-Token": customerToken,
      Authorization: `Bearer ${customerToken}`
    };
    passedChecks++;
    console.log(`[PASS 03/${totalChecks}] Customer table session initialized with secure HMAC token`);

    // 4. Cart Starts Empty
    const cart0 = await makeRequest(testServer, {
      path: "/api/order/cart",
      method: "GET",
      headers: customerHeaders
    });
    assert.strictEqual(cart0.statusCode, 200);
    assert.strictEqual(cart0.body.itemCount, 0);
    passedChecks++;
    console.log(`[PASS 04/${totalChecks}] New customer session starts with an empty cart`);

    // 5. Attempt to Add Unavailable Item (Must Fail with 400)
    const addUnavail = await makeRequest(testServer, {
      path: "/api/order/cart/items",
      method: "POST",
      headers: customerHeaders
    }, { menuItemId: `mi-unavail-${runId}`, quantity: 1 });
    assert.strictEqual(addUnavail.statusCode, 400, "Unavailable item must be rejected with 400");
    passedChecks++;
    console.log(`[PASS 05/${totalChecks}] Unavailable menu items strictly rejected from being added to cart`);

    // 6. Anti-Tamper: Attempt to inject Client-Supplied Price (Must be ignored)
    // Add Butter Chicken Classic (official price: 420.00), attempt sending price: 1.00
    const addHacked = await makeRequest(testServer, {
      path: "/api/order/cart/items",
      method: "POST",
      headers: customerHeaders
    }, { menuItemId: `mi-7-${runId}`, quantity: 2, price: 1.00, subtotal: 2.00 });
    assert.strictEqual(addHacked.statusCode, 201);
    const cartHacked = await makeRequest(testServer, { path: "/api/order/cart", method: "GET", headers: customerHeaders });
    assert.strictEqual(cartHacked.body.subtotal, 840.00, "Server must enforce catalog price (2 x 420 = 840)");
    passedChecks++;
    console.log(`[PASS 06/${totalChecks}] Client-supplied price manipulation strictly ignored by server`);

    // 7. Add More Valid Items: 2 x Butter Garlic Naan (2 x 65 = 130), 1 x Mango Lassi (120)
    await makeRequest(testServer, {
      path: "/api/order/cart/items",
      method: "POST",
      headers: customerHeaders
    }, { menuItemId: `mi-9-${runId}`, quantity: 2 });

    const addDrink = await makeRequest(testServer, {
      path: "/api/order/cart/items",
      method: "POST",
      headers: customerHeaders
    }, { menuItemId: `mi-11-${runId}`, quantity: 1 });
    assert.strictEqual(addDrink.statusCode, 201);
    const cartItemDrinkId = addDrink.body.item.id;
    passedChecks++;
    console.log(`[PASS 07/${totalChecks}] Added Butter Garlic Naan and Mango Lassi to cart`);

    // 8. Update Quantity: Increase Naan from 2 to 4
    const cartBeforeUpdate = await makeRequest(testServer, { path: "/api/order/cart", method: "GET", headers: customerHeaders });
    const naanCartItem = cartBeforeUpdate.body.items.find(i => i.menuItemId === `mi-9-${runId}`);
    const updateRes = await makeRequest(testServer, {
      path: `/api/order/cart/items/${naanCartItem.id}`,
      method: "PATCH",
      headers: customerHeaders
    }, { quantity: 4 });
    assert.strictEqual(updateRes.statusCode, 200);
    passedChecks++;
    console.log(`[PASS 08/${totalChecks}] Cart item quantity updated cleanly (Naan: 2 -> 4)`);

    // 9. Remove Item: Remove Mango Lassi from Cart
    const removeRes = await makeRequest(testServer, {
      path: `/api/order/cart/items/${cartItemDrinkId}`,
      method: "DELETE",
      headers: customerHeaders
    });
    assert.strictEqual(removeRes.statusCode, 200);
    const cartAfterRemove = await makeRequest(testServer, { path: "/api/order/cart", method: "GET", headers: customerHeaders });
    assert.strictEqual(cartAfterRemove.body.items.length, 2, "Cart must now have exactly 2 items");
    // Expected items: 2 x Butter Chicken (840) + 4 x Naan (260) = Subtotal 1100.00
    assert.strictEqual(cartAfterRemove.body.subtotal, 1100.00);
    passedChecks++;
    console.log(`[PASS 09/${totalChecks}] Cart item removal verified (Cart Subtotal: 1100.00)`);

    // 10. Place Customer Order with Idempotency Key
    const idempotencyKey = `idem-pilot-${runId}`;
    const orderPlacement = await makeRequest(testServer, {
      path: "/api/order/place",
      method: "POST",
      headers: {
        ...customerHeaders,
        "Idempotency-Key": idempotencyKey
      }
    }, { notes: "Extra crispy naan, butter chicken medium spice" });
    assert.strictEqual(orderPlacement.statusCode, 201, "Expected 201 on order placement");
    const placedOrder = orderPlacement.body.order;
    assert.ok(placedOrder.id, "Order ID must exist");
    assert.strictEqual(placedOrder.status, "NEW", "Initial status must be NEW");
    assert.strictEqual(placedOrder.subtotal, 1100.00, "Subtotal must equal 1100.00");
    assert.strictEqual(placedOrder.taxAmount, 55.00, "5% Tax on 1100 must equal 55.00");
    assert.strictEqual(placedOrder.totalAmount, 1155.00, "Total must equal 1155.00");
    passedChecks++;
    console.log(`[PASS 10/${totalChecks}] Atomic order placed successfully (Order #${placedOrder.orderNumber}, Total: 1155.00)`);

    // 11. Verify Double-Submission Prevention (Same Idempotency-Key returns cached order without creating a duplicate)
    const duplicateSubmission = await makeRequest(testServer, {
      path: "/api/order/place",
      method: "POST",
      headers: {
        ...customerHeaders,
        "Idempotency-Key": idempotencyKey
      }
    }, {});
    assert.strictEqual(duplicateSubmission.statusCode, 200, "Duplicate submission must return 200 with idempotent cached response");
    assert.strictEqual(duplicateSubmission.body.order.id, placedOrder.id);
    passedChecks++;
    console.log(`[PASS 11/${totalChecks}] Double-submission prevented; duplicate checkout safely returned cached order`);

    // 12. Cart Cleared Upon Checkout
    const cartPostCheckout = await makeRequest(testServer, { path: "/api/order/cart", method: "GET", headers: customerHeaders });
    assert.strictEqual(cartPostCheckout.body.items.length, 0, "Cart must be emptied after checkout");
    passedChecks++;
    console.log(`[PASS 12/${totalChecks}] Customer cart automatically cleared after order placement`);

    // 13. Customer Order Status Tracking
    const statusTrack = await makeRequest(testServer, {
      path: `/api/order/status/${placedOrder.id}`,
      method: "GET",
      headers: customerHeaders
    });
    assert.strictEqual(statusTrack.statusCode, 200);
    assert.strictEqual(statusTrack.body.order.status, "NEW");
    passedChecks++;
    console.log(`[PASS 13/${totalChecks}] Customer can track live order status (Status: NEW)`);

    // =========================================================================
    // SECTION 2: KITCHEN DISPLAY WORKFLOW
    // =========================================================================
    console.log("\n--- SECTION 2: KITCHEN WORKFLOW ---");

    // 14. Kitchen Queue Fetch (Staff Auth Required)
    const kitchenQueue = await makeRequest(testServer, {
      path: "/api/restaurant/kitchen/orders",
      method: "GET",
      headers: authChef
    });
    assert.strictEqual(kitchenQueue.statusCode, 200);
    const kOrders = kitchenQueue.body.orders || [];
    const foundKOrder = kOrders.find(o => o.id === placedOrder.id);
    assert.ok(foundKOrder, "Newly placed order must appear in Kitchen queue");
    assert.strictEqual(foundKOrder.status, "NEW");
    passedChecks++;
    console.log(`[PASS 14/${totalChecks}] Placed order visible in staff Kitchen Queue`);

    // 15. Dietary Badges on Kitchen Items
    const kItems = foundKOrder.items || [];
    assert.ok(kItems.length >= 2, "Kitchen order must include all line items");
    const chickenItem = kItems.find(i => i.itemName.includes("Chicken"));
    const naanItem = kItems.find(i => i.itemName.includes("Naan"));
    assert.strictEqual(chickenItem.dietaryType, "NON_VEG");
    assert.strictEqual(naanItem.dietaryType, "VEG");
    passedChecks++;
    console.log(`[PASS 15/${totalChecks}] Dietary badges (NON_VEG / VEG) accurately mapped on kitchen line items`);

    // 16. Transition 1: NEW -> ACCEPTED
    const tAccept = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${placedOrder.id}/status`,
      method: "PATCH",
      headers: authChef
    }, { status: "ACCEPTED" });
    assert.strictEqual(tAccept.statusCode, 200);
    assert.strictEqual(tAccept.body.order.status, "ACCEPTED");
    assert.ok(tAccept.body.order.acceptedAt, "acceptedAt timestamp must be recorded");
    passedChecks++;
    console.log(`[PASS 16/${totalChecks}] Status transition NEW -> ACCEPTED verified`);

    // 17. Transition 2: ACCEPTED -> PREPARING
    const tPrep = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${placedOrder.id}/status`,
      method: "PATCH",
      headers: authChef
    }, { status: "PREPARING" });
    assert.strictEqual(tPrep.statusCode, 200);
    assert.strictEqual(tPrep.body.order.status, "PREPARING");
    assert.ok(tPrep.body.order.preparingAt, "preparingAt timestamp must be recorded");
    passedChecks++;
    console.log(`[PASS 17/${totalChecks}] Status transition ACCEPTED -> PREPARING verified`);

    // 18. Transition 3: PREPARING -> READY
    const tReady = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${placedOrder.id}/status`,
      method: "PATCH",
      headers: authChef
    }, { status: "READY" });
    assert.strictEqual(tReady.statusCode, 200);
    assert.strictEqual(tReady.body.order.status, "READY");
    assert.ok(tReady.body.order.readyAt, "readyAt timestamp must be recorded");
    passedChecks++;
    console.log(`[PASS 18/${totalChecks}] Status transition PREPARING -> READY verified`);

    // 19. Transition 4: READY -> SERVED
    const tServed = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${placedOrder.id}/status`,
      method: "PATCH",
      headers: authChef
    }, { status: "SERVED" });
    assert.strictEqual(tServed.statusCode, 200);
    assert.strictEqual(tServed.body.order.status, "SERVED");
    assert.ok(tServed.body.order.servedAt, "servedAt timestamp must be recorded");
    passedChecks++;
    console.log(`[PASS 19/${totalChecks}] Status transition READY -> SERVED verified`);

    // 20. Customer Order Status Sync
    const custSync = await makeRequest(testServer, {
      path: `/api/order/status/${placedOrder.id}`,
      method: "GET",
      headers: customerHeaders
    });
    assert.strictEqual(custSync.statusCode, 200);
    assert.strictEqual(custSync.body.order.status, "SERVED", "Customer status view must reflect SERVED state");
    passedChecks++;
    console.log(`[PASS 20/${totalChecks}] Customer live tracking synchronized with kitchen status (SERVED)`);

    // 21. Terminal State Immutability: SERVED cannot transition back to PREPARING or NEW
    const illegalTransition = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${placedOrder.id}/status`,
      method: "PATCH",
      headers: authChef
    }, { status: "PREPARING" });
    assert.strictEqual(illegalTransition.statusCode, 400, "Illegal transition out of terminal state must return 400");
    passedChecks++;
    console.log(`[PASS 21/${totalChecks}] Terminal state immutability enforced (SERVED cannot be modified)`);

    // =========================================================================
    // SECTION 3: OPTIONAL BILLING MODULE & FEATURE TOGGLE
    // =========================================================================
    console.log("\n--- SECTION 3: OPTIONAL BILLING & PAYMENTS ---");

    // 22. Feature Toggle OFF: Settings inspection works
    const setOff = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "GET",
      headers: authAdmin
    });
    assert.strictEqual(setOff.statusCode, 200);
    assert.strictEqual(setOff.body.settings.billingEnabled, false, "Default billing toggle must be false");
    passedChecks++;
    console.log(`[PASS 22/${totalChecks}] Billing module is OFF by default`);

    // 23. Feature Toggle OFF: Bill generation is BLOCKED with 403
    const genBlocked = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${placedOrder.id}/bill`,
      method: "POST",
      headers: authAdmin
    }, {});
    assert.strictEqual(genBlocked.statusCode, 403, "Bill generation must return 403 when Billing is OFF");
    assert.strictEqual(genBlocked.body.code, "BILLING_DISABLED");
    passedChecks++;
    console.log(`[PASS 23/${totalChecks}] Bill generation strictly blocked with 403 when Billing = OFF`);

    // 24. Feature Toggle OFF: Bills listing is BLOCKED with 403
    const listBlocked = await makeRequest(testServer, {
      path: "/api/restaurant/billing",
      method: "GET",
      headers: authAdmin
    });
    assert.strictEqual(listBlocked.statusCode, 403);
    assert.strictEqual(listBlocked.body.code, "BILLING_DISABLED");
    passedChecks++;
    console.log(`[PASS 24/${totalChecks}] Bills listing strictly blocked with 403 when Billing = OFF`);

    // 25. Feature Toggle OFF: Payment recording is BLOCKED with 403
    const payBlocked = await makeRequest(testServer, {
      path: "/api/restaurant/billing/dummy-bill-id/payment",
      method: "PATCH",
      headers: authAdmin
    }, { paymentStatus: "PAID" });
    assert.strictEqual(payBlocked.statusCode, 403);
    assert.strictEqual(payBlocked.body.code, "BILLING_DISABLED");
    passedChecks++;
    console.log(`[PASS 25/${totalChecks}] Payment recording strictly blocked with 403 when Billing = OFF`);

    // 26. Feature Toggle OFF: Receipt retrieval is BLOCKED with 403
    const receiptBlocked = await makeRequest(testServer, {
      path: "/api/restaurant/billing/dummy-bill-id/receipt",
      method: "GET",
      headers: authAdmin
    });
    assert.strictEqual(receiptBlocked.statusCode, 403);
    assert.strictEqual(receiptBlocked.body.code, "BILLING_DISABLED");
    passedChecks++;
    console.log(`[PASS 26/${totalChecks}] Receipt retrieval strictly blocked with 403 when Billing = OFF`);

    // 27. Normal restaurant operation thrives while Billing = OFF (SERVED order is finalized without required bill)
    assert.strictEqual(placedOrder.status, "SERVED", "Orders remain fully served and operating without billing");
    passedChecks++;
    console.log(`[PASS 27/${totalChecks}] Restaurant operations function 100% autonomously without billing`);

    // 28. Enable Billing Toggle via PATCH /api/restaurant/billing/settings
    const enableBilling = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authAdmin
    }, {
      billingEnabled: true,
      serviceChargeRate: 5.0,
      taxRate: 5.0,
      currency: "INR",
      gstNumber: "27AABCT1234F1Z5"
    });
    assert.strictEqual(enableBilling.statusCode, 200);
    assert.strictEqual(enableBilling.body.settings.billingEnabled, true);
    assert.strictEqual(enableBilling.body.settings.serviceChargeRate, 5.0);
    passedChecks++;
    console.log(`[PASS 28/${totalChecks}] Billing module enabled via PATCH settings (Service Charge: 5%, Tax: 5%)`);

    // 29. Generate Bill for the SERVED Order
    const genBill = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${placedOrder.id}/bill`,
      method: "POST",
      headers: authAdmin
    }, { notes: "Pilot Guest Table 1" });
    assert.strictEqual(genBill.statusCode, 201, "Expected 201 on valid bill creation");
    const bill = genBill.body.bill;
    assert.ok(bill.id, "Bill ID must exist");
    assert.ok(bill.billNumber, "Bill number must be assigned");
    assert.strictEqual(bill.paymentStatus, "PENDING", "Initial bill paymentStatus must be PENDING");
    passedChecks++;
    console.log(`[PASS 29/${totalChecks}] Consolidated bill generated for served order (Bill #${bill.billNumber})`);

    // 30. Verify Accurate Server-Side Financial Arithmetic
    // Subtotal: 1100.00
    // Tax (5%): 55.00
    // Service Charge (5% of 1100): 55.00
    // Grand Total: 1100 + 55 + 55 = 1210.00
    assert.strictEqual(bill.subtotal, 1100.00, "Bill subtotal must equal 1100.00");
    assert.strictEqual(bill.taxAmount, 55.00, "Bill taxAmount must equal 55.00");
    assert.strictEqual(bill.serviceCharge, 55.00, "Bill serviceCharge must equal 55.00");
    assert.strictEqual(bill.totalAmount, 1210.00, "Grand total must equal 1210.00");
    passedChecks++;
    console.log(`[PASS 30/${totalChecks}] Financial calculations verified (Subtotal: 1100, Tax: 55, SC: 55, Grand Total: 1210)`);

    // 31. Duplicate Bill Prevention: Attempting to generate a second bill returns the existing one
    const dupBill = await makeRequest(testServer, {
      path: `/api/restaurant/billing/orders/${placedOrder.id}/bill`,
      method: "POST",
      headers: authAdmin
    }, {});
    assert.strictEqual(dupBill.statusCode, 200, "Duplicate bill request must return 200");
    assert.strictEqual(dupBill.body.alreadyExisted, true, "Response must flag alreadyExisted = true");
    assert.strictEqual(dupBill.body.bill.id, bill.id);
    passedChecks++;
    console.log(`[PASS 31/${totalChecks}] Duplicate bill prevention verified (Existing bill safely returned)`);

    // 32. Record Payment: Valid Transition PENDING -> PAID via UPI
    const paymentRes = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${bill.id}/payment`,
      method: "PATCH",
      headers: authChef
    }, {
      paymentStatus: "PAID",
      paymentMethod: "UPI",
      paymentRef: "UPI-PILOT-998877"
    });
    assert.strictEqual(paymentRes.statusCode, 200);
    assert.strictEqual(paymentRes.body.bill.paymentStatus, "PAID");
    assert.strictEqual(paymentRes.body.bill.paymentMethod, "UPI");
    assert.ok(paymentRes.body.bill.paidAt, "paidAt timestamp must be recorded");
    passedChecks++;
    console.log(`[PASS 32/${totalChecks}] Payment successfully recorded (Status: PAID, Method: UPI, Ref: UPI-PILOT-998877)`);

    // 33. Illegal Payment Transition: Cannot transition PAID -> PENDING
    const illegalPay = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${bill.id}/payment`,
      method: "PATCH",
      headers: authChef
    }, { paymentStatus: "PENDING" });
    assert.strictEqual(illegalPay.statusCode, 400, "Reverting PAID to PENDING must be rejected with 400");
    passedChecks++;
    console.log(`[PASS 33/${totalChecks}] Illegal payment state reversal (PAID -> PENDING) strictly rejected`);

    // 34. Printable Receipt Payload Generation
    const receiptRes = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${bill.id}/receipt`,
      method: "GET",
      headers: authChef
    });
    assert.strictEqual(receiptRes.statusCode, 200);
    const rc = receiptRes.body.receipt;
    assert.strictEqual(rc.billNumber, bill.billNumber);
    assert.strictEqual(rc.restaurant.name, "Demo Restaurant & Bar");
    assert.strictEqual(rc.restaurant.gstNumber, "27AABCT1234F1Z5");
    assert.strictEqual(rc.financials.grandTotal, 1210.00);
    assert.strictEqual(rc.payment.status, "PAID");
    assert.strictEqual(rc.payment.method, "UPI");
    assert.ok(rc.items.length >= 2);
    passedChecks++;
    console.log(`[PASS 34/${totalChecks}] Branded printable receipt payload generated and verified`);

    // =========================================================================
    // SECTION 4: SECURITY & TENANT ISOLATION BOUNDARIES
    // =========================================================================
    console.log("\n--- SECTION 4: SECURITY & MULTI-TENANT ISOLATION ---");

    // 35. Unauthenticated API access rejected with 401
    const unauthKitchen = await makeRequest(testServer, { path: "/api/restaurant/kitchen/orders", method: "GET" });
    assert.strictEqual(unauthKitchen.statusCode, 401);
    const unauthBilling = await makeRequest(testServer, { path: "/api/restaurant/billing", method: "GET" });
    assert.strictEqual(unauthBilling.statusCode, 401);
    passedChecks++;
    console.log(`[PASS 35/${totalChecks}] Unauthenticated requests rejected with 401 across kitchen and billing`);

    // 36. RBAC Protection: VIEWER role cannot modify billing settings or record payments
    const viewerPatch = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authViewer
    }, { serviceChargeRate: 10.0 });
    assert.strictEqual(viewerPatch.statusCode, 403, "VIEWER role modifying settings must be rejected with 403");
    passedChecks++;
    console.log(`[PASS 36/${totalChecks}] RBAC protection enforced (VIEWER role forbidden from modifying billing)`);

    // 37. Cross-Tenant Isolation: Rival restaurant cannot view Demo Restaurant's orders
    const crossOrder = await makeRequest(testServer, {
      path: `/api/restaurant/orders/${placedOrder.id}`,
      method: "GET",
      headers: authRivalAdmin
    });
    assert.strictEqual(crossOrder.statusCode, 404, "Cross-tenant order lookup must return 404");
    passedChecks++;
    console.log(`[PASS 37/${totalChecks}] Cross-tenant order inspection blocked (Rival cannot view Demo order)`);

    // 38. Cross-Tenant Isolation: Rival restaurant cannot view Demo Restaurant's bills
    const crossBill = await makeRequest(testServer, {
      path: `/api/restaurant/billing/${bill.id}`,
      method: "GET",
      headers: authRivalAdmin
    });
    assert.strictEqual(crossBill.statusCode, 403, "Cross-tenant bill inspection blocked");
    passedChecks++;
    console.log(`[PASS 38/${totalChecks}] Cross-tenant bill inspection blocked (Rival cannot view Demo bill)`);

    // 39. Cross-Tenant Isolation: Rival restaurant's billing toggle remains OFF
    const rivalSettings = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "GET",
      headers: authRivalAdmin
    });
    assert.strictEqual(rivalSettings.statusCode, 200);
    assert.strictEqual(rivalSettings.body.settings.billingEnabled, false, "Rival billing toggle must remain false");
    passedChecks++;
    console.log(`[PASS 39/${totalChecks}] Multi-tenant isolation of billing toggle verified (Rival remains OFF)`);

    // 40. Disable Billing Toggle & Verify Immediate Backend Re-enforcement
    const disableBilling = await makeRequest(testServer, {
      path: "/api/restaurant/billing/settings",
      method: "PATCH",
      headers: authAdmin
    }, { billingEnabled: false });
    assert.strictEqual(disableBilling.statusCode, 200);
    assert.strictEqual(disableBilling.body.settings.billingEnabled, false);

    const reblockedBills = await makeRequest(testServer, {
      path: "/api/restaurant/billing",
      method: "GET",
      headers: authAdmin
    });
    assert.strictEqual(reblockedBills.statusCode, 403, "Disabling toggle must immediately block billing endpoints with 403");
    passedChecks++;
    console.log(`[PASS 40/${totalChecks}] Disabling toggle immediately re-enforces 403 across billing endpoints`);

    console.log("\n===============================================================");
    console.log(`END-TO-END PILOT QA COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED`);
    console.log("===============================================================");

  } finally {
    testServer.close();
    console.log("Pilot QA Test server closed.");
    if (isPostgresConfigured()) {
      await closePool();
    }
  }
}

if (require.main === module) {
  runPilotQASuite()
    .then(() => {
      console.log("Pilot QA execution completed successfully.");
      process.exit(0);
    })
    .catch(err => {
      console.error("\n❌ PILOT QA FAILURE:", err);
      process.exit(1);
    });
}

module.exports = { runPilotQASuite };
