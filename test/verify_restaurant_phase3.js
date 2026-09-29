/**
 * Restaurant OS v1 - Phase 3 Verification Suite
 * Menu Catalog + Secure QR Table Access
 *
 * Validates all 28 required test areas:
 * 1. Category creation
 * 2. Category listing
 * 3. Category update
 * 4. Duplicate category rejection
 * 5. Cross-tenant category isolation
 * 6. Menu item creation
 * 7. Menu item listing
 * 8. Menu item filtering
 * 9. Menu item update
 * 10. Invalid price rejection
 * 11. Invalid dietary type rejection
 * 12. Invalid category ownership rejection
 * 13. Cross-tenant item isolation
 * 14. Secure QR generation
 * 15. Valid QR validation
 * 16. Invalid QR rejection
 * 17. Tampered QR rejection
 * 18. Expired QR rejection
 * 19. QR rotation/invalidation
 * 20. Cross-tenant QR isolation
 * 21. Restaurant B's QR cannot access Restaurant A's menu
 * 22. Restaurant A's QR cannot access Restaurant B's menu
 * 23. Menu price change
 * 24. Existing historical order-item price snapshot remains unchanged
 * 25. Valid QR returns correct restaurant menu
 * 26. Inactive items are not returned
 * 27. Other restaurant's items are never returned
 * 28. No administrative secrets are exposed
 */

const assert = require("assert");
const http = require("http");
require("dotenv").config();

const server = require("../server");
const userStore = require("../memory/userStore");
const { createSession } = require("../security/session");
const restaurantStore = require("../memory/restaurantStore");
const restaurantRepository = require("../memory/repositories/restaurantRepository");
const { generateQrToken, verifyQrToken } = require("../security/qrToken");
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

async function runPhase3Tests() {
  console.log("================================================================");
  console.log("RESTAURANT OS v1 - PHASE 3 VERIFICATION SUITE");
  console.log("Menu Catalog + Secure QR Table Access + Multi-Tenant Protection");
  console.log("================================================================\n");

  const testServer = http.createServer(server.listeners("request")[0]);
  await new Promise(resolve => testServer.listen(0, "127.0.0.1", resolve));
  const serverPort = testServer.address().port;
  console.log(`Test server running on port ${serverPort}\n`);

  try {
    // -------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------
    const runId = Math.floor(Math.random() * 1000000);
    const tenantA = `client-p3-sb-${runId}`;
    const tenantB = `client-p3-bi-${runId}`;

    // Setup restaurant profiles
    await restaurantRepository.updateRestaurantProfile(tenantA, {
      name: "SpiceBox Gourmet",
      company: "SpiceBox Hospitality Group",
      email: "spicebox-p3@example.com",
      phone: "+1-555-1100",
      currency: "INR",
      taxRate: 5.0,
      operatingHours: "11:00 AM - 11:00 PM",
      branding: { themeColor: "#f97316" }
    });
    restaurantStore.updateRestaurantProfile(tenantA, {
      name: "SpiceBox Gourmet",
      company: "SpiceBox Hospitality Group",
      email: "spicebox-p3@example.com",
      phone: "+1-555-1100",
      currency: "INR",
      taxRate: 5.0,
      operatingHours: "11:00 AM - 11:00 PM",
      branding: { themeColor: "#f97316" }
    });

    await restaurantRepository.updateRestaurantProfile(tenantB, {
      name: "Bella Italia Bistro",
      company: "Bella Italia Group",
      email: "bella-p3@example.com",
      phone: "+1-555-2200",
      currency: "EUR",
      taxRate: 10.0,
      operatingHours: "12:00 PM - 10:00 PM",
      branding: { themeColor: "#059669" }
    });
    restaurantStore.updateRestaurantProfile(tenantB, {
      name: "Bella Italia Bistro",
      company: "Bella Italia Group",
      email: "bella-p3@example.com",
      phone: "+1-555-2200",
      currency: "EUR",
      taxRate: 10.0,
      operatingHours: "12:00 PM - 10:00 PM",
      branding: { themeColor: "#059669" }
    });

    // Setup Users & Sessions
    const rand = Math.floor(Math.random() * 100000);
    const userA = userStore.createUser({
      name: "SpiceBox Admin",
      email: `admin.spicebox.${rand}@example.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: tenantA
    });

    const userB = userStore.createUser({
      name: "Bella Admin",
      email: `admin.bella.${rand}@example.com`,
      password: "Password123!",
      role: "DELIVERY",
      restaurantId: tenantB
    });

    const sessionA = createSession(userA);
    const sessionB = createSession(userB);

    const authA = { Authorization: `Bearer ${sessionA.token}` };
    const authB = { Authorization: `Bearer ${sessionB.token}` };

    // Create Branches via API
    const brnARes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authA
    }, {
      name: `Downtown Spice Central ${rand}`,
      address: "100 Curry Boulevard",
      city: "Metro City",
      phone: "+1-555-1101"
    });
    assert.strictEqual(brnARes.statusCode, 201, `Failed to create branchA: ${JSON.stringify(brnARes.body)}`);
    const branchA = brnARes.body.branch;

    const brnBRes = await makeRequest(testServer, {
      path: "/api/restaurant/branches",
      method: "POST",
      headers: authB
    }, {
      name: `Bella Trastevere ${rand}`,
      address: "200 Piazza Venezia",
      city: "Rome",
      phone: "+1-555-2201"
    });
    assert.strictEqual(brnBRes.statusCode, 201, `Failed to create branchB: ${JSON.stringify(brnBRes.body)}`);
    const branchB = brnBRes.body.branch;

    // Create Tables via API
    const tblARes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA.id,
      tableNumber: `T01-${rand}`,
      name: "Window Table 1",
      capacity: 4
    });
    assert.strictEqual(tblARes.statusCode, 201, `Failed to create tableA: ${JSON.stringify(tblARes.body)}`);
    const tableA = tblARes.body.table;

    const tblBRes = await makeRequest(testServer, {
      path: "/api/restaurant/tables",
      method: "POST",
      headers: authB
    }, {
      branchId: branchB.id,
      tableNumber: `TB01-${rand}`,
      name: "Garden Table 1",
      capacity: 2
    });
    assert.strictEqual(tblBRes.statusCode, 201, `Failed to create tableB: ${JSON.stringify(tblBRes.body)}`);
    const tableB = tblBRes.body.table;

    console.log("✔ Test fixtures and auth sessions ready.\n");

    // =============================================================
    // CHECK 1: Category Creation
    // =============================================================
    console.log("Check 1: Category creation (POST /api/restaurant/menu/categories)...");
    const catRes1 = await makeRequest(testServer, {
      path: "/api/restaurant/menu/categories",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA.id,
      name: "Starters & Appetizers",
      description: "Delicious starters to begin your meal",
      displayOrder: 1
    });
    assert.strictEqual(catRes1.statusCode, 201, `Category creation failed: ${JSON.stringify(catRes1.body)}`);
    assert(catRes1.body.category && catRes1.body.category.id, "Category ID must be returned");
    assert.strictEqual(catRes1.body.category.name, "Starters & Appetizers");
    const categoryStarters = catRes1.body.category;
    console.log(`✔ Check 1 PASSED: Category created (${categoryStarters.id})`);

    // Create a second category for tenant A
    const catRes2 = await makeRequest(testServer, {
      path: "/api/restaurant/menu/categories",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA.id,
      name: "Main Course",
      description: "Hearty main curries and breads",
      displayOrder: 2
    });
    assert.strictEqual(catRes2.statusCode, 201);
    const categoryMains = catRes2.body.category;

    // =============================================================
    // CHECK 2: Category Listing
    // =============================================================
    console.log("\nCheck 2: Category listing (GET /api/restaurant/menu/categories)...");
    const listCatRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/categories",
      method: "GET",
      headers: authA
    });
    assert.strictEqual(listCatRes.statusCode, 200);
    assert(Array.isArray(listCatRes.body.categories), "Categories must be an array");
    const catNames = listCatRes.body.categories.map(c => c.name);
    assert(catNames.includes("Starters & Appetizers") && catNames.includes("Main Course"), "Created categories must be present");
    // Verify sorting order: displayOrder ASC
    assert.strictEqual(listCatRes.body.categories[0].name, "Starters & Appetizers");
    console.log("✔ Check 2 PASSED: Category listing returned ordered categories");

    // =============================================================
    // CHECK 3: Category Update
    // =============================================================
    console.log("\nCheck 3: Category update (PATCH /api/restaurant/menu/categories/:id)...");
    const updateCatRes = await makeRequest(testServer, {
      path: `/api/restaurant/menu/categories/${categoryStarters.id}`,
      method: "PATCH",
      headers: authA
    }, {
      name: "Gourmet Starters & Tapas",
      displayOrder: 1
    });
    assert.strictEqual(updateCatRes.statusCode, 200);
    assert.strictEqual(updateCatRes.body.category.name, "Gourmet Starters & Tapas");
    console.log("✔ Check 3 PASSED: Category updated successfully");

    // =============================================================
    // CHECK 4: Duplicate Category Rejection
    // =============================================================
    console.log("\nCheck 4: Duplicate category rejection...");
    const dupCatRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/categories",
      method: "POST",
      headers: authA
    }, {
      branchId: branchA.id,
      name: "Gourmet Starters & Tapas", // Duplicate!
      displayOrder: 3
    });
    assert.strictEqual(dupCatRes.statusCode, 409, `Expected 409 Conflict, got ${dupCatRes.statusCode}`);
    console.log("✔ Check 4 PASSED: Duplicate category rejected with 409 Conflict");

    // =============================================================
    // CHECK 5: Cross-Tenant Category Isolation
    // =============================================================
    console.log("\nCheck 5: Cross-tenant category isolation...");
    // Restaurant B tries to update Restaurant A's category
    const bUpdateCat = await makeRequest(testServer, {
      path: `/api/restaurant/menu/categories/${categoryStarters.id}`,
      method: "PATCH",
      headers: authB
    }, {
      name: "Hacked Category"
    });
    assert.strictEqual(bUpdateCat.statusCode, 404, "Tenant B must not update Tenant A category");

    // Restaurant B listing must not contain Tenant A categories
    const bListCat = await makeRequest(testServer, {
      path: "/api/restaurant/menu/categories",
      method: "GET",
      headers: authB
    });
    assert.strictEqual(bListCat.statusCode, 200);
    const bCatIds = bListCat.body.categories.map(c => c.id);
    assert(!bCatIds.includes(categoryStarters.id), "Tenant B list must not contain Tenant A category");
    console.log("✔ Check 5 PASSED: Cross-tenant category isolation verified");

    // =============================================================
    // CHECK 6: Menu Item Creation
    // =============================================================
    console.log("\nCheck 6: Menu item creation (POST /api/restaurant/menu/items)...");
    const item1Res = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryStarters.id,
      branchId: branchA.id,
      name: "Paneer Tikka Royale",
      description: "Clay-oven roasted cottage cheese infused with saffron and spices",
      price: 14.50,
      currency: "INR",
      taxRate: 5.0,
      dietaryType: "VEG",
      isAvailable: true,
      displayOrder: 1
    });
    assert.strictEqual(item1Res.statusCode, 201, `Failed to create item: ${JSON.stringify(item1Res.body)}`);
    assert(item1Res.body.item && item1Res.body.item.id);
    assert.strictEqual(item1Res.body.item.dietaryType, "VEG");
    assert.strictEqual(item1Res.body.item.price, 14.50);
    const itemPaneer = item1Res.body.item;
    console.log(`✔ Check 6 PASSED: Menu item created (${itemPaneer.id}, ${itemPaneer.name})`);

    // Create item 2 (Non-Veg)
    const item2Res = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryMains.id,
      branchId: branchA.id,
      name: "Butter Chicken Classic",
      description: "Tender shredded tandoori chicken simmered in rich tomato makhani sauce",
      price: 18.00,
      currency: "INR",
      taxRate: 5.0,
      dietaryType: "NON_VEG",
      isAvailable: true,
      displayOrder: 1
    });
    assert.strictEqual(item2Res.statusCode, 201);
    const itemButterChicken = item2Res.body.item;

    // Create item 3 (Vegan)
    const item3Res = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryMains.id,
      branchId: branchA.id,
      name: "Yellow Dal Tadka",
      description: "Tempered yellow lentils with cumin, garlic and whole red chilies",
      price: 12.00,
      currency: "INR",
      taxRate: 5.0,
      dietaryType: "VEGAN",
      isAvailable: true,
      displayOrder: 2
    });
    assert.strictEqual(item3Res.statusCode, 201);
    const itemDal = item3Res.body.item;

    // =============================================================
    // CHECK 7: Menu Item Listing
    // =============================================================
    console.log("\nCheck 7: Menu item listing (GET /api/restaurant/menu/items)...");
    const listItemsRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "GET",
      headers: authA
    });
    assert.strictEqual(listItemsRes.statusCode, 200);
    assert(Array.isArray(listItemsRes.body.items));
    const itemNames = listItemsRes.body.items.map(i => i.name);
    assert(itemNames.includes("Paneer Tikka Royale"));
    assert(itemNames.includes("Butter Chicken Classic"));
    assert(itemNames.includes("Yellow Dal Tadka"));
    console.log(`✔ Check 7 PASSED: Menu item listing returned ${listItemsRes.body.items.length} items`);

    // =============================================================
    // CHECK 8: Menu Item Filtering
    // =============================================================
    console.log("\nCheck 8: Menu item filtering...");
    // Filter by dietaryType=VEGAN
    const filterVeganRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items?dietaryType=VEGAN",
      method: "GET",
      headers: authA
    });
    assert.strictEqual(filterVeganRes.statusCode, 200);
    assert(filterVeganRes.body.items.every(i => i.dietaryType === "VEGAN"), "All items must be VEGAN");
    assert(filterVeganRes.body.items.some(i => i.id === itemDal.id), "Dal must be in filtered list");

    // Filter by categoryId
    const filterCatRes = await makeRequest(testServer, {
      path: `/api/restaurant/menu/items?categoryId=${categoryStarters.id}`,
      method: "GET",
      headers: authA
    });
    assert.strictEqual(filterCatRes.statusCode, 200);
    assert(filterCatRes.body.items.every(i => i.categoryId === categoryStarters.id));
    console.log("✔ Check 8 PASSED: Menu item filtering by dietaryType and categoryId works");

    // =============================================================
    // CHECK 9: Menu Item Update
    // =============================================================
    console.log("\nCheck 9: Menu item update (PATCH /api/restaurant/menu/items/:id)...");
    const updateItemRes = await makeRequest(testServer, {
      path: `/api/restaurant/menu/items/${itemPaneer.id}`,
      method: "PATCH",
      headers: authA
    }, {
      description: "Updated description with royal saffron garnish",
      price: 15.50
    });
    assert.strictEqual(updateItemRes.statusCode, 200);
    assert.strictEqual(updateItemRes.body.item.price, 15.50);
    assert.strictEqual(updateItemRes.body.item.description, "Updated description with royal saffron garnish");
    console.log("✔ Check 9 PASSED: Menu item updated successfully");

    // =============================================================
    // CHECK 10: Invalid Price Rejection
    // =============================================================
    console.log("\nCheck 10: Invalid price rejection (negative price)...");
    const negPriceRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryStarters.id,
      name: "Negative Price Item",
      price: -10.00
    });
    assert.strictEqual(negPriceRes.statusCode, 400, "Negative price must be rejected with 400");
    console.log("✔ Check 10 PASSED: Negative price rejected");

    // =============================================================
    // CHECK 11: Invalid Dietary Type Rejection
    // =============================================================
    console.log("\nCheck 11: Invalid dietary type rejection...");
    const badDietRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryStarters.id,
      name: "Pescatarian Dish",
      price: 12.00,
      dietaryType: "PESCATARIAN" // Invalid! Only VEG, NON_VEG, VEGAN, EGG allowed
    });
    assert.strictEqual(badDietRes.statusCode, 400, "Invalid dietary type must be rejected with 400");
    console.log("✔ Check 11 PASSED: Invalid dietary type rejected");

    // =============================================================
    // CHECK 12: Invalid Category Ownership Rejection
    // =============================================================
    console.log("\nCheck 12: Invalid category ownership rejection (cross-tenant category reference)...");
    // Tenant B creates a category
    const catBRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/categories",
      method: "POST",
      headers: authB
    }, {
      branchId: branchB.id,
      name: "Pasta & Risotto",
      displayOrder: 1
    });
    assert.strictEqual(catBRes.statusCode, 201);
    const catB = catBRes.body.category;

    // Tenant A tries to create an item pointing to Tenant B's category
    const crossCatItemRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: catB.id,
      name: "Invalid Tenant Category Dish",
      price: 15.00
    });
    assert.strictEqual(crossCatItemRes.statusCode, 400, "Referencing another tenant's category must be rejected");
    console.log("✔ Check 12 PASSED: Cross-tenant category ownership rejection verified");

    // =============================================================
    // CHECK 13: Cross-Tenant Item Isolation
    // =============================================================
    console.log("\nCheck 13: Cross-tenant item isolation...");
    // Tenant B tries to update Tenant A's item
    const bUpdateItem = await makeRequest(testServer, {
      path: `/api/restaurant/menu/items/${itemPaneer.id}`,
      method: "PATCH",
      headers: authB
    }, {
      name: "Hacked Item"
    });
    assert.strictEqual(bUpdateItem.statusCode, 404, "Tenant B must not update Tenant A item");

    // Tenant B tries to delete Tenant A's item
    const bDeleteItem = await makeRequest(testServer, {
      path: `/api/restaurant/menu/items/${itemPaneer.id}`,
      method: "DELETE",
      headers: authB
    });
    assert.strictEqual(bDeleteItem.statusCode, 404, "Tenant B must not delete Tenant A item");
    console.log("✔ Check 13 PASSED: Cross-tenant item isolation confirmed");

    // =============================================================
    // CHECK 14: Secure QR Generation
    // =============================================================
    console.log("\nCheck 14: Secure QR generation (GET /api/restaurant/tables/:id/qr)...");
    const qrRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tableA.id}/qr`,
      method: "GET",
      headers: authA
    });
    assert.strictEqual(qrRes.statusCode, 200, `Failed to generate QR: ${JSON.stringify(qrRes.body)}`);
    assert(qrRes.body.qrToken, "QR token must be returned");
    assert(qrRes.body.orderUrl && qrRes.body.orderUrl.startsWith("/order/"), "orderUrl must be formatted");
    const activeTokenA = qrRes.body.qrToken;
    console.log(`✔ Check 14 PASSED: Secure QR token generated (${activeTokenA.substring(0, 24)}...)`);

    // =============================================================
    // CHECK 15: Valid QR Validation (Public Menu Access)
    // =============================================================
    console.log("\nCheck 15: Valid QR validation (GET /api/order/menu/:qrToken)...");
    const menuPublicRes = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(activeTokenA)}`,
      method: "GET"
      // Note: No auth header! This is public customer access
    });
    assert.strictEqual(menuPublicRes.statusCode, 200, `Public menu fetch failed: ${JSON.stringify(menuPublicRes.body)}`);
    assert.strictEqual(menuPublicRes.body.valid, true);
    assert.strictEqual(menuPublicRes.body.restaurant.name, "SpiceBox Gourmet");
    assert.strictEqual(menuPublicRes.body.table.id, tableA.id);
    assert.strictEqual(menuPublicRes.body.table.tableNumber, tableA.tableNumber);
    assert(Array.isArray(menuPublicRes.body.categories));
    assert(Array.isArray(menuPublicRes.body.items));
    console.log(`✔ Check 15 PASSED: Valid QR accessed customer menu (${menuPublicRes.body.items.length} items)`);

    // =============================================================
    // CHECK 16: Invalid QR Rejection
    // =============================================================
    console.log("\nCheck 16: Invalid QR rejection...");
    const invalidQrRes = await makeRequest(testServer, {
      path: "/api/order/menu/completely-invalid-malformed-token-xyz",
      method: "GET"
    });
    assert(invalidQrRes.statusCode === 400 || invalidQrRes.statusCode === 401, `Expected 400/401, got ${invalidQrRes.statusCode}`);
    console.log("✔ Check 16 PASSED: Malformed QR token rejected");

    // =============================================================
    // CHECK 17: Tampered QR Rejection
    // =============================================================
    console.log("\nCheck 17: Tampered QR rejection (modified signature)...");
    const parts = activeTokenA.split(".");
    // Tamper the signature part: parts[0] is payload, parts[1] is signature
    const tamperedSig = parts[1] ? (parts[1].slice(0, -3) + "xyz") : "tampered";
    const tamperedToken = `${parts[0]}.${tamperedSig}`;
    const tamperedRes = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(tamperedToken)}`,
      method: "GET"
    });
    assert(tamperedRes.statusCode === 400 || tamperedRes.statusCode === 401, `Expected 400/401, got ${tamperedRes.statusCode}`);
    console.log("✔ Check 17 PASSED: Tampered QR token rejected with signature verification failure");

    // =============================================================
    // CHECK 18: Expired QR Rejection
    // =============================================================
    console.log("\nCheck 18: Expired QR rejection...");
    // Generate token with negative TTL to simulate expiration
    const expiredToken = generateQrToken(tenantA, tableA.id, branchA.id, { ttlMs: -100000 });
    const expiredRes = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(expiredToken)}`,
      method: "GET"
    });
    assert(expiredRes.statusCode === 400 || expiredRes.statusCode === 401, `Expected 400/401, got ${expiredRes.statusCode}`);
    console.log("✔ Check 18 PASSED: Expired QR token rejected");

    // =============================================================
    // CHECK 19: QR Rotation / Invalidation
    // =============================================================
    console.log("\nCheck 19: QR rotation/invalidation (POST /api/restaurant/tables/:id/qr/rotate)...");
    const rotateRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tableA.id}/qr/rotate`,
      method: "POST",
      headers: authA
    });
    assert.strictEqual(rotateRes.statusCode, 200);
    assert.strictEqual(rotateRes.body.rotated, true);
    assert(rotateRes.body.qrToken && rotateRes.body.qrToken !== activeTokenA, "New token must differ from old token");
    const newTokenA = rotateRes.body.qrToken;

    // Previous token MUST now be invalidated
    const oldTokenCheck = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(activeTokenA)}`,
      method: "GET"
    });
    assert(oldTokenCheck.statusCode === 401 || oldTokenCheck.statusCode === 400, "Old token must be rejected after rotation");

    // New token MUST work
    const newTokenCheck = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(newTokenA)}`,
      method: "GET"
    });
    assert.strictEqual(newTokenCheck.statusCode, 200, "New token must succeed");
    console.log("✔ Check 19 PASSED: QR rotation invalidated previous token and activated new token");

    // =============================================================
    // CHECK 20: Cross-Tenant QR Isolation
    // =============================================================
    console.log("\nCheck 20: Cross-tenant QR isolation (Tenant B staff cannot access/rotate Tenant A QR)...");
    const bAccessAQr = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tableA.id}/qr`,
      method: "GET",
      headers: authB
    });
    assert.strictEqual(bAccessAQr.statusCode, 404, "Tenant B must not access Tenant A table QR");

    const bRotateAQr = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tableA.id}/qr/rotate`,
      method: "POST",
      headers: authB
    });
    assert.strictEqual(bRotateAQr.statusCode, 404, "Tenant B must not rotate Tenant A table QR");
    console.log("✔ Check 20 PASSED: Cross-tenant QR staff actions isolated");

    // =============================================================
    // CHECK 21: Restaurant B's QR cannot access Restaurant A's menu
    // =============================================================
    console.log("\nCheck 21: Restaurant B's QR cannot access Restaurant A's menu...");
    // Generate QR for Tenant B's table
    const qrBRes = await makeRequest(testServer, {
      path: `/api/restaurant/tables/${tableB.id}/qr`,
      method: "GET",
      headers: authB
    });
    assert.strictEqual(qrBRes.statusCode, 200);
    const tokenB = qrBRes.body.qrToken;

    const menuBRes = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(tokenB)}`,
      method: "GET"
    });
    assert.strictEqual(menuBRes.statusCode, 200);
    assert.strictEqual(menuBRes.body.restaurant.name, "Bella Italia Bistro");
    assert.notStrictEqual(menuBRes.body.restaurant.id, tenantA);
    // None of Tenant A items should be in Tenant B menu
    const menuBItemIds = menuBRes.body.items.map(i => i.id);
    assert(!menuBItemIds.includes(itemPaneer.id));
    assert(!menuBItemIds.includes(itemButterChicken.id));
    console.log("✔ Check 21 PASSED: Restaurant B's QR returns only Restaurant B's menu");

    // =============================================================
    // CHECK 22: Restaurant A's QR cannot access Restaurant B's menu
    // =============================================================
    console.log("\nCheck 22: Restaurant A's QR cannot access Restaurant B's menu...");
    const menuARes = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(newTokenA)}`,
      method: "GET"
    });
    assert.strictEqual(menuARes.statusCode, 200);
    assert.strictEqual(menuARes.body.restaurant.id, tenantA);
    assert.strictEqual(menuARes.body.restaurant.name, "SpiceBox Gourmet");
    const menuAItemIds = menuARes.body.items.map(i => i.id);
    assert(!menuAItemIds.includes(catB.id));
    console.log("✔ Check 22 PASSED: Restaurant A's QR returns only Restaurant A's menu");

    // =============================================================
    // CHECK 23 & 24: Menu Price Change & Historical Price Snapshot Protection
    // =============================================================
    console.log("\nCheck 23 & 24: Menu price change & historical price snapshot protection...");
    // 1. Create a simulated historical order with itemPaneer at current price (15.50)
    const testSession = restaurantStore.createTableSession({
      restaurantId: tenantA,
      branchId: branchA.id,
      tableId: tableA.id,
      guestCount: 2
    });
    await restaurantRepository.createTableSession(testSession);

    const testOrder = {
      id: `ord-hist-${rand}`,
      restaurantId: tenantA,
      branchId: branchA.id,
      tableId: tableA.id,
      tableSessionId: testSession.id,
      orderNumber: "ORD-HIST-01",
      status: "NEW",
      subtotal: 15.50,
      taxAmount: 0.78,
      discountAmount: 0,
      totalAmount: 16.28
    };
    const testOrderItem = {
      id: `oi-hist-${rand}`,
      restaurantId: tenantA,
      orderId: testOrder.id,
      menuItemId: itemPaneer.id,
      itemName: itemPaneer.name,
      quantity: 1,
      unitPrice: 15.50,
      taxRate: 5.0,
      subtotal: 15.50
    };

    const savedOrder = await restaurantRepository.createOrder(testOrder, [testOrderItem]);
    assert.strictEqual(savedOrder.items[0].unitPrice, 15.50, "Historical item unit price must be 15.50");

    // 2. Change Menu Item Price from 15.50 to 29.99
    const priceChangeRes = await makeRequest(testServer, {
      path: `/api/restaurant/menu/items/${itemPaneer.id}`,
      method: "PATCH",
      headers: authA
    }, {
      price: 29.99
    });
    assert.strictEqual(priceChangeRes.statusCode, 200);
    assert.strictEqual(priceChangeRes.body.item.price, 29.99, "Menu item price must be updated to 29.99");
    console.log("✔ Check 23 PASSED: Menu price changed to 29.99");

    // 3. Verify historical order retains snapshot unitPrice of 15.50
    const fetchedHistoricalOrder = await restaurantRepository.getOrderById(testOrder.id);
    assert(fetchedHistoricalOrder, "Historical order must exist");
    assert.strictEqual(
      fetchedHistoricalOrder.items[0].unitPrice,
      15.50,
      `Historical order-item unit price changed! Expected 15.50, found ${fetchedHistoricalOrder.items[0].unitPrice}`
    );
    console.log("✔ Check 24 PASSED: Historical order-item unit price retained at 15.50 despite menu price update");

    // =============================================================
    // CHECK 25: Valid QR returns correct restaurant menu
    // =============================================================
    console.log("\nCheck 25: Valid QR returns correct restaurant menu...");
    const verifiedMenuRes = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(newTokenA)}`,
      method: "GET"
    });
    assert.strictEqual(verifiedMenuRes.statusCode, 200);
    const vm = verifiedMenuRes.body;
    assert.strictEqual(vm.restaurant.name, "SpiceBox Gourmet");
    assert.strictEqual(vm.table.tableNumber, tableA.tableNumber);
    assert.strictEqual(vm.branch.name, branchA.name);
    assert(vm.categories.length >= 2);
    console.log("✔ Check 25 PASSED: Valid QR returned full rich menu");

    // =============================================================
    // CHECK 26: Inactive items are not returned
    // =============================================================
    console.log("\nCheck 26: Inactive and unavailable items are not returned...");
    // Create an item with isAvailable: false
    const unavailRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryStarters.id,
      name: "Out of Stock Samosa",
      price: 6.00,
      isAvailable: false
    });
    assert.strictEqual(unavailRes.statusCode, 201);
    const unavailItem = unavailRes.body.item;

    // Create an item and soft delete it (is_active = false)
    const softDelRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authA
    }, {
      categoryId: categoryStarters.id,
      name: "Discontinued Gulab Jamun",
      price: 5.00,
      isAvailable: true
    });
    const softDelItem = softDelRes.body.item;
    await makeRequest(testServer, {
      path: `/api/restaurant/menu/items/${softDelItem.id}`,
      method: "DELETE",
      headers: authA
    });

    // Public menu must NOT contain unavailItem or softDelItem
    const publicMenuCheck = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(newTokenA)}`,
      method: "GET"
    });
    const publicItemIds = publicMenuCheck.body.items.map(i => i.id);
    assert(!publicItemIds.includes(unavailItem.id), "Unavailable item must not appear in customer menu");
    assert(!publicItemIds.includes(softDelItem.id), "Deactivated item must not appear in customer menu");
    console.log("✔ Check 26 PASSED: Inactive and unavailable items excluded from customer menu");

    // =============================================================
    // CHECK 27: Other restaurant's items are never returned
    // =============================================================
    console.log("\nCheck 27: Other restaurant's items are never returned...");
    // Add item to Restaurant B
    const itemBRes = await makeRequest(testServer, {
      path: "/api/restaurant/menu/items",
      method: "POST",
      headers: authB
    }, {
      categoryId: catB.id,
      name: "Truffle Tagliatelle",
      price: 24.00,
      dietaryType: "VEG"
    });
    assert.strictEqual(itemBRes.statusCode, 201);
    const itemB = itemBRes.body.item;

    // Check Restaurant A's menu
    const menuACheck = await makeRequest(testServer, {
      path: `/api/order/menu/${encodeURIComponent(newTokenA)}`,
      method: "GET"
    });
    const itemIdsInA = menuACheck.body.items.map(i => i.id);
    assert(!itemIdsInA.includes(itemB.id), "Restaurant B's item leaked into Restaurant A's menu!");
    console.log("✔ Check 27 PASSED: Complete item isolation across restaurants");

    // =============================================================
    // CHECK 28: No administrative secrets are exposed
    // =============================================================
    console.log("\nCheck 28: No administrative secrets are exposed...");
    const publicDataStr = JSON.stringify(publicMenuCheck.body);
    const sensitiveTokens = [
      "password",
      "secret",
      "postgres://",
      "postgresql://",
      "DATABASE_URL",
      "jwt",
      "token_hash",
      sessionA.token,
      sessionB.token
    ];
    for (const secret of sensitiveTokens) {
      assert(!publicDataStr.toLowerCase().includes(secret.toLowerCase()), `Leaked sensitive string: ${secret}`);
    }
    // Verify structure
    assert.strictEqual(publicMenuCheck.body.restaurant.password, undefined);
    assert.strictEqual(publicMenuCheck.body.restaurant.apiKey, undefined);
    console.log("✔ Check 28 PASSED: No secrets or sensitive data exposed in public menu endpoint");

    console.log("\n================================================================");
    console.log("ALL 28/28 PHASE 3 VERIFICATION CHECKS PASSED SUCCESSFULLY!");
    console.log("================================================================\n");
    return true;
  } finally {
    await new Promise(resolve => testServer.close(resolve));
    await closePool();
  }
}

if (require.main === module) {
  runPhase3Tests()
    .then(() => {
      console.log("Phase 3 verification suite completed with 0 errors.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ PHASE 3 VERIFICATION FAILED:", err);
      process.exit(1);
    });
}

module.exports = { runPhase3Tests };
