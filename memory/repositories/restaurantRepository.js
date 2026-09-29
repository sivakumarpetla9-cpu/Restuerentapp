/**
 * Restaurant OS Repository (PostgreSQL)
 *
 * Provides transactional persistence for Restaurant OS v1 across Neon PostgreSQL:
 * Restaurant Profile, Branches, Tables, Sessions, Categories, Items, Orders, OrderItems, Bills.
 */

const crypto = require("crypto");
const { query, getClient } = require("../db");

function generateSecureId(prefix = "id") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

// ==========================================
// 1. RESTAURANT PROFILE (clients table integration)
// ==========================================

function mapProfileRow(row) {
  if (!row) return null;
  const billing = row.billing || {};
  const deliveryProfile = row.delivery_profile || {};
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    status: row.status,
    currency: billing.currency || "INR",
    taxRate: billing.taxRate !== undefined ? parseFloat(billing.taxRate) : 5.0,
    gstNumber: billing.gstNumber || null,
    operatingHours: deliveryProfile.operatingHours || { open: "11:00", close: "23:00" },
    branding: deliveryProfile.branding || {},
    settings: deliveryProfile.settings || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getRestaurantProfile(restaurantId) {
  const res = await query(`SELECT * FROM clients WHERE id = $1 LIMIT 1;`, [restaurantId]);
  return mapProfileRow(res.rows[0]);
}

async function updateRestaurantProfile(restaurantId, updates = {}) {
  const currentRes = await query(`SELECT * FROM clients WHERE id = $1 LIMIT 1;`, [restaurantId]);
  if (!currentRes.rows[0]) {
    const billing = {
      currency: updates.currency || "INR",
      taxRate: updates.taxRate !== undefined ? parseFloat(updates.taxRate) : 5.0,
      gstNumber: updates.gstNumber || null
    };
    const deliveryProfile = {
      operatingHours: updates.operatingHours || { open: "11:00", close: "23:00" },
      branding: updates.branding || {},
      settings: updates.settings || {}
    };
    const now = new Date().toISOString();
    const res = await query(
      `INSERT INTO clients (id, name, company, email, phone, status, billing, delivery_profile, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         company = EXCLUDED.company,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         billing = EXCLUDED.billing,
         delivery_profile = EXCLUDED.delivery_profile,
         updated_at = EXCLUDED.updated_at
       RETURNING *;`,
      [
        restaurantId,
        updates.name ? String(updates.name).trim() : "Restaurant",
        updates.company ? String(updates.company).trim() : null,
        updates.email ? String(updates.email).trim() : null,
        updates.phone ? String(updates.phone).trim() : null,
        JSON.stringify(billing),
        JSON.stringify(deliveryProfile),
        now,
        now
      ]
    );
    return mapProfileRow(res.rows[0]);
  }

  const current = currentRes.rows[0];
  const currentBilling = current.billing || {};
  const currentProfile = current.delivery_profile || {};

  const newBilling = {
    ...currentBilling,
    ...(updates.currency !== undefined ? { currency: updates.currency } : {}),
    ...(updates.taxRate !== undefined ? { taxRate: parseFloat(updates.taxRate) } : {}),
    ...(updates.gstNumber !== undefined ? { gstNumber: updates.gstNumber } : {})
  };

  const newProfile = {
    ...currentProfile,
    ...(updates.operatingHours !== undefined ? { operatingHours: updates.operatingHours } : {}),
    ...(updates.branding !== undefined ? { branding: updates.branding } : {}),
    ...(updates.settings !== undefined ? { settings: updates.settings } : {})
  };

  const newName = updates.name !== undefined ? String(updates.name).trim() : current.name;
  const newCompany = updates.company !== undefined ? String(updates.company).trim() : current.company;
  const newEmail = updates.email !== undefined ? String(updates.email).trim() : current.email;
  const newPhone = updates.phone !== undefined ? String(updates.phone).trim() : current.phone;
  const now = new Date().toISOString();

  const res = await query(
    `UPDATE clients
     SET name = $2, company = $3, email = $4, phone = $5, billing = $6, delivery_profile = $7, updated_at = $8
     WHERE id = $1
     RETURNING *;`,
    [
      restaurantId,
      newName,
      newCompany,
      newEmail,
      newPhone,
      JSON.stringify(newBilling),
      JSON.stringify(newProfile),
      now
    ]
  );

  return mapProfileRow(res.rows[0]);
}

// ==========================================
// 2. BRANCHES
// ==========================================

function mapBranchRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    branchCode: row.branch_code,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email,
    status: row.status,
    settings: row.settings || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function createBranch(branch) {
  const res = await query(
    `INSERT INTO restaurant_branches (id, restaurant_id, name, branch_code, address, city, phone, email, status, settings, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       branch_code = EXCLUDED.branch_code,
       address = EXCLUDED.address,
       city = EXCLUDED.city,
       phone = EXCLUDED.phone,
       email = EXCLUDED.email,
       status = EXCLUDED.status,
       settings = EXCLUDED.settings,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      branch.id,
      branch.restaurantId,
      branch.name,
      branch.branchCode || null,
      branch.address || null,
      branch.city || null,
      branch.phone || null,
      branch.email || null,
      branch.status || "ACTIVE",
      JSON.stringify(branch.settings || {}),
      branch.createdAt || new Date().toISOString(),
      branch.updatedAt || new Date().toISOString()
    ]
  );
  return mapBranchRow(res.rows[0]);
}

async function getBranches(restaurantId) {
  const res = await query(
    `SELECT * FROM restaurant_branches WHERE restaurant_id = $1 ORDER BY name ASC;`,
    [restaurantId]
  );
  return res.rows.map(mapBranchRow);
}

async function getBranchById(restaurantId, branchId) {
  const res = await query(
    `SELECT * FROM restaurant_branches WHERE restaurant_id = $1 AND id = $2 LIMIT 1;`,
    [restaurantId, branchId]
  );
  return mapBranchRow(res.rows[0]);
}

async function updateBranch(restaurantId, branchId, updates = {}) {
  const current = await getBranchById(restaurantId, branchId);
  if (!current) return null;

  const now = new Date().toISOString();
  const name = updates.name !== undefined ? String(updates.name).trim() : current.name;
  const branchCode = updates.branchCode !== undefined ? updates.branchCode : current.branchCode;
  const address = updates.address !== undefined ? updates.address : current.address;
  const city = updates.city !== undefined ? updates.city : current.city;
  const phone = updates.phone !== undefined ? updates.phone : current.phone;
  const email = updates.email !== undefined ? updates.email : current.email;
  const status = updates.status !== undefined ? updates.status : current.status;
  const settings = updates.settings !== undefined ? updates.settings : current.settings;

  const res = await query(
    `UPDATE restaurant_branches
     SET name = $3, branch_code = $4, address = $5, city = $6, phone = $7, email = $8, status = $9, settings = $10, updated_at = $11
     WHERE restaurant_id = $1 AND id = $2
     RETURNING *;`,
    [
      restaurantId,
      branchId,
      name,
      branchCode,
      address,
      city,
      phone,
      email,
      status,
      JSON.stringify(settings),
      now
    ]
  );
  return mapBranchRow(res.rows[0]);
}

// ==========================================
// 3. TABLES
// ==========================================

function mapTableRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    tableNumber: row.table_number,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    isActive: Boolean(row.is_active),
    qrCodeToken: row.qr_code_token,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function createTable(table) {
  const res = await query(
    `INSERT INTO restaurant_tables (id, restaurant_id, branch_id, table_number, name, capacity, status, is_active, qr_code_token, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       table_number = EXCLUDED.table_number,
       name = EXCLUDED.name,
       capacity = EXCLUDED.capacity,
       status = EXCLUDED.status,
       is_active = EXCLUDED.is_active,
       qr_code_token = EXCLUDED.qr_code_token,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      table.id,
      table.restaurantId,
      table.branchId || null,
      table.tableNumber,
      table.name || null,
      table.capacity || 4,
      table.status || "AVAILABLE",
      table.isActive !== undefined ? table.isActive : true,
      table.qrCodeToken || null,
      table.createdAt || new Date().toISOString(),
      table.updatedAt || new Date().toISOString()
    ]
  );
  return mapTableRow(res.rows[0]);
}

async function getTables(restaurantId, filters = {}) {
  let sql = `SELECT * FROM restaurant_tables WHERE restaurant_id = $1`;
  const params = [restaurantId];
  if (filters.branchId) {
    params.push(filters.branchId);
    sql += ` AND branch_id = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY table_number ASC;`;
  const res = await query(sql, params);
  return res.rows.map(mapTableRow);
}

async function getTableById(restaurantId, tableId) {
  const res = await query(
    `SELECT * FROM restaurant_tables WHERE restaurant_id = $1 AND id = $2 LIMIT 1;`,
    [restaurantId, tableId]
  );
  return mapTableRow(res.rows[0]);
}

async function updateTable(restaurantId, tableId, updates = {}) {
  const current = await getTableById(restaurantId, tableId);
  if (!current) return null;

  const now = new Date().toISOString();
  const branchId = updates.branchId !== undefined ? updates.branchId : current.branchId;
  const tableNumber = updates.tableNumber !== undefined ? String(updates.tableNumber).trim() : current.tableNumber;
  const name = updates.name !== undefined ? updates.name : current.name;
  const capacity = updates.capacity !== undefined ? parseInt(updates.capacity, 10) : current.capacity;
  const status = updates.status !== undefined ? updates.status : current.status;
  const isActive = updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive;
  const qrCodeToken = updates.qrCodeToken !== undefined ? updates.qrCodeToken : current.qrCodeToken;

  const res = await query(
    `UPDATE restaurant_tables
     SET branch_id = $3, table_number = $4, name = $5, capacity = $6, status = $7, is_active = $8, qr_code_token = $9, updated_at = $10
     WHERE restaurant_id = $1 AND id = $2
     RETURNING *;`,
    [
      restaurantId,
      tableId,
      branchId,
      tableNumber,
      name,
      capacity,
      status,
      isActive,
      qrCodeToken,
      now
    ]
  );
  return mapTableRow(res.rows[0]);
}

async function updateTableQrToken(restaurantId, tableId, qrToken) {
  const now = new Date().toISOString();
  const res = await query(
    `UPDATE restaurant_tables
     SET qr_code_token = $3, updated_at = $4
     WHERE restaurant_id = $1 AND id = $2
     RETURNING *;`,
    [restaurantId, tableId, qrToken, now]
  );
  return mapTableRow(res.rows[0]);
}

async function getTableByQrToken(qrToken) {
  if (!qrToken || typeof qrToken !== "string") return null;
  const res = await query(
    `SELECT * FROM restaurant_tables WHERE qr_code_token = $1 AND is_active = TRUE LIMIT 1;`,
    [qrToken.trim()]
  );
  return mapTableRow(res.rows[0]);
}

// ==========================================
// 4. TABLE SESSIONS
// ==========================================

function mapSessionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    tableId: row.table_id,
    sessionCode: row.session_code,
    status: row.status,
    guestCount: row.guest_count,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    openedAt: row.opened_at ? new Date(row.opened_at).toISOString() : null,
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
    metadata: row.metadata || {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function createTableSession(session) {
  const res = await query(
    `INSERT INTO table_sessions (id, restaurant_id, branch_id, table_id, session_code, status, guest_count, customer_name, customer_phone, opened_at, closed_at, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       guest_count = EXCLUDED.guest_count,
       customer_name = EXCLUDED.customer_name,
       customer_phone = EXCLUDED.customer_phone,
       closed_at = EXCLUDED.closed_at,
       metadata = EXCLUDED.metadata,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      session.id,
      session.restaurantId,
      session.branchId || null,
      session.tableId,
      session.sessionCode,
      session.status || "ACTIVE",
      session.guestCount || 1,
      session.customerName || null,
      session.customerPhone || null,
      session.openedAt || new Date().toISOString(),
      session.closedAt || null,
      JSON.stringify(session.metadata || {}),
      session.createdAt || new Date().toISOString(),
      session.updatedAt || new Date().toISOString()
    ]
  );
  return mapSessionRow(res.rows[0]);
}

async function getTableSessionById(id) {
  const res = await query(`SELECT * FROM table_sessions WHERE id = $1 LIMIT 1;`, [id]);
  return mapSessionRow(res.rows[0]);
}

async function getActiveSessionForTable(restaurantId, tableId) {
  const res = await query(
    `SELECT * FROM table_sessions
     WHERE restaurant_id = $1 AND table_id = $2 AND status = 'ACTIVE'
     ORDER BY created_at DESC LIMIT 1;`,
    [restaurantId, tableId]
  );
  return mapSessionRow(res.rows[0]);
}

async function updateTableSessionStatus(id, status, closedAt = null) {
  const res = await query(
    `UPDATE table_sessions
     SET status = $2, closed_at = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING *;`,
    [id, status, closedAt]
  );
  return mapSessionRow(res.rows[0]);
}

// ==========================================
// 4b. CART ITEMS
// ==========================================

function mapCartItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    tableSessionId: row.table_session_id,
    menuItemId: row.menu_item_id,
    quantity: parseInt(row.quantity, 10),
    customizations: row.customizations || [],
    notes: row.notes || null,
    itemName: row.item_name || row.name || null,
    price: row.price !== undefined && row.price !== null ? parseFloat(row.price) : null,
    currency: row.currency || "INR",
    taxRate: row.tax_rate !== undefined && row.tax_rate !== null ? parseFloat(row.tax_rate) : 5.0,
    dietaryType: row.dietary_type || null,
    isAvailable: row.is_available !== undefined && row.is_available !== null ? Boolean(row.is_available) : true,
    isActive: row.is_active !== undefined && row.is_active !== null ? Boolean(row.is_active) : true,
    imageUrl: row.image_url || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getCartItems(tableSessionId) {
  const res = await query(
    `SELECT c.*, m.name as item_name, m.price, m.currency, m.tax_rate, m.dietary_type, m.is_available, m.is_active, m.image_url
     FROM cart_items c
     JOIN menu_items m ON c.menu_item_id = m.id
     WHERE c.table_session_id = $1
     ORDER BY c.created_at ASC;`,
    [tableSessionId]
  );
  return res.rows.map(mapCartItemRow);
}

async function getCartItemById(cartItemId) {
  const res = await query(`SELECT * FROM cart_items WHERE id = $1 LIMIT 1;`, [cartItemId]);
  return mapCartItemRow(res.rows[0]);
}

async function getCartItemBySessionAndMenuItem(tableSessionId, menuItemId) {
  const res = await query(
    `SELECT * FROM cart_items WHERE table_session_id = $1 AND menu_item_id = $2 LIMIT 1;`,
    [tableSessionId, menuItemId]
  );
  return mapCartItemRow(res.rows[0]);
}

async function upsertCartItem(cartItem) {
  const now = new Date().toISOString();
  const res = await query(
    `INSERT INTO cart_items (id, restaurant_id, table_session_id, menu_item_id, quantity, customizations, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (table_session_id, menu_item_id) DO UPDATE SET
       quantity = EXCLUDED.quantity,
       customizations = EXCLUDED.customizations,
       notes = EXCLUDED.notes,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      cartItem.id,
      cartItem.restaurantId,
      cartItem.tableSessionId,
      cartItem.menuItemId,
      cartItem.quantity,
      JSON.stringify(cartItem.customizations || []),
      cartItem.notes || null,
      cartItem.createdAt || now,
      cartItem.updatedAt || now
    ]
  );
  return mapCartItemRow(res.rows[0]);
}

async function updateCartItemQuantity(cartItemId, quantity) {
  const res = await query(
    `UPDATE cart_items
     SET quantity = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *;`,
    [cartItemId, quantity]
  );
  return mapCartItemRow(res.rows[0]);
}

async function deleteCartItem(cartItemId) {
  const res = await query(`DELETE FROM cart_items WHERE id = $1 RETURNING *;`, [cartItemId]);
  return mapCartItemRow(res.rows[0]);
}

async function clearCart(tableSessionId) {
  await query(`DELETE FROM cart_items WHERE table_session_id = $1;`, [tableSessionId]);
  return { success: true };
}

async function placeOrderTransaction(order, items = [], tableSessionId = null) {
  const client = await getClient();
  try {
    await client.query("BEGIN;");

    const orderId = order.id || generateSecureId("ord");

    // 1. Insert order
    const orderRes = await client.query(
      `INSERT INTO restaurant_orders (id, restaurant_id, branch_id, table_id, table_session_id, order_number, status, subtotal, tax_amount, discount_amount, total_amount, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *;`,
      [
        orderId,
        order.restaurantId,
        order.branchId || null,
        order.tableId,
        order.tableSessionId,
        order.orderNumber,
        order.status || "NEW",
        order.subtotal || 0,
        order.taxAmount || 0,
        order.discountAmount || 0,
        order.totalAmount || 0,
        order.notes || null,
        order.createdAt || new Date().toISOString(),
        order.updatedAt || new Date().toISOString()
      ]
    );

    const createdOrder = mapOrderRow(orderRes.rows[0]);
    const createdItems = [];

    // 2. Insert order items with immutable price snapshot
    for (const item of items) {
      const itemId = item.id || generateSecureId("oi");
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const qty = parseInt(item.quantity, 10) || 1;
      const lineSubtotal = item.subtotal !== undefined ? parseFloat(item.subtotal) : (Math.round(unitPrice * qty * 100) / 100);

      const itemRes = await client.query(
        `INSERT INTO order_items (id, restaurant_id, order_id, menu_item_id, item_name, quantity, unit_price, tax_rate, subtotal, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *;`,
        [
          itemId,
          order.restaurantId,
          orderId,
          item.menuItemId || null,
          item.itemName,
          qty,
          unitPrice,
          item.taxRate !== undefined ? item.taxRate : 5.00,
          lineSubtotal,
          item.notes || null,
          item.createdAt || new Date().toISOString(),
          item.updatedAt || new Date().toISOString()
        ]
      );
      createdItems.push(mapOrderItemRow(itemRes.rows[0]));
    }

    // 3. Clear cart for this table session
    if (tableSessionId) {
      await client.query(`DELETE FROM cart_items WHERE table_session_id = $1;`, [tableSessionId]);
    }

    // 4. Update table status to OCCUPIED
    if (order.restaurantId && order.tableId) {
      await client.query(
        `UPDATE restaurant_tables SET status = 'OCCUPIED', updated_at = NOW() WHERE restaurant_id = $1 AND id = $2;`,
        [order.restaurantId, order.tableId]
      );
    }

    await client.query("COMMIT;");
    client.release();
    createdOrder.items = createdItems;
    return createdOrder;
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch (rbErr) {}
    client.release(true);
    throw err;
  }
}

async function getOrdersBySession(tableSessionId) {
  const res = await query(
    `SELECT * FROM restaurant_orders WHERE table_session_id = $1 ORDER BY created_at DESC;`,
    [tableSessionId]
  );
  const orders = res.rows.map(mapOrderRow);
  for (const o of orders) {
    const itemRes = await query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC;`, [o.id]);
    o.items = itemRes.rows.map(mapOrderItemRow);
  }
  return orders;
}

// ==========================================
// 5. MENU CATEGORIES
// ==========================================

function mapCategoryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    name: row.name,
    description: row.description,
    displayOrder: row.display_order,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function createCategory(cat) {
  const res = await query(
    `INSERT INTO menu_categories (id, restaurant_id, branch_id, name, description, display_order, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       display_order = EXCLUDED.display_order,
       is_active = EXCLUDED.is_active,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      cat.id,
      cat.restaurantId,
      cat.branchId || null,
      cat.name,
      cat.description || null,
      cat.displayOrder || 0,
      cat.isActive !== undefined ? cat.isActive : true,
      cat.createdAt || new Date().toISOString(),
      cat.updatedAt || new Date().toISOString()
    ]
  );
  return mapCategoryRow(res.rows[0]);
}

async function getCategories(restaurantId) {
  const res = await query(
    `SELECT * FROM menu_categories WHERE restaurant_id = $1 ORDER BY display_order ASC, name ASC;`,
    [restaurantId]
  );
  return res.rows.map(mapCategoryRow);
}

async function getCategoryById(restaurantId, categoryId) {
  const res = await query(
    `SELECT * FROM menu_categories WHERE restaurant_id = $1 AND id = $2 LIMIT 1;`,
    [restaurantId, categoryId]
  );
  return mapCategoryRow(res.rows[0]);
}

async function updateCategory(restaurantId, categoryId, updates = {}) {
  const current = await getCategoryById(restaurantId, categoryId);
  if (!current) return null;

  const now = new Date().toISOString();
  const name = updates.name !== undefined ? String(updates.name).trim() : current.name;
  const description = updates.description !== undefined ? updates.description : current.description;
  const displayOrder = updates.displayOrder !== undefined ? parseInt(updates.displayOrder, 10) : current.displayOrder;
  const isActive = updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive;
  const branchId = updates.branchId !== undefined ? (updates.branchId || null) : current.branchId;

  const res = await query(
    `UPDATE menu_categories
     SET name = $3, description = $4, display_order = $5, is_active = $6, branch_id = $7, updated_at = $8
     WHERE restaurant_id = $1 AND id = $2
     RETURNING *;`,
    [restaurantId, categoryId, name, description, displayOrder, isActive, branchId, now]
  );
  return mapCategoryRow(res.rows[0]);
}

async function deleteCategory(restaurantId, categoryId) {
  const countRes = await query(
    `SELECT COUNT(*)::int as count FROM menu_items WHERE restaurant_id = $1 AND category_id = $2;`,
    [restaurantId, categoryId]
  );
  const count = countRes.rows[0] ? countRes.rows[0].count : 0;
  if (count > 0) {
    await query(
      `UPDATE menu_categories SET is_active = FALSE, updated_at = NOW() WHERE restaurant_id = $1 AND id = $2;`,
      [restaurantId, categoryId]
    );
    return { success: true, softDeleted: true, message: "Category deactivated due to existing menu items." };
  } else {
    await query(
      `DELETE FROM menu_categories WHERE restaurant_id = $1 AND id = $2;`,
      [restaurantId, categoryId]
    );
    return { success: true, softDeleted: false, message: "Category deleted." };
  }
}

// ==========================================
// 6. MENU ITEMS
// ==========================================

function mapMenuItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    price: parseFloat(row.price),
    currency: row.currency,
    taxRate: parseFloat(row.tax_rate),
    dietaryType: row.dietary_type,
    isAvailable: Boolean(row.is_available),
    isActive: Boolean(row.is_active),
    imageUrl: row.image_url,
    displayOrder: row.display_order,
    customizations: row.customizations || [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function createMenuItem(item) {
  const res = await query(
    `INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, currency, tax_rate, dietary_type, is_available, is_active, image_url, display_order, customizations, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO UPDATE SET
       category_id = EXCLUDED.category_id,
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       currency = EXCLUDED.currency,
       tax_rate = EXCLUDED.tax_rate,
       dietary_type = EXCLUDED.dietary_type,
       is_available = EXCLUDED.is_available,
       is_active = EXCLUDED.is_active,
       image_url = EXCLUDED.image_url,
       display_order = EXCLUDED.display_order,
       customizations = EXCLUDED.customizations,
       updated_at = EXCLUDED.updated_at
     RETURNING *;`,
    [
      item.id,
      item.restaurantId,
      item.categoryId,
      item.name,
      item.description || null,
      item.price,
      item.currency || "INR",
      item.taxRate !== undefined ? item.taxRate : 5.00,
      item.dietaryType || "NON_VEG",
      item.isAvailable !== undefined ? item.isAvailable : true,
      item.isActive !== undefined ? item.isActive : true,
      item.imageUrl || null,
      item.displayOrder || 0,
      JSON.stringify(item.customizations || []),
      item.createdAt || new Date().toISOString(),
      item.updatedAt || new Date().toISOString()
    ]
  );
  return mapMenuItemRow(res.rows[0]);
}

async function getMenuItems(restaurantId, filters = {}) {
  let sql = `SELECT * FROM menu_items WHERE restaurant_id = $1`;
  const params = [restaurantId];
  if (filters.categoryId) {
    params.push(filters.categoryId);
    sql += ` AND category_id = $${params.length}`;
  }
  if (filters.isAvailable !== undefined) {
    params.push(Boolean(filters.isAvailable));
    sql += ` AND is_available = $${params.length}`;
  }
  if (filters.isActive !== undefined) {
    params.push(Boolean(filters.isActive));
    sql += ` AND is_active = $${params.length}`;
  }
  if (filters.dietaryType) {
    params.push(String(filters.dietaryType).toUpperCase().trim());
    sql += ` AND dietary_type = $${params.length}`;
  }
  sql += ` ORDER BY display_order ASC, name ASC;`;
  const res = await query(sql, params);
  return res.rows.map(mapMenuItemRow);
}

async function getMenuItemById(restaurantId, itemId) {
  const res = await query(
    `SELECT * FROM menu_items WHERE restaurant_id = $1 AND id = $2 LIMIT 1;`,
    [restaurantId, itemId]
  );
  return mapMenuItemRow(res.rows[0]);
}

async function updateMenuItem(restaurantId, itemId, updates = {}) {
  const current = await getMenuItemById(restaurantId, itemId);
  if (!current) return null;

  const now = new Date().toISOString();
  const categoryId = updates.categoryId !== undefined ? updates.categoryId : current.categoryId;
  const name = updates.name !== undefined ? String(updates.name).trim() : current.name;
  const description = updates.description !== undefined ? updates.description : current.description;
  const price = updates.price !== undefined ? Math.round(parseFloat(updates.price) * 100) / 100 : current.price;
  const currency = updates.currency !== undefined ? updates.currency : current.currency;
  const taxRate = updates.taxRate !== undefined ? parseFloat(updates.taxRate) : current.taxRate;
  const dietaryType = updates.dietaryType !== undefined ? String(updates.dietaryType).toUpperCase().trim() : current.dietaryType;
  const isAvailable = updates.isAvailable !== undefined ? Boolean(updates.isAvailable) : current.isAvailable;
  const isActive = updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive;
  const imageUrl = updates.imageUrl !== undefined ? updates.imageUrl : current.imageUrl;
  const displayOrder = updates.displayOrder !== undefined ? parseInt(updates.displayOrder, 10) : current.displayOrder;
  const customizations = updates.customizations !== undefined ? updates.customizations : current.customizations;

  const res = await query(
    `UPDATE menu_items
     SET category_id = $3, name = $4, description = $5, price = $6, currency = $7, tax_rate = $8,
         dietary_type = $9, is_available = $10, is_active = $11, image_url = $12, display_order = $13,
         customizations = $14, updated_at = $15
     WHERE restaurant_id = $1 AND id = $2
     RETURNING *;`,
    [
      restaurantId,
      itemId,
      categoryId,
      name,
      description,
      price,
      currency,
      taxRate,
      dietaryType,
      isAvailable,
      isActive,
      imageUrl,
      displayOrder,
      JSON.stringify(customizations || []),
      now
    ]
  );
  return mapMenuItemRow(res.rows[0]);
}

async function deleteMenuItem(restaurantId, itemId) {
  const res = await query(
    `UPDATE menu_items SET is_active = FALSE, updated_at = NOW() WHERE restaurant_id = $1 AND id = $2 RETURNING *;`,
    [restaurantId, itemId]
  );
  return mapMenuItemRow(res.rows[0]);
}

// ==========================================
// 7. RESTAURANT ORDERS & ORDER ITEMS
// ==========================================

function mapOrderRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id,
    tableId: row.table_id,
    tableSessionId: row.table_session_id,
    orderNumber: row.order_number,
    status: row.status,
    subtotal: parseFloat(row.subtotal),
    taxAmount: parseFloat(row.tax_amount),
    discountAmount: parseFloat(row.discount_amount),
    totalAmount: parseFloat(row.total_amount),
    notes: row.notes,
    cancelReason: row.cancel_reason,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    preparingAt: row.preparing_at ? new Date(row.preparing_at).toISOString() : null,
    readyAt: row.ready_at ? new Date(row.ready_at).toISOString() : null,
    servedAt: row.served_at ? new Date(row.served_at).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
    tableNumber: row.table_number || null,
    tableName: row.table_name || (row.table_number ? `Table ${row.table_number}` : null),
    branchName: row.branch_name || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

function mapOrderItemRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    itemName: row.item_name,
    quantity: row.quantity,
    unitPrice: parseFloat(row.unit_price),
    taxRate: parseFloat(row.tax_rate),
    subtotal: parseFloat(row.subtotal),
    notes: row.notes,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function createOrder(order, items = []) {
  const orderId = order.id || generateSecureId("ord");
  const res = await query(
    `INSERT INTO restaurant_orders (id, restaurant_id, branch_id, table_id, table_session_id, order_number, status, subtotal, tax_amount, discount_amount, total_amount, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *;`,
    [
      orderId,
      order.restaurantId,
      order.branchId || null,
      order.tableId,
      order.tableSessionId,
      order.orderNumber,
      order.status || "NEW",
      order.subtotal || 0,
      order.taxAmount || 0,
      order.discountAmount || 0,
      order.totalAmount || 0,
      order.notes || null,
      order.createdAt || new Date().toISOString(),
      order.updatedAt || new Date().toISOString()
    ]
  );

  const createdOrder = mapOrderRow(res.rows[0]);
  const createdItems = [];

  for (const item of items) {
    const itemId = item.id || generateSecureId("oi");
    const itemRes = await query(
      `INSERT INTO order_items (id, restaurant_id, order_id, menu_item_id, item_name, quantity, unit_price, tax_rate, subtotal, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *;`,
      [
        itemId,
        order.restaurantId,
        orderId,
        item.menuItemId || null,
        item.itemName,
        item.quantity,
        item.unitPrice,
        item.taxRate || 0,
        item.subtotal || (item.quantity * item.unitPrice),
        item.notes || null,
        item.createdAt || new Date().toISOString(),
        item.updatedAt || new Date().toISOString()
      ]
    );
    createdItems.push(mapOrderItemRow(itemRes.rows[0]));
  }

  createdOrder.items = createdItems;
  return createdOrder;
}

async function getOrderById(id) {
  const res = await query(`SELECT * FROM restaurant_orders WHERE id = $1 LIMIT 1;`, [id]);
  if (!res.rows[0]) return null;
  const order = mapOrderRow(res.rows[0]);
  const itemRes = await query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC;`, [id]);
  order.items = itemRes.rows.map(mapOrderItemRow);
  return order;
}

// ==========================================
// 8. RESTAURANT BILLS & PAYMENTS
// ==========================================

const VALID_PAYMENT_STATUSES = ["PENDING", "PAID", "VOID", "REFUNDED"];
const VALID_PAYMENT_METHODS = ["CASH", "UPI", "CARD", "OTHER"];
const VALID_PAYMENT_TRANSITIONS = {
  PENDING: ["PAID", "VOID"],
  PAID: ["REFUNDED"],
  VOID: [],
  REFUNDED: []
};

function mapBillRow(row) {
  if (!row) return null;
  const total = parseFloat(row.total_amount || 0);
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    branchId: row.branch_id || null,
    tableId: row.table_id || null,
    tableSessionId: row.table_session_id || null,
    orderId: row.order_id || null,
    billNumber: row.bill_number,
    subtotal: parseFloat(row.subtotal || 0),
    discountAmount: parseFloat(row.discount_amount || 0),
    taxAmount: parseFloat(row.tax_amount || 0),
    serviceCharge: parseFloat(row.service_charge || 0),
    totalAmount: total,
    grandTotal: total,
    paymentStatus: row.payment_status || "PENDING",
    paymentMethod: row.payment_method || null,
    paymentRef: row.payment_ref || null,
    settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    settledBy: row.settled_by || null,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : (row.settled_at ? new Date(row.settled_at).toISOString() : null),
    notes: row.notes || null,
    tableNumber: row.table_number || null,
    tableName: row.table_name || (row.table_number ? `Table ${row.table_number}` : null),
    orderNumber: row.order_number || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getBillingSettings(restaurantId) {
  const clientRes = await query(`SELECT billing, updated_at FROM clients WHERE id = $1 LIMIT 1;`, [restaurantId]);
  const billing = (clientRes.rows[0] && clientRes.rows[0].billing) || {};
  return {
    restaurantId,
    billingEnabled: Boolean(billing.billingEnabled),
    serviceChargeRate: billing.serviceChargeRate !== undefined ? parseFloat(billing.serviceChargeRate) : 0.0,
    taxRate: billing.taxRate !== undefined ? parseFloat(billing.taxRate) : 5.0,
    currency: billing.currency || "INR",
    gstNumber: billing.gstNumber || null,
    updatedAt: clientRes.rows[0] && clientRes.rows[0].updated_at ? new Date(clientRes.rows[0].updated_at).toISOString() : null
  };
}

async function updateBillingSettings(restaurantId, updates = {}) {
  const currentRes = await query(`SELECT * FROM clients WHERE id = $1 LIMIT 1;`, [restaurantId]);
  let currentBilling = {};
  if (currentRes.rows[0] && currentRes.rows[0].billing) {
    currentBilling = currentRes.rows[0].billing;
  }

  if (updates.serviceChargeRate !== undefined) {
    const sc = parseFloat(updates.serviceChargeRate);
    if (isNaN(sc) || sc < 0 || sc > 100) {
      throw new Error("Service charge rate must be a non-negative number between 0 and 100.");
    }
  }

  if (updates.taxRate !== undefined) {
    const tr = parseFloat(updates.taxRate);
    if (isNaN(tr) || tr < 0 || tr > 100) {
      throw new Error("Tax rate must be a non-negative number between 0 and 100.");
    }
  }

  const newBilling = {
    ...currentBilling,
    ...(updates.billingEnabled !== undefined ? { billingEnabled: Boolean(updates.billingEnabled) } : {}),
    ...(updates.serviceChargeRate !== undefined ? { serviceChargeRate: parseFloat(updates.serviceChargeRate) } : {}),
    ...(updates.taxRate !== undefined ? { taxRate: parseFloat(updates.taxRate) } : {}),
    ...(updates.currency !== undefined ? { currency: String(updates.currency).trim().toUpperCase() } : {}),
    ...(updates.gstNumber !== undefined ? { gstNumber: updates.gstNumber ? String(updates.gstNumber).trim() : null } : {})
  };

  const now = new Date().toISOString();
  if (!currentRes.rows[0]) {
    await query(
      `INSERT INTO clients (id, name, status, billing, created_at, updated_at)
       VALUES ($1, 'Restaurant', 'ACTIVE', $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET billing = EXCLUDED.billing, updated_at = EXCLUDED.updated_at;`,
      [restaurantId, JSON.stringify(newBilling), now, now]
    );
  } else {
    await query(
      `UPDATE clients SET billing = $2, updated_at = $3 WHERE id = $1;`,
      [restaurantId, JSON.stringify(newBilling), now]
    );
  }

  return getBillingSettings(restaurantId);
}

async function createBill(bill) {
  const res = await query(
    `INSERT INTO restaurant_bills (
       id, restaurant_id, branch_id, table_id, table_session_id, order_id, bill_number,
       subtotal, discount_amount, tax_amount, service_charge, total_amount, payment_status,
       payment_method, notes, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *;`,
    [
      bill.id,
      bill.restaurantId,
      bill.branchId || null,
      bill.tableId,
      bill.tableSessionId,
      bill.orderId || null,
      bill.billNumber,
      bill.subtotal || 0,
      bill.discountAmount || 0,
      bill.taxAmount || 0,
      bill.serviceCharge || 0,
      bill.totalAmount || 0,
      bill.paymentStatus || "PENDING",
      bill.paymentMethod || null,
      bill.notes || null,
      bill.createdAt || new Date().toISOString(),
      bill.updatedAt || new Date().toISOString()
    ]
  );
  return mapBillRow(res.rows[0]);
}

async function getBillById(arg1, arg2) {
  let restaurantId = null;
  let billId = arg1;
  if (arg2) {
    restaurantId = arg1;
    billId = arg2;
  }

  let sql = `
    SELECT b.*,
           t.table_number, t.name as table_name,
           o.order_number
    FROM restaurant_bills b
    LEFT JOIN restaurant_tables t ON b.table_id = t.id
    LEFT JOIN restaurant_orders o ON b.order_id = o.id
    WHERE b.id = $1
  `;
  const params = [billId];
  if (restaurantId) {
    sql += ` AND b.restaurant_id = $2`;
    params.push(restaurantId);
  }
  sql += ` LIMIT 1;`;

  const res = await query(sql, params);
  if (res.rows.length === 0) return null;
  const bill = mapBillRow(res.rows[0]);

  if (bill.orderId) {
    const itemsRes = await query(
      `SELECT oi.*, m.dietary_type 
       FROM order_items oi
       LEFT JOIN menu_items m ON oi.menu_item_id = m.id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at ASC;`,
      [bill.orderId]
    );
    bill.items = itemsRes.rows.map(r => ({
      ...mapOrderItemRow(r),
      dietaryType: r.dietary_type || null
    }));
  } else {
    bill.items = [];
  }

  return bill;
}

async function getBillByOrderId(restaurantId, orderId) {
  const res = await query(
    `SELECT b.*,
            t.table_number, t.name as table_name,
            o.order_number
     FROM restaurant_bills b
     LEFT JOIN restaurant_tables t ON b.table_id = t.id
     LEFT JOIN restaurant_orders o ON b.order_id = o.id
     WHERE b.restaurant_id = $1 AND b.order_id = $2
     LIMIT 1;`,
    [restaurantId, orderId]
  );
  if (res.rows.length === 0) return null;
  const bill = mapBillRow(res.rows[0]);

  const itemsRes = await query(
    `SELECT oi.*, m.dietary_type 
     FROM order_items oi
     LEFT JOIN menu_items m ON oi.menu_item_id = m.id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC;`,
    [orderId]
  );
  bill.items = itemsRes.rows.map(r => ({
    ...mapOrderItemRow(r),
    dietaryType: r.dietary_type || null
  }));

  return bill;
}

async function getBills(restaurantId, filters = {}) {
  let sql = `
    SELECT b.*,
           t.table_number, t.name as table_name,
           o.order_number
    FROM restaurant_bills b
    LEFT JOIN restaurant_tables t ON b.table_id = t.id
    LEFT JOIN restaurant_orders o ON b.order_id = o.id
    WHERE b.restaurant_id = $1
  `;
  const params = [restaurantId];

  if (filters.paymentStatus) {
    if (Array.isArray(filters.paymentStatus)) {
      params.push(filters.paymentStatus);
      sql += ` AND b.payment_status = ANY($${params.length})`;
    } else if (filters.paymentStatus.includes(",")) {
      const parts = filters.paymentStatus.split(",").map(s => s.trim().toUpperCase());
      params.push(parts);
      sql += ` AND b.payment_status = ANY($${params.length})`;
    } else {
      params.push(filters.paymentStatus.toUpperCase().trim());
      sql += ` AND b.payment_status = $${params.length}`;
    }
  }

  if (filters.paymentMethod) {
    params.push(filters.paymentMethod.toUpperCase().trim());
    sql += ` AND b.payment_method = $${params.length}`;
  }

  if (filters.orderId) {
    params.push(filters.orderId);
    sql += ` AND b.order_id = $${params.length}`;
  }

  if (filters.tableId) {
    params.push(filters.tableId);
    sql += ` AND b.table_id = $${params.length}`;
  }

  sql += ` ORDER BY b.created_at DESC;`;

  const res = await query(sql, params);
  return res.rows.map(mapBillRow);
}

async function createBillForOrder(restaurantId, orderId, options = {}) {
  // 1. Check if bill already exists for this order (prevent duplicates)
  const existing = await getBillByOrderId(restaurantId, orderId);
  if (existing) {
    return {
      success: true,
      alreadyExisted: true,
      bill: existing
    };
  }

  // 2. Fetch order strictly scoped to restaurantId
  const orderRes = await query(
    `SELECT * FROM restaurant_orders WHERE restaurant_id = $1 AND id = $2;`,
    [restaurantId, orderId]
  );
  if (orderRes.rows.length === 0) {
    return { notFound: true, message: "Order not found" };
  }
  const order = mapOrderRow(orderRes.rows[0]);

  // 3. Check order eligibility: cannot bill cancelled orders
  if (order.status === "CANCELLED") {
    return {
      ineligible: true,
      message: "Cannot generate a bill for a cancelled order."
    };
  }

  // 4. Fetch line items
  const itemsRes = await query(
    `SELECT oi.*, m.dietary_type 
     FROM order_items oi
     LEFT JOIN menu_items m ON oi.menu_item_id = m.id
     WHERE oi.restaurant_id = $1 AND oi.order_id = $2
     ORDER BY oi.created_at ASC;`,
    [restaurantId, orderId]
  );
  if (itemsRes.rows.length === 0) {
    return {
      noItems: true,
      message: "Cannot generate a bill for an order with no items."
    };
  }
  const items = itemsRes.rows.map(r => ({
    ...mapOrderItemRow(r),
    dietaryType: r.dietary_type || null
  }));

  // 5. Server-side accurate calculation from server order item snapshots
  // Never trust client prices!
  let subtotal = 0;
  let computedTax = 0;
  for (const it of items) {
    const lineSubtotal = it.subtotal !== undefined ? parseFloat(it.subtotal) : (it.unitPrice * it.quantity);
    subtotal += lineSubtotal;
    const taxRate = it.taxRate !== undefined ? parseFloat(it.taxRate) : 5.0;
    computedTax += Math.round(lineSubtotal * (taxRate / 100) * 100) / 100;
  }
  subtotal = Math.round(subtotal * 100) / 100;

  const discountAmount = order.discountAmount !== undefined ? parseFloat(order.discountAmount) : 0;
  const taxAmount = order.taxAmount !== undefined && order.taxAmount > 0 
    ? parseFloat(order.taxAmount) 
    : (Math.round(computedTax * 100) / 100);

  // Fetch billing settings for service charge rate
  const settings = await getBillingSettings(restaurantId);
  const scRate = (settings && typeof settings.serviceChargeRate === "number") ? settings.serviceChargeRate : 0;
  const serviceCharge = scRate > 0 ? Math.round((subtotal * (scRate / 100)) * 100) / 100 : 0.00;

  const grandTotal = Math.max(0, Math.round((subtotal - discountAmount + taxAmount + serviceCharge) * 100) / 100);

  const billId = options.id || generateSecureId("bill");
  const billNum = options.billNumber || `BILL-${order.orderNumber ? order.orderNumber.replace(/^[A-Z]+-?/, "") : Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const insertRes = await query(
    `INSERT INTO restaurant_bills (
       id, restaurant_id, branch_id, table_id, table_session_id, order_id, bill_number,
       subtotal, discount_amount, tax_amount, service_charge, total_amount,
       payment_status, payment_method, notes, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING', NULL, $13, $14, $15)
     ON CONFLICT (restaurant_id, order_id) WHERE order_id IS NOT NULL DO UPDATE SET updated_at = NOW()
     RETURNING *;`,
    [
      billId,
      restaurantId,
      order.branchId || null,
      order.tableId,
      order.tableSessionId,
      orderId,
      billNum,
      subtotal,
      discountAmount,
      taxAmount,
      serviceCharge,
      grandTotal,
      options.notes || null,
      now,
      now
    ]
  );

  const createdBill = mapBillRow(insertRes.rows[0]);
  createdBill.items = items;
  createdBill.orderNumber = order.orderNumber;

  return {
    success: true,
    alreadyExisted: false,
    bill: createdBill
  };
}

async function recordBillPayment(restaurantId, billId, paymentData = {}) {
  const normStatus = String(paymentData.paymentStatus || "PAID").toUpperCase().trim();
  if (!VALID_PAYMENT_STATUSES.includes(normStatus)) {
    return {
      invalidStatus: true,
      message: `Invalid payment status "${paymentData.paymentStatus}". Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
    };
  }

  const client = await getClient();
  let releaseCalled = false;
  const safeRelease = (err) => {
    if (!releaseCalled) {
      releaseCalled = true;
      try { client.release(err); } catch (_) {}
    }
  };

  try {
    await client.query("BEGIN;");

    const checkRes = await client.query(
      `SELECT * FROM restaurant_bills WHERE restaurant_id = $1 AND id = $2 FOR UPDATE;`,
      [restaurantId, billId]
    );

    if (checkRes.rows.length === 0) {
      await client.query("ROLLBACK;");
      safeRelease();
      return { notFound: true, message: "Bill not found" };
    }

    const currentBill = mapBillRow(checkRes.rows[0]);

    // Idempotent payment check: if already in the target status
    if (currentBill.paymentStatus === normStatus) {
      await client.query("COMMIT;");
      safeRelease();
      return {
        success: true,
        idempotent: true,
        bill: currentBill,
        previousStatus: currentBill.paymentStatus
      };
    }

    // Validate state transitions
    const allowed = VALID_PAYMENT_TRANSITIONS[currentBill.paymentStatus] || [];
    if (!allowed.includes(normStatus)) {
      await client.query("ROLLBACK;");
      safeRelease();
      return {
        invalidTransition: true,
        fromStatus: currentBill.paymentStatus,
        toStatus: normStatus,
        message: `Cannot transition payment status from ${currentBill.paymentStatus} to ${normStatus}`
      };
    }

    let normMethod = currentBill.paymentMethod;
    if (paymentData.paymentMethod !== undefined) {
      normMethod = String(paymentData.paymentMethod).toUpperCase().trim();
      if (!VALID_PAYMENT_METHODS.includes(normMethod)) {
        await client.query("ROLLBACK;");
        safeRelease();
        return {
          invalidMethod: true,
          message: `Invalid payment method "${paymentData.paymentMethod}". Must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`
        };
      }
    } else if (normStatus === "PAID" && !normMethod) {
      normMethod = "CASH";
    }

    const now = new Date().toISOString();
    let paidAt = currentBill.paidAt;
    let settledAt = currentBill.settledAt;
    let settledBy = paymentData.settledBy || currentBill.settledBy || "staff";

    if (normStatus === "PAID") {
      paidAt = now;
      settledAt = now;
    } else if (normStatus === "VOID") {
      settledAt = now;
    } else if (normStatus === "REFUNDED") {
      settledAt = now;
    }

    const paymentRef = paymentData.paymentRef !== undefined ? paymentData.paymentRef : currentBill.paymentRef;
    const notes = paymentData.notes !== undefined ? paymentData.notes : currentBill.notes;

    const updateRes = await client.query(
      `UPDATE restaurant_bills
       SET payment_status = $3,
           payment_method = $4,
           payment_ref = $5,
           settled_at = $6,
           paid_at = $7,
           settled_by = $8,
           notes = $9,
           updated_at = NOW()
       WHERE restaurant_id = $1 AND id = $2
       RETURNING *;`,
      [
        restaurantId,
        billId,
        normStatus,
        normMethod,
        paymentRef,
        settledAt,
        paidAt,
        settledBy,
        notes
      ]
    );

    const updatedBill = mapBillRow(updateRes.rows[0]);
    await client.query("COMMIT;");
    safeRelease();

    // Fetch items for the bill
    if (updatedBill.orderId) {
      const itemsRes = await query(
        `SELECT oi.*, m.dietary_type 
         FROM order_items oi
         LEFT JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.order_id = $1
         ORDER BY oi.created_at ASC;`,
        [updatedBill.orderId]
      );
      updatedBill.items = itemsRes.rows.map(r => ({
        ...mapOrderItemRow(r),
        dietaryType: r.dietary_type || null
      }));
    }

    return {
      success: true,
      bill: updatedBill,
      previousStatus: currentBill.paymentStatus
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch (_) {}
    safeRelease(true);
    throw err;
  }
}

// ==========================================
// 9. KITCHEN ORDER MANAGEMENT & STATE MACHINE
// ==========================================

const VALID_ORDER_TRANSITIONS = {
  NEW: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY"],
  READY: ["SERVED"],
  SERVED: [],
  CANCELLED: []
};

const VALID_ORDER_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY", "SERVED", "CANCELLED"];

async function getKitchenOrders(restaurantId, filters = {}) {
  let sql = `
    SELECT o.*, 
           t.table_number, t.name as table_name,
           b.name as branch_name
    FROM restaurant_orders o
    LEFT JOIN restaurant_tables t ON o.table_id = t.id
    LEFT JOIN restaurant_branches b ON o.branch_id = b.id
    WHERE o.restaurant_id = $1
  `;
  const params = [restaurantId];

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      params.push(filters.status);
      sql += ` AND o.status = ANY($${params.length})`;
    } else {
      params.push(filters.status.toUpperCase().trim());
      sql += ` AND o.status = $${params.length}`;
    }
  } else {
    sql += ` AND o.status IN ('NEW', 'ACCEPTED', 'PREPARING', 'READY')`;
  }

  if (filters.branchId) {
    params.push(filters.branchId);
    sql += ` AND o.branch_id = $${params.length}`;
  }

  if (filters.tableId) {
    params.push(filters.tableId);
    sql += ` AND o.table_id = $${params.length}`;
  }

  sql += ` ORDER BY o.created_at ASC;`;

  const res = await query(sql, params);
  const orders = res.rows.map(mapOrderRow);

  for (const o of orders) {
    const itemRes = await query(
      `SELECT oi.*, m.dietary_type 
       FROM order_items oi
       LEFT JOIN menu_items m ON oi.menu_item_id = m.id
       WHERE oi.order_id = $1 
       ORDER BY oi.created_at ASC;`,
      [o.id]
    );
    o.items = itemRes.rows.map(row => ({
      ...mapOrderItemRow(row),
      dietaryType: row.dietary_type || null
    }));
  }

  return orders;
}

async function getOrderByIdAndRestaurant(restaurantId, orderId) {
  const res = await query(
    `SELECT o.*, 
            t.table_number, t.name as table_name,
            b.name as branch_name
     FROM restaurant_orders o
     LEFT JOIN restaurant_tables t ON o.table_id = t.id
     LEFT JOIN restaurant_branches b ON o.branch_id = b.id
     WHERE o.restaurant_id = $1 AND o.id = $2
     LIMIT 1;`,
    [restaurantId, orderId]
  );
  if (!res.rows[0]) return null;
  const order = mapOrderRow(res.rows[0]);
  const itemRes = await query(
    `SELECT oi.*, m.dietary_type 
     FROM order_items oi
     LEFT JOIN menu_items m ON oi.menu_item_id = m.id
     WHERE oi.order_id = $1 
     ORDER BY oi.created_at ASC;`,
    [orderId]
  );
  order.items = itemRes.rows.map(row => ({
    ...mapOrderItemRow(row),
    dietaryType: row.dietary_type || null
  }));
  return order;
}

async function updateOrderStatus(restaurantId, orderId, newStatus, currentExpectedStatus = null, cancelReason = null) {
  const normNewStatus = String(newStatus || "").toUpperCase().trim();
  if (!VALID_ORDER_STATUSES.includes(normNewStatus)) {
    return {
      invalidStatus: true,
      message: `Invalid order status "${newStatus}". Must be one of: ${VALID_ORDER_STATUSES.join(", ")}`
    };
  }

  const client = await getClient();
  let releaseCalled = false;
  const safeRelease = (err) => {
    if (!releaseCalled) {
      releaseCalled = true;
      try { client.release(err); } catch (_) {}
    }
  };

  try {
    await client.query("BEGIN;");

    const checkRes = await client.query(
      `SELECT * FROM restaurant_orders WHERE restaurant_id = $1 AND id = $2 FOR UPDATE;`,
      [restaurantId, orderId]
    );

    if (checkRes.rows.length === 0) {
      await client.query("ROLLBACK;");
      safeRelease();
      return { notFound: true, message: "Order not found" };
    }

    const currentOrder = mapOrderRow(checkRes.rows[0]);

    if (currentExpectedStatus && currentOrder.status !== currentExpectedStatus.toUpperCase().trim()) {
      await client.query("ROLLBACK;");
      safeRelease();
      return {
        conflict: true,
        currentStatus: currentOrder.status,
        message: `Stale status: order is currently ${currentOrder.status}, expected ${currentExpectedStatus}`
      };
    }

    const allowed = VALID_ORDER_TRANSITIONS[currentOrder.status] || [];
    if (!allowed.includes(normNewStatus)) {
      await client.query("ROLLBACK;");
      safeRelease();
      return {
        invalidTransition: true,
        fromStatus: currentOrder.status,
        toStatus: normNewStatus,
        message: `Invalid state transition from ${currentOrder.status} to ${normNewStatus}`
      };
    }

    let timestampCol = "";
    if (normNewStatus === "ACCEPTED") timestampCol = ", accepted_at = NOW()";
    else if (normNewStatus === "PREPARING") timestampCol = ", preparing_at = NOW()";
    else if (normNewStatus === "READY") timestampCol = ", ready_at = NOW()";
    else if (normNewStatus === "SERVED") timestampCol = ", served_at = NOW()";
    else if (normNewStatus === "CANCELLED") timestampCol = ", cancelled_at = NOW(), cancel_reason = $4";

    const params = [restaurantId, orderId, normNewStatus];
    if (normNewStatus === "CANCELLED") {
      params.push(cancelReason || "Cancelled by restaurant staff");
    }

    const updateSql = `
      UPDATE restaurant_orders
      SET status = $3, updated_at = NOW() ${timestampCol}
      WHERE restaurant_id = $1 AND id = $2
      RETURNING *;
    `;

    const updateRes = await client.query(updateSql, params);
    const updatedOrder = mapOrderRow(updateRes.rows[0]);

    // Synchronize table status: if all orders served or cancelled, table can be AVAILABLE
    if (normNewStatus === "SERVED" || normNewStatus === "CANCELLED") {
      const remainingRes = await client.query(
        `SELECT COUNT(*)::int as count FROM restaurant_orders 
         WHERE restaurant_id = $1 AND table_id = $2 AND status IN ('NEW', 'ACCEPTED', 'PREPARING', 'READY');`,
        [restaurantId, updatedOrder.tableId]
      );
      const remainingCount = remainingRes.rows[0] ? remainingRes.rows[0].count : 0;
      if (remainingCount === 0) {
        await client.query(
          `UPDATE restaurant_tables SET status = 'AVAILABLE', updated_at = NOW() WHERE restaurant_id = $1 AND id = $2;`,
          [restaurantId, updatedOrder.tableId]
        );
      }
    }

    const itemRes = await client.query(
      `SELECT oi.*, m.dietary_type 
       FROM order_items oi
       LEFT JOIN menu_items m ON oi.menu_item_id = m.id
       WHERE oi.order_id = $1 
       ORDER BY oi.created_at ASC;`,
      [orderId]
    );
    updatedOrder.items = itemRes.rows.map(row => ({
      ...mapOrderItemRow(row),
      dietaryType: row.dietary_type || null
    }));

    await client.query("COMMIT;");
    safeRelease();
    return { success: true, order: updatedOrder, previousStatus: currentOrder.status };
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch (rbErr) {}
    safeRelease(true);
    throw err;
  }
}

module.exports = {
  getRestaurantProfile,
  updateRestaurantProfile,
  createBranch,
  getBranches,
  getBranchById,
  updateBranch,
  createTable,
  getTables,
  getTableById,
  updateTable,
  updateTableQrToken,
  getTableByQrToken,
  createTableSession,
  getTableSessionById,
  getActiveSessionForTable,
  updateTableSessionStatus,
  getCartItems,
  getCartItemById,
  getCartItemBySessionAndMenuItem,
  upsertCartItem,
  updateCartItemQuantity,
  deleteCartItem,
  clearCart,
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  createMenuItem,
  getMenuItems,
  getMenuItemById,
  updateMenuItem,
  deleteMenuItem,
  createOrder,
  getOrderById,
  placeOrderTransaction,
  getOrdersBySession,
  createBill,
  getBillById,
  getBillByOrderId,
  getBills,
  createBillForOrder,
  recordBillPayment,
  getBillingSettings,
  updateBillingSettings,
  VALID_PAYMENT_STATUSES,
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_TRANSITIONS,
  VALID_ORDER_TRANSITIONS,
  VALID_ORDER_STATUSES,
  getKitchenOrders,
  getOrderByIdAndRestaurant,
  updateOrderStatus
};
