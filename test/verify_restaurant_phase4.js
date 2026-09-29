/**
 * Restaurant OS v1 - Phase 4 Verification Suite
 * Customer Session + Cart + Order Creation
 *
 * Validates all 28 required test areas:
 * 1. Customer table session initialization (valid signed QR -> 200, sessionToken issued)
 * 2. Expired QR code rejection for customer session (401)
 * 3. Tampered QR code rejection for customer session (401)
 * 4. Inactive table session rejection (400)
 * 5. Session resumption (subsequent scans return existing active session)
 * 6. Signed customer session token verification (HMAC-SHA256, constant-time)
 * 7. Missing or invalid customer session token rejected on cart routes (401)
 * 8. Cart retrieval for new session is empty (200, 0 items)
 * 9. Add valid menu item to cart (201, cart updated)
 * 10. Add item invalid quantity rejection (400 on <= 0 or non-integer)
 * 11. Add item missing menuItemId rejection (400)
 * 12. Add unavailable menu item rejection (400 on isAvailable = false)
 * 13. Add inactive menu item rejection (400 on isActive = false)
 * 14. Add non-existent menu item rejection (404)
 * 15. Absolute price security (browser-supplied price in body is completely ignored)
 * 16. Cross-tenant item injection rejection (Restaurant A session cannot add Restaurant B item)
 * 17. Cart item quantity update (PATCH /api/order/cart/items/:id -> 200)
 * 18. Cart item quantity update invalid value rejection (400)
 * 19. Cross-session cart item tampering rejection (Session B cannot modify Session A cart item)
 * 20. Cart item deletion (DELETE /api/order/cart/items/:id -> 200)
 * 21. Order placement with empty cart rejection (400)
 * 22. Valid atomic order placement (POST /api/order/place -> 201, status NEW)
 * 23. Cart cleared upon successful order placement
 * 24. Immutable historical price snapshot (changing menu item price does not mutate order)
 * 25. Availability revalidation at order placement time (item becomes unavailable -> 400)
 * 26. Double-submission / Idempotency protection (Idempotency-Key returns cached order)
 * 27. Order status retrieval (GET /api/order/status/:orderId -> 200, items and status)
 * 28. Cross-session / cross-tenant order status access rejection (403)
 */

const assert = require("assert");
const http = require("http");
require("dotenv").config();

const server = require("../server");
const restaurantStore = require("../memory/restaurantStore");
const restaurantRepository = require("../memory/repositories/restaurantRepository");
const {
  generateQrToken,
  verifyQrToken,
  generateCustomerSessionToken,
  verifyCustomerSessionToken
} = require("../security/qrToken");
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

    req.setTimeout(10000, () => {
      req.destroy(new Error(`Request timed out after 10000ms: ${options.method || "GET"} ${options.path}`));
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
  console.log("Restaurant OS v1 - Phase 4 Verification Suite");
  console.log("Customer Session + Cart + Order Creation");
  console.log("===============================================================");

  const testServer = http.createServer(server.listeners("request")[0]);
  await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const testPort = testServer.address().port;
  console.log(`Phase 4 Test server running on port ${testPort}`);

  let passedTests = 0;
  const totalTests = 28;

  const restaurantAId = `rest-p4-a-${Date.now()}`;
  const restaurantBId = `rest-p4-b-${Date.now()}`;
  const branchAId = `br-p4-a-${Date.now()}`;
  const branchBId = `br-p4-b-${Date.now()}`;
  const tableAId = `tbl-p4-a-${Date.now()}`;
  const tableBId = `tbl-p4-b-${Date.now()}`;
  const tableInactiveId = `tbl-p4-inact-${Date.now()}`;

  let itemA1Id = `mi-p4-a1-${Date.now()}`;
  let itemA2Id = `mi-p4-a2-${Date.now()}`;
  let itemAUnavailId = `mi-p4-aunavail-${Date.now()}`;
  let itemAInactId = `mi-p4-ainact-${Date.now()}`;
  let itemB1Id = `mi-p4-b1-${Date.now()}`;

  let validQrTokenA;
  let validQrTokenB;
  let expiredQrToken;
  let inactiveTableQrToken;

  let sessionA;
  let sessionTokenA;
  let sessionB;
  let sessionTokenB;

  try {
    // -------------------------------------------------------------
    // Setup Test Data
    // -------------------------------------------------------------
    console.log("\n[Setup] Initializing test profiles, branches, tables, and menu items...");

    // Profiles
    await restaurantRepository.updateRestaurantProfile(restaurantAId, {
      name: "Phase 4 Bistro Alpha",
      currency: "INR",
      taxRate: 5.0
    });
    restaurantStore.updateRestaurantProfile(restaurantAId, {
      name: "Phase 4 Bistro Alpha",
      currency: "INR",
      taxRate: 5.0
    });

    await restaurantRepository.updateRestaurantProfile(restaurantBId, {
      name: "Phase 4 Trattoria Beta",
      currency: "INR",
      taxRate: 10.0
    });
    restaurantStore.updateRestaurantProfile(restaurantBId, {
      name: "Phase 4 Trattoria Beta",
      currency: "INR",
      taxRate: 10.0
    });

    // Branches
    const brA = {
      id: branchAId,
      restaurantId: restaurantAId,
      name: "Main Branch A",
      address: "100 Alpha Boulevard"
    };
    await restaurantRepository.createBranch(brA);
    restaurantStore.createBranch(brA);

    const brB = {
      id: branchBId,
      restaurantId: restaurantBId,
      name: "Main Branch B",
      address: "200 Beta Street"
    };
    await restaurantRepository.createBranch(brB);
    restaurantStore.createBranch(brB);

    // Tables
    const tblA = {
      id: tableAId,
      restaurantId: restaurantAId,
      branchId: branchAId,
      tableNumber: "T-01",
      name: "Window Seat A1",
      capacity: 4,
      isActive: true
    };
    await restaurantRepository.createTable(tblA);
    restaurantStore.createTable(tblA);

    const tblB = {
      id: tableBId,
      restaurantId: restaurantBId,
      branchId: branchBId,
      tableNumber: "T-02",
      name: "Booth B2",
      capacity: 2,
      isActive: true
    };
    await restaurantRepository.createTable(tblB);
    restaurantStore.createTable(tblB);

    const tblInact = {
      id: tableInactiveId,
      restaurantId: restaurantAId,
      branchId: branchAId,
      tableNumber: "T-99",
      name: "Deactivated Table",
      capacity: 4,
      isActive: false
    };
    await restaurantRepository.createTable(tblInact);
    restaurantStore.createTable(tblInact);

    // Menu Categories
    const catDataA = {
      id: `cat-p4-a-${Date.now()}`,
      restaurantId: restaurantAId,
      branchId: branchAId,
      name: "Main Courses A",
      displayOrder: 1,
      isActive: true
    };
    await restaurantRepository.createCategory(catDataA);
    const catA = restaurantStore.createCategory(catDataA);

    const catDataB = {
      id: `cat-p4-b-${Date.now()}`,
      restaurantId: restaurantBId,
      branchId: branchBId,
      name: "Main Courses B",
      displayOrder: 1,
      isActive: true
    };
    await restaurantRepository.createCategory(catDataB);
    const catB = restaurantStore.createCategory(catDataB);

    // Menu Items
    const miA1 = {
      id: itemA1Id,
      restaurantId: restaurantAId,
      categoryId: catA.id,
      name: "Butter Paneer Bowl",
      price: 280.00,
      taxRate: 5.0,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    };
    await restaurantRepository.createMenuItem(miA1);
    restaurantStore.createMenuItem(miA1);

    const miA2 = {
      id: itemA2Id,
      restaurantId: restaurantAId,
      categoryId: catA.id,
      name: "Garlic Butter Naan",
      price: 60.00,
      taxRate: 5.0,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    };
    await restaurantRepository.createMenuItem(miA2);
    restaurantStore.createMenuItem(miA2);

    const miAUnavail = {
      id: itemAUnavailId,
      restaurantId: restaurantAId,
      categoryId: catA.id,
      name: "Seasonal Truffle Pasta (Sold Out)",
      price: 450.00,
      taxRate: 5.0,
      dietaryType: "VEG",
      isAvailable: false,
      isActive: true
    };
    await restaurantRepository.createMenuItem(miAUnavail);
    restaurantStore.createMenuItem(miAUnavail);

    const miAInact = {
      id: itemAInactId,
      restaurantId: restaurantAId,
      categoryId: catA.id,
      name: "Archived Summer Drink",
      price: 120.00,
      taxRate: 5.0,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: false
    };
    await restaurantRepository.createMenuItem(miAInact);
    restaurantStore.createMenuItem(miAInact);

    const miB1 = {
      id: itemB1Id,
      restaurantId: restaurantBId,
      categoryId: catB.id,
      name: "Tuscan Grilled Chicken",
      price: 380.00,
      taxRate: 10.0,
      dietaryType: "NON_VEG",
      isAvailable: true,
      isActive: true
    };
    await restaurantRepository.createMenuItem(miB1);
    restaurantStore.createMenuItem(miB1);

    // Generate QR Tokens
    validQrTokenA = generateQrToken(restaurantAId, tableAId, branchAId);
    restaurantStore.updateTableQrToken(restaurantAId, tableAId, validQrTokenA);

    validQrTokenB = generateQrToken(restaurantBId, tableBId, branchBId);
    restaurantStore.updateTableQrToken(restaurantBId, tableBId, validQrTokenB);

    expiredQrToken = generateQrToken(restaurantAId, tableAId, branchAId, { ttlMs: -10000 });
    inactiveTableQrToken = generateQrToken(restaurantAId, tableInactiveId, branchAId);

    console.log("[Setup] Setup completed successfully.\n");

    // -------------------------------------------------------------
    // Test 1: Customer Table Session Initialization
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/session/${validQrTokenA}`,
        method: "POST"
      }, { guestCount: 2, customerName: "Alice" });

      assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.sessionId, "Session ID should be returned");
      assert.ok(res.body.sessionToken, "Customer session token should be returned");
      assert.strictEqual(res.body.restaurant.id, restaurantAId);
      assert.strictEqual(res.body.table.id, tableAId);

      sessionA = res.body.sessionId;
      sessionTokenA = res.body.sessionToken;

      passedTests++;
      console.log(`[PASS 01/28] Customer table session initialized via valid QR code`);
    }

    // -------------------------------------------------------------
    // Test 2: Expired QR Code Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/session/${expiredQrToken}`,
        method: "POST"
      });

      assert.strictEqual(res.statusCode, 401, "Expired QR token should return 401");
      assert.ok(res.body.error && res.body.error.toLowerCase().includes("expired"), "Error should mention expired");

      passedTests++;
      console.log(`[PASS 02/28] Expired QR token rejected with 401`);
    }

    // -------------------------------------------------------------
    // Test 3: Tampered QR Code Rejection
    // -------------------------------------------------------------
    {
      const tamperedQr = validQrTokenA.slice(0, -6) + "tamprX";
      const res = await makeRequest(testServer, {
        path: `/api/order/session/${tamperedQr}`,
        method: "POST"
      });

      assert.strictEqual(res.statusCode, 401, "Tampered QR token should return 401");

      passedTests++;
      console.log(`[PASS 03/28] Tampered QR code signature rejected with 401`);
    }

    // -------------------------------------------------------------
    // Test 4: Inactive Table Session Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/session/${inactiveTableQrToken}`,
        method: "POST"
      });

      assert.strictEqual(res.statusCode, 400, `Inactive table should return 400, got ${res.statusCode}`);
      assert.ok(res.body.error && res.body.error.includes("inactive"), "Error should mention table is inactive");

      passedTests++;
      console.log(`[PASS 04/28] Inactive/decommissioned table session rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 5: Session Resumption
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/session/${validQrTokenA}`,
        method: "POST"
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.sessionId, sessionA, "Subsequent scan of same table should resume active session");

      passedTests++;
      console.log(`[PASS 05/28] Consecutive scans resume existing active table session`);
    }

    // -------------------------------------------------------------
    // Test 6: Signed Customer Session Token Verification
    // -------------------------------------------------------------
    {
      const verified = verifyCustomerSessionToken(sessionTokenA);
      assert.strictEqual(verified.valid, true, "Customer session token should verify cryptographically");
      assert.strictEqual(verified.restaurantId, restaurantAId);
      assert.strictEqual(verified.tableId, tableAId);
      assert.strictEqual(verified.sessionId, sessionA);

      passedTests++;
      console.log(`[PASS 06/28] Customer session token cryptographically verified (HMAC-SHA256)`);
    }

    // -------------------------------------------------------------
    // Test 7: Missing / Invalid Session Token Rejected on Cart
    // -------------------------------------------------------------
    {
      // No header
      const res1 = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET"
      });
      assert.strictEqual(res1.statusCode, 401, "Missing session header should return 401");

      // Forged header
      const res2 = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": "bad.session.token" }
      });
      assert.strictEqual(res2.statusCode, 401, "Forged session token should return 401");

      passedTests++;
      console.log(`[PASS 07/28] Unauthenticated cart access rejected with 401`);
    }

    // -------------------------------------------------------------
    // Test 8: Cart Retrieval for New Session is Empty
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.itemCount, 0);
      assert.strictEqual(res.body.subtotal, 0);
      assert.strictEqual(Array.isArray(res.body.items), true);
      assert.strictEqual(res.body.items.length, 0);

      passedTests++;
      console.log(`[PASS 08/28] New customer session retrieves empty cart`);
    }

    // -------------------------------------------------------------
    // Test 9: Add Valid Menu Item to Cart
    // -------------------------------------------------------------
    let cartItem1Id;
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, {
        menuItemId: itemA1Id,
        quantity: 2,
        notes: "Mild spice"
      });

      assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.item.id);
      assert.strictEqual(res.body.item.quantity, 2);
      assert.strictEqual(res.body.item.menuItemId, itemA1Id);

      cartItem1Id = res.body.item.id;

      // Verify cart now contains the item
      const cartRes = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });
      assert.strictEqual(cartRes.body.itemCount, 2);
      assert.strictEqual(cartRes.body.subtotal, 560.00); // 280 * 2

      passedTests++;
      console.log(`[PASS 09/28] Add valid item to cart (quantity: 2, subtotal: 560.00)`);
    }

    // -------------------------------------------------------------
    // Test 10: Add Item Invalid Quantity Rejection
    // -------------------------------------------------------------
    {
      const resZero = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: itemA1Id, quantity: 0 });
      assert.strictEqual(resZero.statusCode, 400, "Quantity 0 should return 400");

      const resNeg = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: itemA1Id, quantity: -3 });
      assert.strictEqual(resNeg.statusCode, 400, "Negative quantity should return 400");

      const resString = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: itemA1Id, quantity: "invalid" });
      assert.strictEqual(resString.statusCode, 400, "Non-numeric quantity should return 400");

      passedTests++;
      console.log(`[PASS 10/28] Invalid cart quantities (0, negative, non-numeric) rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 11: Add Item Missing menuItemId Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { quantity: 1 });

      assert.strictEqual(res.statusCode, 400, "Missing menuItemId should return 400");

      passedTests++;
      console.log(`[PASS 11/28] Missing menuItemId rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 12: Add Unavailable Menu Item Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: itemAUnavailId, quantity: 1 });

      assert.strictEqual(res.statusCode, 400, `Unavailable item should return 400, got ${res.statusCode}`);
      assert.ok(res.body.error && res.body.error.includes("unavailable"), "Error should state item unavailable");

      passedTests++;
      console.log(`[PASS 12/28] Unavailable menu item (isAvailable = false) rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 13: Add Inactive Menu Item Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: itemAInactId, quantity: 1 });

      assert.strictEqual(res.statusCode, 400, "Inactive item should return 400");
      assert.ok(res.body.error && res.body.error.includes("active"), "Error should state item not active");

      passedTests++;
      console.log(`[PASS 13/28] Deactivated menu item (isActive = false) rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 14: Add Non-Existent Menu Item Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: "non-existent-menu-item-999", quantity: 1 });

      assert.strictEqual(res.statusCode, 404, "Non-existent item should return 404");

      passedTests++;
      console.log(`[PASS 14/28] Non-existent menuItemId rejected with 404`);
    }

    // -------------------------------------------------------------
    // Test 15: Absolute Price Security (Client-supplied price ignored)
    // -------------------------------------------------------------
    {
      // Attacker tries to submit price: 1.00 for a 60.00 item
      await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, {
        menuItemId: itemA2Id,
        quantity: 1,
        price: 1.00, // Tampered price
        lineTotal: 1.00
      });

      const cartRes = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });

      const naan = cartRes.body.items.find(i => i.menuItemId === itemA2Id);
      assert.ok(naan, "Naan should be in cart");
      assert.strictEqual(naan.price, 60.00, `Price must be authoritative catalog price (60.00), got ${naan.price}`);
      assert.strictEqual(naan.lineTotal, 60.00);

      passedTests++;
      console.log(`[PASS 15/28] Absolute price security: Client-supplied price (1.00) ignored; catalog price (60.00) enforced`);
    }

    // -------------------------------------------------------------
    // Test 16: Cross-Tenant Item Injection Rejection
    // -------------------------------------------------------------
    {
      // Customer at Restaurant A attempts to add item from Restaurant B
      const res = await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, {
        menuItemId: itemB1Id,
        quantity: 1
      });

      assert.ok([403, 404].includes(res.statusCode), `Cross-tenant item must return 403 or 404, got ${res.statusCode}`);

      passedTests++;
      console.log(`[PASS 16/28] Cross-tenant item injection blocked (Restaurant A session rejected Restaurant B item)`);
    }

    // -------------------------------------------------------------
    // Test 17: Cart Item Quantity Update
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/cart/items/${cartItem1Id}`,
        method: "PATCH",
        headers: { "X-Session-Token": sessionTokenA }
      }, { quantity: 3 });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.item.quantity, 3);

      const cartRes = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });
      // 3 bowls @ 280 (840) + 1 naan @ 60 (60) = 900
      assert.strictEqual(cartRes.body.subtotal, 900.00);

      passedTests++;
      console.log(`[PASS 17/28] Cart item quantity successfully updated (2 -> 3)`);
    }

    // -------------------------------------------------------------
    // Test 18: Cart Item Quantity Update Invalid Value Rejection
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/cart/items/${cartItem1Id}`,
        method: "PATCH",
        headers: { "X-Session-Token": sessionTokenA }
      }, { quantity: 0 });

      assert.strictEqual(res.statusCode, 400, "Updating quantity to 0 should return 400 (use DELETE instead)");

      passedTests++;
      console.log(`[PASS 18/28] Invalid quantity update (<= 0) rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 19: Cross-Session Cart Item Tampering Rejection
    // -------------------------------------------------------------
    {
      // Initialize Session B for Restaurant B
      const sessBRes = await makeRequest(testServer, {
        path: `/api/order/session/${validQrTokenB}`,
        method: "POST"
      });
      sessionB = sessBRes.body.sessionId;
      sessionTokenB = sessBRes.body.sessionToken;

      // Customer B tries to modify Customer A's cart item
      const resPatch = await makeRequest(testServer, {
        path: `/api/order/cart/items/${cartItem1Id}`,
        method: "PATCH",
        headers: { "X-Session-Token": sessionTokenB }
      }, { quantity: 10 });
      assert.strictEqual(resPatch.statusCode, 404, "Cross-session PATCH must return 404");

      const resDel = await makeRequest(testServer, {
        path: `/api/order/cart/items/${cartItem1Id}`,
        method: "DELETE",
        headers: { "X-Session-Token": sessionTokenB }
      });
      assert.strictEqual(resDel.statusCode, 404, "Cross-session DELETE must return 404");

      passedTests++;
      console.log(`[PASS 19/28] Cross-session cart item tampering strictly rejected (Session B cannot alter Session A cart)`);
    }

    // -------------------------------------------------------------
    // Test 20: Cart Item Deletion
    // -------------------------------------------------------------
    {
      // Find cart item ID for naan
      const cartResBefore = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });
      const naanItem = cartResBefore.body.items.find(i => i.menuItemId === itemA2Id);
      assert.ok(naanItem, "Naan item should be in cart before deletion");

      const delRes = await makeRequest(testServer, {
        path: `/api/order/cart/items/${naanItem.id}`,
        method: "DELETE",
        headers: { "X-Session-Token": sessionTokenA }
      });
      assert.strictEqual(delRes.statusCode, 200);

      const cartResAfter = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });
      assert.strictEqual(cartResAfter.body.itemCount, 3); // Only 3 bowls remain
      assert.strictEqual(cartResAfter.body.subtotal, 840.00);

      passedTests++;
      console.log(`[PASS 20/28] Cart item deletion verified (DELETE /api/order/cart/items/:id)`);
    }

    // -------------------------------------------------------------
    // Test 21: Order Placement with Empty Cart Rejection
    // -------------------------------------------------------------
    {
      // Session B cart is currently empty
      const res = await makeRequest(testServer, {
        path: "/api/order/place",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenB }
      }, { notes: "Should fail" });

      assert.strictEqual(res.statusCode, 400, "Placing empty order should return 400");
      assert.ok(res.body.error && res.body.error.includes("empty"), "Error should indicate cart is empty");

      passedTests++;
      console.log(`[PASS 21/28] Order placement with empty cart rejected with 400`);
    }

    // -------------------------------------------------------------
    // Test 22: Valid Atomic Order Placement
    // -------------------------------------------------------------
    let placedOrder1;
    const testIdempotencyKey = `idem-key-${Date.now()}`;
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/place",
        method: "POST",
        headers: {
          "X-Session-Token": sessionTokenA,
          "Idempotency-Key": testIdempotencyKey
        }
      }, { notes: "Table needs high chair" });

      assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.order, "Order object should be returned");
      assert.strictEqual(res.body.order.status, "NEW");
      assert.strictEqual(res.body.order.subtotal, 840.00);
      assert.strictEqual(res.body.order.taxAmount, 42.00); // 5% of 840
      assert.strictEqual(res.body.order.totalAmount, 882.00);
      assert.ok(res.body.order.orderNumber.startsWith("ORD-"));
      assert.strictEqual(res.body.order.items.length, 1);
      assert.strictEqual(res.body.order.items[0].unitPrice, 280.00);

      placedOrder1 = res.body.order;

      passedTests++;
      console.log(`[PASS 22/28] Atomic order placed successfully (Order #${placedOrder1.orderNumber}, Total: 882.00)`);
    }

    // -------------------------------------------------------------
    // Test 23: Cart Cleared Upon Successful Order Placement
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: "/api/order/cart",
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.itemCount, 0, "Cart should be empty after placement");
      assert.strictEqual(res.body.subtotal, 0);

      passedTests++;
      console.log(`[PASS 23/28] Cart automatically cleared upon order placement`);
    }

    // -------------------------------------------------------------
    // Test 24: Immutable Historical Price Snapshot Protection
    // -------------------------------------------------------------
    {
      // Update catalog price of Butter Paneer Bowl from 280 to 350
      restaurantStore.updateMenuItem(restaurantAId, itemA1Id, { price: 350.00 });

      // Verify catalog price is now 350
      const updatedCatalogItem = restaurantStore.getMenuItemById(restaurantAId, itemA1Id);
      assert.strictEqual(updatedCatalogItem.price, 350.00);

      // Verify the previously placed order's snapshotted line items still retain 280.00
      const orderRes = await makeRequest(testServer, {
        path: `/api/order/status/${placedOrder1.id}`,
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });

      assert.strictEqual(orderRes.statusCode, 200);
      assert.strictEqual(orderRes.body.order.subtotal, 840.00, "Historical order subtotal must remain 840.00");
      assert.strictEqual(orderRes.body.order.items[0].unitPrice, 280.00, "Historical item unitPrice must remain 280.00");

      passedTests++;
      console.log(`[PASS 24/28] Immutable historical price snapshot: catalog price changed to 350.00, order remains 280.00`);
    }

    // -------------------------------------------------------------
    // Test 25: Availability Revalidation at Order Placement Time
    // -------------------------------------------------------------
    {
      // Add Garlic Butter Naan to cart
      await makeRequest(testServer, {
        path: "/api/order/cart/items",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      }, { menuItemId: itemA2Id, quantity: 2 });

      // Kitchen suddenly marks Garlic Butter Naan as UNAVAILABLE before customer hits confirm
      restaurantStore.updateMenuItem(restaurantAId, itemA2Id, { isAvailable: false });

      // Attempt to place order
      const placeRes = await makeRequest(testServer, {
        path: "/api/order/place",
        method: "POST",
        headers: { "X-Session-Token": sessionTokenA }
      });

      assert.strictEqual(placeRes.statusCode, 400, "Order placement should fail if item became unavailable");
      assert.ok(placeRes.body.error && placeRes.body.error.includes("unavailable"), "Error should report item unavailable");

      // Restore availability
      restaurantStore.updateMenuItem(restaurantAId, itemA2Id, { isAvailable: true });

      passedTests++;
      console.log(`[PASS 25/28] Live availability revalidation: Order rejected when item marked unavailable before checkout`);
    }

    // -------------------------------------------------------------
    // Test 26: Double-Submission / Idempotency Protection
    // -------------------------------------------------------------
    {
      // Re-send order with testIdempotencyKey from Test 22
      const res = await makeRequest(testServer, {
        path: "/api/order/place",
        method: "POST",
        headers: {
          "X-Session-Token": sessionTokenA,
          "Idempotency-Key": testIdempotencyKey
        }
      });

      assert.strictEqual(res.statusCode, 200, "Idempotent replay should return 200 with cached order");
      assert.strictEqual(res.body.order.id, placedOrder1.id, "Should return original order ID");
      assert.strictEqual(res.body.idempotentReplay, true);

      passedTests++;
      console.log(`[PASS 26/28] Double-submission protection: Duplicate submission with same Idempotency-Key returned cached order`);
    }

    // -------------------------------------------------------------
    // Test 27: Order Status Retrieval
    // -------------------------------------------------------------
    {
      const res = await makeRequest(testServer, {
        path: `/api/order/status/${placedOrder1.id}`,
        method: "GET",
        headers: { "X-Session-Token": sessionTokenA }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.order.id, placedOrder1.id);
      assert.strictEqual(res.body.order.status, "NEW");
      assert.ok(res.body.order.createdAt);
      assert.strictEqual(res.body.order.items.length, 1);
      assert.strictEqual(res.body.order.items[0].itemName, "Butter Paneer Bowl");

      passedTests++;
      console.log(`[PASS 27/28] Order status retrieval verified (GET /api/order/status/:orderId)`);
    }

    // -------------------------------------------------------------
    // Test 28: Cross-Session / Cross-Tenant Order Status Rejection
    // -------------------------------------------------------------
    {
      // Session B (Restaurant B) tries to view placedOrder1 (from Session A / Restaurant A)
      const res = await makeRequest(testServer, {
        path: `/api/order/status/${placedOrder1.id}`,
        method: "GET",
        headers: { "X-Session-Token": sessionTokenB }
      });

      assert.strictEqual(res.statusCode, 403, "Cross-session/cross-tenant order access should return 403");

      passedTests++;
      console.log(`[PASS 28/28] Cross-session/cross-tenant order inspection rejected with 403`);
    }

    console.log("\n===============================================================");
    console.log(`PHASE 4 VERIFICATION RESULTS: ${passedTests}/${totalTests} PASSED`);
    console.log("===============================================================\n");

  } finally {
    await new Promise((resolve) => testServer.close(resolve));
    await closePool();
  }
}

if (require.main === module) {
  runSuite()
    .then(() => {
      console.log("Phase 4 test execution completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Phase 4 Test Suite Failed:", err);
      process.exit(1);
    });
}

module.exports = { runSuite };
