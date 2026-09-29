/**
 * Restaurant OS Database Foundation Verification Suite
 *
 * Validates:
 * 1. All 8 tables exist in Neon PostgreSQL.
 * 2. Every restaurant table has restaurant_id referencing clients(id).
 * 3. Foreign key integrity and cascading deletions.
 * 4. Menu Category -> Menu Item relationships.
 * 5. Order -> Order Items relationship and Historical Price Snapshot integrity.
 * 6. Order status CHECK constraint enforcement (FSM valid values).
 * 7. Table -> Session -> Bill consolidation relationship.
 * 8. Tenant isolation indexes existence.
 * 9. Local store dual-persistence foundation.
 */

const assert = require("assert");
require("dotenv").config();
const { query, isPostgresConfigured, testConnection, closePool } = require("../memory/db");
const { initRestaurantDb, RESTAURANT_TABLES } = require("../scripts/init-restaurant-db");
const restaurantStore = require("../memory/restaurantStore");

async function runRestaurantDbTests() {
  console.log("================================================================");
  console.log("RESTAURANT OS v1 - DATABASE FOUNDATION VERIFICATION");
  console.log("================================================================\n");

  assert(isPostgresConfigured(), "PostgreSQL must be configured in .env");
  const conn = await testConnection();
  assert(conn.connected, "Neon connection must be active");

  // Step 1: Ensure Schema is Applied
  console.log("1. Executing non-destructive schema migration...");
  const initResult = await initRestaurantDb();
  assert.strictEqual(initResult.success, true, "Schema initialization must succeed");
  console.log("✔ Schema applied cleanly.\n");

  // Step 2: Verify all 8 tables exist in PostgreSQL
  console.log("2. Verifying all 8 restaurant tables exist...");
  const tablesRes = await query(
    `SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'public' 
       AND table_name = ANY($1);`,
    [RESTAURANT_TABLES]
  );
  const foundTables = tablesRes.rows.map(r => r.table_name);
  for (const table of RESTAURANT_TABLES) {
    assert(foundTables.includes(table), `Table ${table} must exist in database`);
  }
  assert.strictEqual(foundTables.length, 8, "Exactly 8 restaurant tables must be present");
  console.log(`✔ All 8 tables verified present in Neon: ${foundTables.join(", ")}\n`);

  // Step 3: Verify restaurant_id exists on every table and is NOT NULL
  console.log("3. Verifying multi-tenant restaurant_id column on all tables...");
  for (const table of RESTAURANT_TABLES) {
    const colRes = await query(
      `SELECT column_name, data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' 
         AND table_name = $1 
         AND column_name = 'restaurant_id';`,
      [table]
    );
    assert.strictEqual(colRes.rows.length, 1, `Table ${table} must contain restaurant_id column`);
    const col = colRes.rows[0];
    assert.strictEqual(col.data_type, "character varying");
    assert.strictEqual(col.character_maximum_length, 64);
    assert.strictEqual(col.is_nullable, "NO", `restaurant_id on ${table} must be NOT NULL`);
  }
  console.log("✔ restaurant_id (VARCHAR(64) NOT NULL) verified on all 8 tables.\n");

  // Step 4: Verify foreign keys to clients(id)
  console.log("4. Verifying foreign key relationships to clients(id)...");
  const fkRes = await query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = ANY($1)
      AND kcu.column_name = 'restaurant_id';
  `, [RESTAURANT_TABLES]);

  assert.strictEqual(fkRes.rows.length, 8, "Every restaurant table must have a foreign key on restaurant_id");
  for (const row of fkRes.rows) {
    assert.strictEqual(row.foreign_table_name, "clients", `FK for ${row.table_name} must target clients`);
    assert.strictEqual(row.foreign_column_name, "id", `FK for ${row.table_name} must target clients(id)`);
  }
  console.log("✔ Foreign key constraints referencing clients(id) verified for all 8 tables.\n");

  // Step 5: Test data relationships, constraints, and Historical Price Protection
  console.log("5. Testing data relationships and Historical Price Protection...");
  const testClientId = "client-test-spicebox-99";
  
  // Clean up any stale test record
  await query("DELETE FROM clients WHERE id = $1", [testClientId]);

  // Insert parent client
  await query(`
    INSERT INTO clients (id, name, company, email, status, created_at, updated_at)
    VALUES ($1, 'SpiceBox Downtown', 'SpiceBox Hospitality LLC', 'admin@spicebox.example', 'ACTIVE', NOW(), NOW());
  `, [testClientId]);

  try {
    // 5.1 Branch
    const branchRes = await query(`
      INSERT INTO restaurant_branches (id, restaurant_id, name, branch_code, address, city, status)
      VALUES ('brn-test-01', $1, 'Main Dining Hall', 'MAIN', '123 Market St', 'Chicago', 'ACTIVE')
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(branchRes.rows[0].name, "Main Dining Hall");

    // 5.2 Table
    const tableRes = await query(`
      INSERT INTO restaurant_tables (id, restaurant_id, branch_id, table_number, name, capacity, status)
      VALUES ('tbl-test-04', $1, 'brn-test-01', 'T-04', 'Corner Booth', 4, 'AVAILABLE')
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(tableRes.rows[0].table_number, "T-04");

    // 5.3 Duplicate Table constraint check
    let duplicateRejected = false;
    try {
      await query(`
        INSERT INTO restaurant_tables (id, restaurant_id, branch_id, table_number)
        VALUES ('tbl-test-dup', $1, 'brn-test-01', 'T-04');
      `, [testClientId]);
    } catch {
      duplicateRejected = true;
    }
    assert.strictEqual(duplicateRejected, true, "Duplicate table number in same branch must be rejected by unique index");

    // 5.4 Table Session
    const sessionRes = await query(`
      INSERT INTO table_sessions (id, restaurant_id, branch_id, table_id, session_code, status, guest_count, customer_name)
      VALUES ('sess-test-101', $1, 'brn-test-01', 'tbl-test-04', 'SC-TEST-99', 'ACTIVE', 2, 'Marco Rossi')
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(sessionRes.rows[0].customer_name, "Marco Rossi");

    // 5.5 Menu Category
    const catRes = await query(`
      INSERT INTO menu_categories (id, restaurant_id, name, display_order)
      VALUES ('cat-test-mains', $1, 'Chef Specialties', 1)
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(catRes.rows[0].name, "Chef Specialties");

    // 5.6 Menu Item (Original Price: 280.00)
    const itemRes = await query(`
      INSERT INTO menu_items (id, restaurant_id, category_id, name, price, tax_rate, dietary_type)
      VALUES ('item-test-biryani', $1, 'cat-test-mains', 'Special Dum Biryani', 280.00, 5.00, 'NON_VEG')
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(parseFloat(itemRes.rows[0].price), 280.00);

    // 5.7 Order Creation with line item Price Snapshot
    const orderRes = await query(`
      INSERT INTO restaurant_orders (id, restaurant_id, branch_id, table_id, table_session_id, order_number, status, subtotal, tax_amount, total_amount)
      VALUES ('ord-test-5001', $1, 'brn-test-01', 'tbl-test-04', 'sess-test-101', 'ORD-5001', 'NEW', 560.00, 28.00, 588.00)
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(orderRes.rows[0].status, "NEW");

    // 5.8 Order Item with Price Snapshot (2 x 280.00)
    await query(`
      INSERT INTO order_items (id, restaurant_id, order_id, menu_item_id, item_name, quantity, unit_price, tax_rate, subtotal)
      VALUES ('oi-test-1', $1, 'ord-test-5001', 'item-test-biryani', 'Special Dum Biryani', 2, 280.00, 5.00, 560.00);
    `, [testClientId]);

    // 5.9 HISTORICAL PRICE PROTECTION TEST:
    // Update the menu item price to 350.00 in the catalog
    await query(`UPDATE menu_items SET price = 350.00 WHERE id = 'item-test-biryani'`);
    const updatedCatalogItem = await query(`SELECT price FROM menu_items WHERE id = 'item-test-biryani'`);
    assert.strictEqual(parseFloat(updatedCatalogItem.rows[0].price), 350.00);

    // Check order item: snapshot unit_price MUST remain 280.00!
    const verifiedOrderItem = await query(`SELECT unit_price, subtotal FROM order_items WHERE id = 'oi-test-1'`);
    assert.strictEqual(parseFloat(verifiedOrderItem.rows[0].unit_price), 280.00, "Historical price snapshot must remain unchanged after catalog price update");
    assert.strictEqual(parseFloat(verifiedOrderItem.rows[0].subtotal), 560.00, "Subtotal must remain unchanged");
    console.log("✔ Historical Price Protection verified: Menu price change (280 -> 350) did not alter placed order item (280.00).");

    // 5.10 ORDER STATUS CHECK CONSTRAINT TEST:
    let invalidStatusRejected = false;
    try {
      await query(`
        INSERT INTO restaurant_orders (id, restaurant_id, table_id, table_session_id, order_number, status)
        VALUES ('ord-test-bad', $1, 'tbl-test-04', 'sess-test-101', 'ORD-BAD', 'UNKNOWN_STATUS');
      `, [testClientId]);
    } catch {
      invalidStatusRejected = true;
    }
    assert.strictEqual(invalidStatusRejected, true, "Invalid order status must be rejected by CHECK constraint");
    console.log("✔ Order status CHECK constraint verified: Non-FSM status values rejected.");

    // 5.11 Restaurant Bill Consolidation
    const billRes = await query(`
      INSERT INTO restaurant_bills (id, restaurant_id, branch_id, table_id, table_session_id, bill_number, subtotal, tax_amount, total_amount, payment_status, payment_method)
      VALUES ('bill-test-9001', $1, 'brn-test-01', 'tbl-test-04', 'sess-test-101', 'BILL-9001', 560.00, 28.00, 588.00, 'PAID', 'UPI')
      RETURNING *;
    `, [testClientId]);
    assert.strictEqual(billRes.rows[0].payment_status, "PAID");
    assert.strictEqual(billRes.rows[0].payment_method, "UPI");
    console.log("✔ Restaurant Bill consolidation and settlement recorded cleanly.\n");

  } finally {
    // 5.12 Cascading Deletion Verification
    console.log("6. Testing multi-tenant cascade cleanup...");
    await query("DELETE FROM clients WHERE id = $1", [testClientId]);
    const remainingOrders = await query("SELECT COUNT(*) AS cnt FROM restaurant_orders WHERE restaurant_id = $1", [testClientId]);
    assert.strictEqual(parseInt(remainingOrders.rows[0].cnt, 10), 0, "Deleting client must cascade delete all tenant restaurant records");
    console.log("✔ Cascading deletion on client removal verified.\n");
  }

  // Step 6: Verify Indexes
  console.log("7. Verifying tenant isolation indexes...");
  const idxRes = await query(`
    SELECT indexname, tablename 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
      AND tablename = ANY($1);
  `, [RESTAURANT_TABLES]);

  const indexNames = idxRes.rows.map(r => r.indexname);
  const expectedIndexes = [
    "idx_restaurant_branches_rid",
    "idx_restaurant_tables_rid",
    "idx_table_sessions_rid",
    "idx_menu_categories_rid",
    "idx_menu_items_rid",
    "idx_restaurant_orders_rid",
    "idx_order_items_rid",
    "idx_restaurant_bills_rid",
    "idx_restaurant_orders_rid_status",
    "idx_restaurant_orders_rid_created"
  ];

  for (const idx of expectedIndexes) {
    assert(indexNames.includes(idx), `Expected index [${idx}] must exist`);
  }
  console.log(`✔ All expected tenant indexes verified (${idxRes.rows.length} total indexes across restaurant tables).\n`);

  // Step 7: Verify Local Store Foundation
  console.log("8. Verifying local JSON restaurantStore foundation...");
  restaurantStore.ensureStoreExists();
  const testBranch = restaurantStore.createBranch({
    restaurantId: "client-local-test",
    name: "Local Test Branch",
    city: "Chicago"
  });
  assert(testBranch.id, "Local store must create branch record");
  const branches = restaurantStore.getBranches("client-local-test");
  assert.strictEqual(branches.length, 1);
  assert.strictEqual(branches[0].name, "Local Test Branch");

  restaurantStore.clearRestaurantData();
  const clearedBranches = restaurantStore.getBranches("client-local-test");
  assert.strictEqual(clearedBranches.length, 0);
  console.log("✔ Local restaurantStore foundation operational and cleanly reset.\n");

  console.log("================================================================");
  console.log(">>> ALL RESTAURANT OS DATABASE FOUNDATION TESTS PASSED <<<");
  console.log("================================================================\n");
}

if (require.main === module) {
  runRestaurantDbTests()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("\n❌ Restaurant DB Verification Failed:", err);
      await closePool();
      process.exit(1);
    });
}

module.exports = { runRestaurantDbTests };
