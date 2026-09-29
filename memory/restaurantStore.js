/**
 * Restaurant OS Store (Dual Persistence Foundation)
 *
 * Local JSON file storage in data/restaurant/ with optional PostgreSQL synchronization
 * via restaurantRepository. Follows the established project persistence conventions.
 */

const fs = require("fs");
const path = require("path");
const { isSyncEnabled } = require("./db");
const crmStore = require("./crmStore");
const restaurantRepository = require("./repositories/restaurantRepository");

const DATA_DIR = path.join(__dirname, "../data/restaurant");
const BRANCHES_FILE = path.join(DATA_DIR, "branches.json");
const TABLES_FILE = path.join(DATA_DIR, "tables.json");
const SESSIONS_FILE = path.join(DATA_DIR, "table_sessions.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const MENU_ITEMS_FILE = path.join(DATA_DIR, "menu_items.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ORDER_ITEMS_FILE = path.join(DATA_DIR, "order_items.json");
const BILLS_FILE = path.join(DATA_DIR, "bills.json");
const CART_ITEMS_FILE = path.join(DATA_DIR, "cart_items.json");

function ensureStoreExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const files = [
    BRANCHES_FILE,
    TABLES_FILE,
    SESSIONS_FILE,
    CATEGORIES_FILE,
    MENU_ITEMS_FILE,
    ORDERS_FILE,
    ORDER_ITEMS_FILE,
    BILLS_FILE,
    CART_ITEMS_FILE
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, "[]", "utf8");
    }
  }
}

function loadJson(filePath) {
  ensureStoreExists();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJson(filePath, data) {
  ensureStoreExists();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ==========================================
// 1. RESTAURANT PROFILE (clients integration)
// ==========================================

function formatClientAsRestaurant(client) {
  if (!client) return null;
  const billing = client.billing || {};
  const deliveryProfile = client.deliveryProfile || {};
  return {
    id: client.id,
    name: client.name || client.companyName || "Restaurant",
    company: client.company || client.companyName || null,
    email: client.email || null,
    phone: client.phone || null,
    status: client.status || "ACTIVE",
    currency: billing.currency || "INR",
    taxRate: billing.taxRate !== undefined ? parseFloat(billing.taxRate) : 5.0,
    gstNumber: billing.gstNumber || null,
    operatingHours: deliveryProfile.operatingHours || { open: "11:00", close: "23:00" },
    branding: deliveryProfile.branding || {},
    settings: deliveryProfile.settings || {},
    createdAt: client.createdAt || null,
    updatedAt: client.updatedAt || null
  };
}

function getRestaurantProfile(restaurantId) {
  if (!restaurantId) return null;
  const client = crmStore.getClient(restaurantId);
  return formatClientAsRestaurant(client);
}

function updateRestaurantProfile(restaurantId, updates = {}) {
  if (!restaurantId) return null;
  let client = crmStore.getClient(restaurantId);

  if (updates.taxRate !== undefined) {
    const tr = parseFloat(updates.taxRate);
    if (isNaN(tr) || tr < 0) {
      throw new Error("Tax rate must be a valid non-negative number.");
    }
  }

  if (!client) {
    // Initialize client record in crmStore if not yet created
    const clients = loadJson(crmStore.CLIENTS_FILE);
    client = {
      id: restaurantId,
      name: updates.name ? String(updates.name).trim() : "Restaurant",
      companyName: updates.company ? String(updates.company).trim() : (updates.name || "Restaurant"),
      company: updates.company ? String(updates.company).trim() : null,
      email: updates.email ? String(updates.email).trim() : null,
      phone: updates.phone ? String(updates.phone).trim() : null,
      status: "ACTIVE",
      billing: {
        currency: updates.currency || "INR",
        taxRate: updates.taxRate !== undefined ? parseFloat(updates.taxRate) : 5.0,
        gstNumber: updates.gstNumber || null
      },
      deliveryProfile: {
        operatingHours: updates.operatingHours || { open: "11:00", close: "23:00" },
        branding: updates.branding || {},
        settings: updates.settings || {}
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    clients.push(client);
    saveJson(crmStore.CLIENTS_FILE, clients);

    if (isSyncEnabled()) {
      restaurantRepository.updateRestaurantProfile(restaurantId, updates).catch(err => {
        console.warn("[RestaurantStore PG Sync Warning]", err.message);
      });
    }

    return formatClientAsRestaurant(client);
  }

  const currentBilling = client.billing || {};
  const currentProfile = client.deliveryProfile || {};

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

  const updatedClient = crmStore.updateClient(restaurantId, {
    name: updates.name !== undefined ? String(updates.name).trim() : client.name,
    company: updates.company !== undefined ? String(updates.company).trim() : client.company,
    companyName: updates.company !== undefined ? String(updates.company).trim() : (client.companyName || client.name),
    email: updates.email !== undefined ? String(updates.email).trim() : client.email,
    phone: updates.phone !== undefined ? String(updates.phone).trim() : client.phone,
    billing: newBilling,
    deliveryProfile: newProfile
  });

  if (isSyncEnabled()) {
    restaurantRepository.updateRestaurantProfile(restaurantId, updates).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return formatClientAsRestaurant(updatedClient);
}

// ==========================================
// 2. BRANCHES
// ==========================================

function getBranches(restaurantId) {
  const branches = loadJson(BRANCHES_FILE);
  if (!restaurantId) return branches;
  return branches.filter(b => b.restaurantId === restaurantId);
}

function getBranchById(restaurantId, branchId) {
  if (!restaurantId || !branchId) return null;
  const branches = loadJson(BRANCHES_FILE);
  return branches.find(b => b.restaurantId === restaurantId && b.id === branchId) || null;
}

function createBranch(branchData = {}) {
  if (!branchData.restaurantId) {
    throw new Error("Branch must include restaurantId.");
  }
  const name = String(branchData.name || "").trim();
  if (!name) {
    throw new Error("Branch name is required.");
  }

  const branches = loadJson(BRANCHES_FILE);
  const duplicate = branches.find(
    b => b.restaurantId === branchData.restaurantId && b.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`A branch with name "${name}" already exists.`);
  }

  const now = new Date().toISOString();
  const record = {
    id: branchData.id || `brn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    restaurantId: branchData.restaurantId,
    name,
    branchCode: branchData.branchCode ? String(branchData.branchCode).trim() : null,
    address: branchData.address || null,
    city: branchData.city || null,
    phone: branchData.phone || null,
    email: branchData.email || null,
    status: branchData.status || "ACTIVE",
    settings: branchData.settings || {},
    createdAt: branchData.createdAt || now,
    updatedAt: branchData.updatedAt || now
  };

  branches.push(record);
  saveJson(BRANCHES_FILE, branches);

  if (isSyncEnabled()) {
    restaurantRepository.createBranch(record).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return record;
}

function updateBranch(restaurantId, branchId, updates = {}) {
  const branches = loadJson(BRANCHES_FILE);
  const idx = branches.findIndex(b => b.restaurantId === restaurantId && b.id === branchId);
  if (idx === -1) return null;

  const current = branches[idx];
  let newName = current.name;
  if (updates.name !== undefined) {
    newName = String(updates.name).trim();
    if (!newName) {
      throw new Error("Branch name cannot be empty.");
    }
    const duplicate = branches.find(
      b => b.restaurantId === restaurantId && b.id !== branchId && b.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A branch with name "${newName}" already exists.`);
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    name: newName,
    branchCode: updates.branchCode !== undefined ? updates.branchCode : current.branchCode,
    address: updates.address !== undefined ? updates.address : current.address,
    city: updates.city !== undefined ? updates.city : current.city,
    phone: updates.phone !== undefined ? updates.phone : current.phone,
    email: updates.email !== undefined ? updates.email : current.email,
    status: updates.status !== undefined ? updates.status : current.status,
    settings: updates.settings !== undefined ? updates.settings : current.settings,
    updatedAt: now
  };

  branches[idx] = updated;
  saveJson(BRANCHES_FILE, branches);

  if (isSyncEnabled()) {
    restaurantRepository.updateBranch(restaurantId, branchId, updates).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

// ==========================================
// 3. TABLES
// ==========================================

function getTables(restaurantId, filters = {}) {
  const tables = loadJson(TABLES_FILE);
  return tables.filter(t => {
    if (restaurantId && t.restaurantId !== restaurantId) return false;
    if (filters.branchId && t.branchId !== filters.branchId) return false;
    if (filters.status && t.status !== filters.status) return false;
    return true;
  });
}

function getTableById(restaurantId, tableId) {
  if (!restaurantId || !tableId) return null;
  const tables = loadJson(TABLES_FILE);
  return tables.find(t => t.restaurantId === restaurantId && t.id === tableId) || null;
}

function createTable(tableData = {}) {
  if (!tableData.restaurantId) {
    throw new Error("Table must include restaurantId.");
  }
  const tableNumber = String(tableData.tableNumber || "").trim();
  if (!tableNumber) {
    throw new Error("Table number is required.");
  }

  const capacity = parseInt(tableData.capacity, 10);
  if (isNaN(capacity) || capacity <= 0) {
    throw new Error("Table capacity must be an integer greater than 0.");
  }

  if (tableData.branchId) {
    const branch = getBranchById(tableData.restaurantId, tableData.branchId);
    if (!branch) {
      throw new Error("Branch not found or does not belong to this restaurant.");
    }
  }

  const tables = loadJson(TABLES_FILE);
  const targetBranchId = tableData.branchId || null;
  const duplicate = tables.find(
    t =>
      t.restaurantId === tableData.restaurantId &&
      (t.branchId || null) === targetBranchId &&
      t.tableNumber.toLowerCase() === tableNumber.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Table number "${tableNumber}" already exists in this branch.`);
  }

  const now = new Date().toISOString();
  const record = {
    id: tableData.id || `tbl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    restaurantId: tableData.restaurantId,
    branchId: targetBranchId,
    tableNumber,
    name: tableData.name || null,
    capacity,
    status: tableData.status || "AVAILABLE",
    isActive: tableData.isActive !== undefined ? Boolean(tableData.isActive) : true,
    qrCodeToken: tableData.qrCodeToken || null,
    createdAt: tableData.createdAt || now,
    updatedAt: tableData.updatedAt || now
  };

  tables.push(record);
  saveJson(TABLES_FILE, tables);

  if (isSyncEnabled()) {
    restaurantRepository.createTable(record).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return record;
}

function updateTable(restaurantId, tableId, updates = {}) {
  const tables = loadJson(TABLES_FILE);
  const idx = tables.findIndex(t => t.restaurantId === restaurantId && t.id === tableId);
  if (idx === -1) return null;

  const current = tables[idx];

  let capacity = current.capacity;
  if (updates.capacity !== undefined) {
    capacity = parseInt(updates.capacity, 10);
    if (isNaN(capacity) || capacity <= 0) {
      throw new Error("Table capacity must be an integer greater than 0.");
    }
  }

  let branchId = current.branchId;
  if (updates.branchId !== undefined) {
    branchId = updates.branchId || null;
    if (branchId) {
      const branch = getBranchById(restaurantId, branchId);
      if (!branch) {
        throw new Error("Branch not found or does not belong to this restaurant.");
      }
    }
  }

  let tableNumber = current.tableNumber;
  if (updates.tableNumber !== undefined) {
    tableNumber = String(updates.tableNumber).trim();
    if (!tableNumber) {
      throw new Error("Table number cannot be empty.");
    }
  }

  if (updates.tableNumber !== undefined || updates.branchId !== undefined) {
    const duplicate = tables.find(
      t =>
        t.restaurantId === restaurantId &&
        t.id !== tableId &&
        (t.branchId || null) === (branchId || null) &&
        t.tableNumber.toLowerCase() === tableNumber.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Table number "${tableNumber}" already exists in this branch.`);
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    branchId,
    tableNumber,
    name: updates.name !== undefined ? updates.name : current.name,
    capacity,
    status: updates.status !== undefined ? updates.status : current.status,
    isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive,
    qrCodeToken: updates.qrCodeToken !== undefined ? updates.qrCodeToken : current.qrCodeToken,
    updatedAt: now
  };

  tables[idx] = updated;
  saveJson(TABLES_FILE, tables);

  if (isSyncEnabled()) {
    restaurantRepository.updateTable(restaurantId, tableId, updates).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

// ==========================================
// 4. TABLE SESSIONS
// ==========================================

function getSession(id) {
  const sessions = loadJson(SESSIONS_FILE);
  return sessions.find(s => s.id === id) || null;
}

function createTableSession(sessionData = {}) {
  if (!sessionData.restaurantId || !sessionData.tableId) {
    throw new Error("Table session must include restaurantId and tableId.");
  }
  const sessions = loadJson(SESSIONS_FILE);
  const now = new Date().toISOString();
  const record = {
    id: sessionData.id || `sess-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    restaurantId: sessionData.restaurantId,
    branchId: sessionData.branchId || null,
    tableId: sessionData.tableId,
    sessionCode: sessionData.sessionCode || `sc-${Date.now().toString(36).toUpperCase()}`,
    status: sessionData.status || "ACTIVE",
    guestCount: parseInt(sessionData.guestCount, 10) || 1,
    customerName: sessionData.customerName || null,
    customerPhone: sessionData.customerPhone || null,
    openedAt: sessionData.openedAt || now,
    closedAt: sessionData.closedAt || null,
    metadata: sessionData.metadata || {},
    createdAt: sessionData.createdAt || now,
    updatedAt: sessionData.updatedAt || now
  };

  sessions.push(record);
  saveJson(SESSIONS_FILE, sessions);

  if (isSyncEnabled()) {
    restaurantRepository.createTableSession(record).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return record;
}

function getActiveSessionForTable(restaurantId, tableId) {
  const sessions = loadJson(SESSIONS_FILE);
  return sessions
    .filter(s => s.restaurantId === restaurantId && s.tableId === tableId && s.status === "ACTIVE")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function updateSessionStatus(sessionId, status, closedAt = null) {
  const sessions = loadJson(SESSIONS_FILE);
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return null;
  sessions[idx].status = status;
  if (closedAt) sessions[idx].closedAt = closedAt;
  sessions[idx].updatedAt = new Date().toISOString();
  saveJson(SESSIONS_FILE, sessions);

  if (isSyncEnabled()) {
    restaurantRepository.updateTableSessionStatus(sessionId, status, closedAt).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }
  return sessions[idx];
}

// ==========================================
// 4b. CART MANAGEMENT
// ==========================================

function getCartItems(tableSessionId) {
  if (!tableSessionId) return [];
  const cartItems = loadJson(CART_ITEMS_FILE).filter(ci => ci.tableSessionId === tableSessionId);
  const menuItems = loadJson(MENU_ITEMS_FILE);

  return cartItems.map(ci => {
    const mi = menuItems.find(m => m.id === ci.menuItemId) || {};
    const price = mi.price !== undefined ? parseFloat(mi.price) : 0;
    const qty = parseInt(ci.quantity, 10) || 1;
    const lineTotal = Math.round(price * qty * 100) / 100;

    return {
      id: ci.id,
      restaurantId: ci.restaurantId,
      tableSessionId: ci.tableSessionId,
      menuItemId: ci.menuItemId,
      quantity: qty,
      customizations: ci.customizations || [],
      notes: ci.notes || null,
      itemName: mi.name || "Item",
      price,
      currency: mi.currency || "INR",
      taxRate: mi.taxRate !== undefined ? parseFloat(mi.taxRate) : 5.0,
      dietaryType: mi.dietaryType || null,
      isAvailable: mi.isAvailable !== undefined ? Boolean(mi.isAvailable) : true,
      isActive: mi.isActive !== undefined ? Boolean(mi.isActive) : true,
      imageUrl: mi.imageUrl || null,
      lineTotal,
      createdAt: ci.createdAt,
      updatedAt: ci.updatedAt
    };
  });
}

function getCartItemById(cartItemId) {
  if (!cartItemId) return null;
  const items = loadJson(CART_ITEMS_FILE);
  return items.find(ci => ci.id === cartItemId) || null;
}

function addToCart(session, menuItemId, quantity = 1, options = {}) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    throw new Error("Quantity must be a positive integer.");
  }

  const menuItem = getMenuItemById(session.restaurantId, menuItemId);
  if (!menuItem) {
    throw new Error("Menu item not found or does not belong to this restaurant.");
  }
  if (menuItem.isActive === false) {
    throw new Error(`Menu item "${menuItem.name}" is no longer active.`);
  }
  if (menuItem.isAvailable === false) {
    throw new Error(`Menu item "${menuItem.name}" is currently unavailable.`);
  }

  const cart = loadJson(CART_ITEMS_FILE);
  const existingIdx = cart.findIndex(
    ci => ci.tableSessionId === session.id && ci.menuItemId === menuItemId
  );

  const now = new Date().toISOString();
  let itemRecord;

  if (existingIdx !== -1) {
    cart[existingIdx].quantity += qty;
    if (options.notes !== undefined) cart[existingIdx].notes = options.notes;
    if (options.customizations !== undefined) cart[existingIdx].customizations = options.customizations;
    cart[existingIdx].updatedAt = now;
    itemRecord = cart[existingIdx];
  } else {
    itemRecord = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      restaurantId: session.restaurantId,
      tableSessionId: session.id,
      menuItemId,
      quantity: qty,
      customizations: options.customizations || [],
      notes: options.notes || null,
      createdAt: now,
      updatedAt: now
    };
    cart.push(itemRecord);
  }

  saveJson(CART_ITEMS_FILE, cart);

  if (isSyncEnabled()) {
    restaurantRepository.upsertCartItem(itemRecord).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return itemRecord;
}

function updateCartItemQuantity(sessionId, cartItemId, quantity) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    throw new Error("Quantity must be an integer greater than 0.");
  }

  const cart = loadJson(CART_ITEMS_FILE);
  const idx = cart.findIndex(ci => ci.id === cartItemId && ci.tableSessionId === sessionId);
  if (idx === -1) {
    return null;
  }

  cart[idx].quantity = qty;
  cart[idx].updatedAt = new Date().toISOString();
  saveJson(CART_ITEMS_FILE, cart);

  if (isSyncEnabled()) {
    restaurantRepository.updateCartItemQuantity(cartItemId, qty).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return cart[idx];
}

function removeCartItem(sessionId, cartItemId) {
  const cart = loadJson(CART_ITEMS_FILE);
  const idx = cart.findIndex(ci => ci.id === cartItemId && ci.tableSessionId === sessionId);
  if (idx === -1) {
    return null;
  }

  const removed = cart.splice(idx, 1)[0];
  saveJson(CART_ITEMS_FILE, cart);

  if (isSyncEnabled()) {
    restaurantRepository.deleteCartItem(cartItemId).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return removed;
}

function clearCart(sessionId) {
  const cart = loadJson(CART_ITEMS_FILE);
  const remaining = cart.filter(ci => ci.tableSessionId !== sessionId);
  saveJson(CART_ITEMS_FILE, remaining);

  if (isSyncEnabled()) {
    restaurantRepository.clearCart(sessionId).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return { success: true };
}

function getOrdersBySession(tableSessionId) {
  const orders = loadJson(ORDERS_FILE).filter(o => o.tableSessionId === tableSessionId);
  const allItems = loadJson(ORDER_ITEMS_FILE);
  return orders.map(o => ({
    ...o,
    items: allItems.filter(oi => oi.orderId === o.id)
  }));
}

// ==========================================
// 5. MENU CATEGORIES
// ==========================================

function getCategories(restaurantId) {
  const cats = loadJson(CATEGORIES_FILE);
  if (!restaurantId) return cats;
  return cats
    .filter(c => c.restaurantId === restaurantId)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name));
}

function getCategoryById(restaurantId, categoryId) {
  if (!restaurantId || !categoryId) return null;
  const cats = loadJson(CATEGORIES_FILE);
  return cats.find(c => c.restaurantId === restaurantId && c.id === categoryId) || null;
}

function createCategory(catData = {}) {
  if (!catData.restaurantId) {
    throw new Error("Category must include restaurantId.");
  }
  const name = String(catData.name || "").trim();
  if (!name) {
    throw new Error("Category name is required.");
  }

  const categories = loadJson(CATEGORIES_FILE);
  const duplicate = categories.find(
    c => c.restaurantId === catData.restaurantId && c.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Category with name "${name}" already exists in this restaurant.`);
  }

  if (catData.branchId) {
    const branch = getBranchById(catData.restaurantId, catData.branchId);
    if (!branch) {
      throw new Error("Branch not found or does not belong to this restaurant.");
    }
  }

  const now = new Date().toISOString();
  const record = {
    id: catData.id || `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    restaurantId: catData.restaurantId,
    branchId: catData.branchId || null,
    name,
    description: catData.description || null,
    displayOrder: parseInt(catData.displayOrder, 10) || 0,
    isActive: catData.isActive !== undefined ? Boolean(catData.isActive) : true,
    createdAt: catData.createdAt || now,
    updatedAt: catData.updatedAt || now
  };

  categories.push(record);
  saveJson(CATEGORIES_FILE, categories);

  if (isSyncEnabled()) {
    restaurantRepository.createCategory(record).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return record;
}

function updateCategory(restaurantId, categoryId, updates = {}) {
  const categories = loadJson(CATEGORIES_FILE);
  const idx = categories.findIndex(c => c.restaurantId === restaurantId && c.id === categoryId);
  if (idx === -1) return null;

  const current = categories[idx];
  let newName = current.name;
  if (updates.name !== undefined) {
    newName = String(updates.name).trim();
    if (!newName) {
      throw new Error("Category name cannot be empty.");
    }
    const duplicate = categories.find(
      c => c.restaurantId === restaurantId && c.id !== categoryId && c.name.toLowerCase() === newName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Category with name "${newName}" already exists in this restaurant.`);
    }
  }

  let branchId = current.branchId;
  if (updates.branchId !== undefined) {
    branchId = updates.branchId || null;
    if (branchId) {
      const branch = getBranchById(restaurantId, branchId);
      if (!branch) {
        throw new Error("Branch not found or does not belong to this restaurant.");
      }
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    name: newName,
    description: updates.description !== undefined ? updates.description : current.description,
    displayOrder: updates.displayOrder !== undefined ? parseInt(updates.displayOrder, 10) : current.displayOrder,
    isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive,
    branchId,
    updatedAt: now
  };

  categories[idx] = updated;
  saveJson(CATEGORIES_FILE, categories);

  if (isSyncEnabled()) {
    restaurantRepository.updateCategory(restaurantId, categoryId, updates).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

function deleteCategory(restaurantId, categoryId) {
  const categories = loadJson(CATEGORIES_FILE);
  const idx = categories.findIndex(c => c.restaurantId === restaurantId && c.id === categoryId);
  if (idx === -1) return null;

  const items = loadJson(MENU_ITEMS_FILE);
  const hasItems = items.some(i => i.restaurantId === restaurantId && i.categoryId === categoryId);

  let result;
  if (hasItems) {
    categories[idx].isActive = false;
    categories[idx].updatedAt = new Date().toISOString();
    saveJson(CATEGORIES_FILE, categories);
    result = { success: true, softDeleted: true, message: "Category deactivated due to existing menu items." };
  } else {
    categories.splice(idx, 1);
    saveJson(CATEGORIES_FILE, categories);
    result = { success: true, softDeleted: false, message: "Category deleted." };
  }

  if (isSyncEnabled()) {
    restaurantRepository.deleteCategory(restaurantId, categoryId).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return result;
}

// ==========================================
// 6. MENU ITEMS
// ==========================================

const VALID_DIETARY_TYPES = ["VEG", "NON_VEG", "VEGAN", "EGG"];

function getMenuItems(restaurantId, filters = {}) {
  const items = loadJson(MENU_ITEMS_FILE);
  return items
    .filter(i => {
      if (restaurantId && i.restaurantId !== restaurantId) return false;
      if (filters.categoryId && i.categoryId !== filters.categoryId) return false;
      if (filters.isAvailable !== undefined && i.isAvailable !== Boolean(filters.isAvailable)) return false;
      if (filters.isActive !== undefined && i.isActive !== Boolean(filters.isActive)) return false;
      if (filters.dietaryType && i.dietaryType !== String(filters.dietaryType).toUpperCase().trim()) return false;
      return true;
    })
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name));
}

function getMenuItemById(restaurantId, itemId) {
  if (!restaurantId || !itemId) return null;
  const items = loadJson(MENU_ITEMS_FILE);
  return items.find(i => i.restaurantId === restaurantId && i.id === itemId) || null;
}

function createMenuItem(itemData = {}) {
  if (!itemData.restaurantId) {
    throw new Error("Menu item must include restaurantId.");
  }
  const name = String(itemData.name || "").trim();
  if (!name) {
    throw new Error("Menu item name is required.");
  }

  if (!itemData.categoryId) {
    throw new Error("Menu item must include a valid categoryId.");
  }
  const category = getCategoryById(itemData.restaurantId, itemData.categoryId);
  if (!category) {
    throw new Error("Category not found or does not belong to this restaurant.");
  }

  const price = parseFloat(itemData.price);
  if (isNaN(price) || price < 0) {
    throw new Error("Menu item price must be a non-negative number.");
  }

  const dietaryType = String(itemData.dietaryType || "NON_VEG").toUpperCase().trim();
  if (!VALID_DIETARY_TYPES.includes(dietaryType)) {
    throw new Error(`Invalid dietary type "${itemData.dietaryType}". Must be one of: ${VALID_DIETARY_TYPES.join(", ")}`);
  }

  let taxRate = 5.00;
  if (itemData.taxRate !== undefined) {
    taxRate = parseFloat(itemData.taxRate);
    if (isNaN(taxRate) || taxRate < 0) {
      throw new Error("Tax rate must be a non-negative number.");
    }
  }

  const items = loadJson(MENU_ITEMS_FILE);
  const now = new Date().toISOString();
  const record = {
    id: itemData.id || `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    restaurantId: itemData.restaurantId,
    categoryId: itemData.categoryId,
    name,
    description: itemData.description || null,
    price: Math.round(price * 100) / 100,
    currency: itemData.currency || "INR",
    taxRate,
    dietaryType,
    isAvailable: itemData.isAvailable !== undefined ? Boolean(itemData.isAvailable) : true,
    isActive: itemData.isActive !== undefined ? Boolean(itemData.isActive) : true,
    imageUrl: itemData.imageUrl || null,
    displayOrder: parseInt(itemData.displayOrder, 10) || 0,
    customizations: Array.isArray(itemData.customizations) ? itemData.customizations : [],
    createdAt: itemData.createdAt || now,
    updatedAt: itemData.updatedAt || now
  };

  items.push(record);
  saveJson(MENU_ITEMS_FILE, items);

  if (isSyncEnabled()) {
    restaurantRepository.createMenuItem(record).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return record;
}

function updateMenuItem(restaurantId, itemId, updates = {}) {
  const items = loadJson(MENU_ITEMS_FILE);
  const idx = items.findIndex(i => i.restaurantId === restaurantId && i.id === itemId);
  if (idx === -1) return null;

  const current = items[idx];

  let categoryId = current.categoryId;
  if (updates.categoryId !== undefined) {
    const category = getCategoryById(restaurantId, updates.categoryId);
    if (!category) {
      throw new Error("Category not found or does not belong to this restaurant.");
    }
    categoryId = updates.categoryId;
  }

  let name = current.name;
  if (updates.name !== undefined) {
    name = String(updates.name).trim();
    if (!name) {
      throw new Error("Menu item name cannot be empty.");
    }
  }

  let price = current.price;
  if (updates.price !== undefined) {
    price = parseFloat(updates.price);
    if (isNaN(price) || price < 0) {
      throw new Error("Menu item price must be a non-negative number.");
    }
    price = Math.round(price * 100) / 100;
  }

  let dietaryType = current.dietaryType;
  if (updates.dietaryType !== undefined) {
    dietaryType = String(updates.dietaryType).toUpperCase().trim();
    if (!VALID_DIETARY_TYPES.includes(dietaryType)) {
      throw new Error(`Invalid dietary type "${updates.dietaryType}". Must be one of: ${VALID_DIETARY_TYPES.join(", ")}`);
    }
  }

  let taxRate = current.taxRate;
  if (updates.taxRate !== undefined) {
    taxRate = parseFloat(updates.taxRate);
    if (isNaN(taxRate) || taxRate < 0) {
      throw new Error("Tax rate must be a non-negative number.");
    }
  }

  const now = new Date().toISOString();
  const updated = {
    ...current,
    categoryId,
    name,
    description: updates.description !== undefined ? updates.description : current.description,
    price,
    currency: updates.currency !== undefined ? updates.currency : current.currency,
    taxRate,
    dietaryType,
    isAvailable: updates.isAvailable !== undefined ? Boolean(updates.isAvailable) : current.isAvailable,
    isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : current.isActive,
    imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : current.imageUrl,
    displayOrder: updates.displayOrder !== undefined ? parseInt(updates.displayOrder, 10) : current.displayOrder,
    customizations: Array.isArray(updates.customizations) ? updates.customizations : current.customizations,
    updatedAt: now
  };

  items[idx] = updated;
  saveJson(MENU_ITEMS_FILE, items);

  if (isSyncEnabled()) {
    restaurantRepository.updateMenuItem(restaurantId, itemId, updates).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return updated;
}

function deleteMenuItem(restaurantId, itemId) {
  const items = loadJson(MENU_ITEMS_FILE);
  const idx = items.findIndex(i => i.restaurantId === restaurantId && i.id === itemId);
  if (idx === -1) return null;

  items[idx].isActive = false;
  items[idx].updatedAt = new Date().toISOString();
  saveJson(MENU_ITEMS_FILE, items);

  if (isSyncEnabled()) {
    restaurantRepository.deleteMenuItem(restaurantId, itemId).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return items[idx];
}

function updateTableQrToken(restaurantId, tableId, qrToken) {
  const tables = loadJson(TABLES_FILE);
  const idx = tables.findIndex(t => t.restaurantId === restaurantId && t.id === tableId);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  tables[idx].qrCodeToken = qrToken;
  tables[idx].updatedAt = now;
  saveJson(TABLES_FILE, tables);

  if (isSyncEnabled()) {
    restaurantRepository.updateTableQrToken(restaurantId, tableId, qrToken).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return tables[idx];
}

function getTableByQrToken(qrToken) {
  if (!qrToken || typeof qrToken !== "string") return null;
  const tables = loadJson(TABLES_FILE);
  return tables.find(t => t.qrCodeToken === qrToken.trim() && t.isActive !== false) || null;
}

// ==========================================
// 7. RESTAURANT ORDERS & ORDER ITEMS
// ==========================================

function getOrder(id) {
  const orders = loadJson(ORDERS_FILE);
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  const orderItems = loadJson(ORDER_ITEMS_FILE).filter(oi => oi.orderId === id);
  return { ...order, items: orderItems };
}

function createOrder(orderData = {}, items = []) {
  if (!orderData.restaurantId || !orderData.tableId || !orderData.tableSessionId) {
    throw new Error("Order must include restaurantId, tableId, and tableSessionId.");
  }
  const orders = loadJson(ORDERS_FILE);
  const orderItems = loadJson(ORDER_ITEMS_FILE);
  const now = new Date().toISOString();

  let subtotal = 0;
  const createdItems = [];
  const orderId = orderData.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  for (const item of items) {
    const unitPrice = parseFloat(item.unitPrice);
    const qty = parseInt(item.quantity, 10) || 1;
    const lineTotal = Math.round(unitPrice * qty * 100) / 100;
    subtotal += lineTotal;

    const itemRecord = {
      id: item.id || `oi-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      restaurantId: orderData.restaurantId,
      orderId,
      menuItemId: item.menuItemId || null,
      itemName: String(item.itemName || "Item").trim(),
      quantity: qty,
      unitPrice: Math.round(unitPrice * 100) / 100, // Historical snapshot
      taxRate: item.taxRate !== undefined ? parseFloat(item.taxRate) : 5.00,
      subtotal: lineTotal,
      notes: item.notes || null,
      createdAt: now,
      updatedAt: now
    };
    createdItems.push(itemRecord);
    orderItems.push(itemRecord);
  }

  const taxAmount = Math.round(subtotal * 0.05 * 100) / 100;
  const discountAmount = parseFloat(orderData.discountAmount || 0);
  const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);

  const orderRecord = {
    id: orderId,
    restaurantId: orderData.restaurantId,
    branchId: orderData.branchId || null,
    tableId: orderData.tableId,
    tableSessionId: orderData.tableSessionId,
    orderNumber: orderData.orderNumber || `ORD-${Date.now().toString().slice(-4)}`,
    status: orderData.status || "NEW",
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount,
    discountAmount,
    totalAmount: Math.round(totalAmount * 100) / 100,
    notes: orderData.notes || null,
    cancelReason: null,
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now
  };

  orders.push(orderRecord);
  saveJson(ORDERS_FILE, orders);
  saveJson(ORDER_ITEMS_FILE, orderItems);

  if (isSyncEnabled()) {
    restaurantRepository.createOrder(orderRecord, createdItems).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return { ...orderRecord, items: createdItems };
}

async function placeOrder(orderData = {}, items = [], tableSessionId = null) {
  if (!orderData.restaurantId || !orderData.tableId || !orderData.tableSessionId) {
    throw new Error("Order must include restaurantId, tableId, and tableSessionId.");
  }
  if (!items || items.length === 0) {
    throw new Error("Cannot place an order with no items.");
  }

  const sid = tableSessionId || orderData.tableSessionId;

  if (isSyncEnabled()) {
    try {
      const createdOrder = await restaurantRepository.placeOrderTransaction(orderData, items, sid);
      const orders = loadJson(ORDERS_FILE);
      orders.push(createdOrder);
      saveJson(ORDERS_FILE, orders);

      const allOrderItems = loadJson(ORDER_ITEMS_FILE);
      for (const item of createdOrder.items || []) {
        allOrderItems.push(item);
      }
      saveJson(ORDER_ITEMS_FILE, allOrderItems);

      if (sid) {
        const cart = loadJson(CART_ITEMS_FILE);
        const remaining = cart.filter(ci => ci.tableSessionId !== sid);
        saveJson(CART_ITEMS_FILE, remaining);
      }
      try {
        updateTable(orderData.restaurantId, orderData.tableId, { status: "OCCUPIED" });
      } catch (tErr) {}
      return createdOrder;
    } catch (pgErr) {
      console.error("[RestaurantStore placeOrder Transaction Error]", pgErr);
      throw pgErr;
    }
  }

  const createdOrder = createOrder(orderData, items);
  if (sid) {
    clearCart(sid);
  }
  try {
    updateTable(orderData.restaurantId, orderData.tableId, { status: "OCCUPIED" });
  } catch (tErr) {}
  return createdOrder;
}

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
  if (isSyncEnabled()) {
    return await restaurantRepository.getKitchenOrders(restaurantId, filters);
  }

  const orders = loadJson(ORDERS_FILE).filter(o => o.restaurantId === restaurantId);
  const orderItems = loadJson(ORDER_ITEMS_FILE);
  const tables = loadJson(TABLES_FILE);
  const branches = loadJson(BRANCHES_FILE);
  const menuItems = loadJson(MENU_ITEMS_FILE);

  let filtered = orders;
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      const set = filters.status.map(s => String(s).toUpperCase().trim());
      filtered = filtered.filter(o => set.includes(o.status));
    } else {
      const s = String(filters.status).toUpperCase().trim();
      filtered = filtered.filter(o => o.status === s);
    }
  } else {
    filtered = filtered.filter(o => ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status));
  }

  if (filters.branchId) {
    filtered = filtered.filter(o => o.branchId === filters.branchId);
  }
  if (filters.tableId) {
    filtered = filtered.filter(o => o.tableId === filters.tableId);
  }

  filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return filtered.map(o => {
    const table = tables.find(t => t.id === o.tableId);
    const branch = branches.find(b => b.id === o.branchId);
    const items = orderItems
      .filter(oi => oi.orderId === o.id)
      .map(oi => {
        const mi = menuItems.find(m => m.id === oi.menuItemId);
        return {
          ...oi,
          dietaryType: mi ? mi.dietaryType : null
        };
      });

    return {
      ...o,
      tableName: table ? (table.name || `Table ${table.tableNumber}`) : null,
      tableNumber: table ? table.tableNumber : null,
      branchName: branch ? branch.name : null,
      items
    };
  });
}

async function getRestaurantOrderById(restaurantId, orderId) {
  if (isSyncEnabled()) {
    return await restaurantRepository.getOrderByIdAndRestaurant(restaurantId, orderId);
  }

  const orders = loadJson(ORDERS_FILE);
  const o = orders.find(ord => ord.id === orderId && ord.restaurantId === restaurantId);
  if (!o) return null;

  const orderItems = loadJson(ORDER_ITEMS_FILE);
  const tables = loadJson(TABLES_FILE);
  const branches = loadJson(BRANCHES_FILE);
  const menuItems = loadJson(MENU_ITEMS_FILE);

  const table = tables.find(t => t.id === o.tableId);
  const branch = branches.find(b => b.id === o.branchId);
  const items = orderItems
    .filter(oi => oi.orderId === o.id)
    .map(oi => {
      const mi = menuItems.find(m => m.id === oi.menuItemId);
      return {
        ...oi,
        dietaryType: mi ? mi.dietaryType : null
      };
    });

  return {
    ...o,
    tableName: table ? (table.name || `Table ${table.tableNumber}`) : null,
    tableNumber: table ? table.tableNumber : null,
    branchName: branch ? branch.name : null,
    items
  };
}

async function updateOrderStatus(restaurantId, orderId, newStatus, currentExpectedStatus = null, cancelReason = null) {
  const normNewStatus = String(newStatus || "").toUpperCase().trim();
  if (!VALID_ORDER_STATUSES.includes(normNewStatus)) {
    return {
      invalidStatus: true,
      message: `Invalid order status "${newStatus}". Must be one of: ${VALID_ORDER_STATUSES.join(", ")}`
    };
  }

  if (isSyncEnabled()) {
    const res = await restaurantRepository.updateOrderStatus(restaurantId, orderId, normNewStatus, currentExpectedStatus, cancelReason);
    if (res && res.success && res.order) {
      const orders = loadJson(ORDERS_FILE);
      const idx = orders.findIndex(o => o.id === orderId && o.restaurantId === restaurantId);
      if (idx !== -1) {
        orders[idx] = { ...orders[idx], ...res.order };
        saveJson(ORDERS_FILE, orders);
      }
      if (normNewStatus === "SERVED" || normNewStatus === "CANCELLED") {
        const remaining = orders.filter(
          o => o.restaurantId === restaurantId &&
               o.tableId === res.order.tableId &&
               ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status)
        );
        if (remaining.length === 0) {
          try {
            updateTable(restaurantId, res.order.tableId, { status: "AVAILABLE" });
          } catch (tErr) {}
        }
      }
    }
    return res;
  }

  const orders = loadJson(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === orderId && o.restaurantId === restaurantId);
  if (idx === -1) {
    return { notFound: true, message: "Order not found" };
  }

  const currentOrder = orders[idx];
  if (currentExpectedStatus && currentOrder.status !== currentExpectedStatus.toUpperCase().trim()) {
    return {
      conflict: true,
      currentStatus: currentOrder.status,
      message: `Stale status: order is currently ${currentOrder.status}, expected ${currentExpectedStatus}`
    };
  }

  const allowed = VALID_ORDER_TRANSITIONS[currentOrder.status] || [];
  if (!allowed.includes(normNewStatus)) {
    return {
      invalidTransition: true,
      fromStatus: currentOrder.status,
      toStatus: normNewStatus,
      message: `Invalid state transition from ${currentOrder.status} to ${normNewStatus}`
    };
  }

  const now = new Date().toISOString();
  currentOrder.status = normNewStatus;
  currentOrder.updatedAt = now;

  if (normNewStatus === "ACCEPTED") currentOrder.acceptedAt = now;
  else if (normNewStatus === "PREPARING") currentOrder.preparingAt = now;
  else if (normNewStatus === "READY") currentOrder.readyAt = now;
  else if (normNewStatus === "SERVED") currentOrder.servedAt = now;
  else if (normNewStatus === "CANCELLED") {
    currentOrder.cancelledAt = now;
    currentOrder.cancelReason = cancelReason || "Cancelled by restaurant staff";
  }

  orders[idx] = currentOrder;
  saveJson(ORDERS_FILE, orders);

  if (normNewStatus === "SERVED" || normNewStatus === "CANCELLED") {
    const remaining = orders.filter(
      o => o.restaurantId === restaurantId &&
           o.tableId === currentOrder.tableId &&
           ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status)
    );
    if (remaining.length === 0) {
      try {
        updateTable(restaurantId, currentOrder.tableId, { status: "AVAILABLE" });
      } catch (tErr) {}
    }
  }

  const orderItems = loadJson(ORDER_ITEMS_FILE);
  const menuItems = loadJson(MENU_ITEMS_FILE);
  const items = orderItems
    .filter(oi => oi.orderId === currentOrder.id)
    .map(oi => {
      const mi = menuItems.find(m => m.id === oi.menuItemId);
      return {
        ...oi,
        dietaryType: mi ? mi.dietaryType : null
      };
    });

  return {
    success: true,
    order: { ...currentOrder, items },
    previousStatus: currentOrder.status
  };
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

async function getBillingSettings(restaurantId) {
  if (!restaurantId) {
    return {
      restaurantId: null,
      billingEnabled: false,
      serviceChargeRate: 0.0,
      taxRate: 5.0,
      currency: "INR",
      gstNumber: null,
      updatedAt: null
    };
  }

  if (isSyncEnabled()) {
    try {
      return await restaurantRepository.getBillingSettings(restaurantId);
    } catch (err) {
      console.warn("[RestaurantStore getBillingSettings PG Fallback]", err.message);
    }
  }

  const client = crmStore.getClient(restaurantId);
  const billing = (client && client.billing) || {};
  return {
    restaurantId,
    billingEnabled: Boolean(billing.billingEnabled),
    serviceChargeRate: billing.serviceChargeRate !== undefined ? parseFloat(billing.serviceChargeRate) : 0.0,
    taxRate: billing.taxRate !== undefined ? parseFloat(billing.taxRate) : 5.0,
    currency: billing.currency || "INR",
    gstNumber: billing.gstNumber || null,
    updatedAt: (client && client.updatedAt) || null
  };
}

async function updateBillingSettings(restaurantId, updates = {}) {
  if (!restaurantId) throw new Error("restaurantId is required.");

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

  if (isSyncEnabled()) {
    try {
      const res = await restaurantRepository.updateBillingSettings(restaurantId, updates);
      // Synchronize crmStore local cache
      const client = crmStore.getClient(restaurantId);
      if (client) {
        client.billing = {
          ...(client.billing || {}),
          billingEnabled: res.billingEnabled,
          serviceChargeRate: res.serviceChargeRate,
          taxRate: res.taxRate,
          currency: res.currency,
          gstNumber: res.gstNumber
        };
        client.updatedAt = new Date().toISOString();
        const clients = loadJson(crmStore.CLIENTS_FILE);
        const idx = clients.findIndex(c => c.id === restaurantId);
        if (idx !== -1) {
          clients[idx] = client;
          saveJson(crmStore.CLIENTS_FILE, clients);
        }
      }
      return res;
    } catch (err) {
      console.warn("[RestaurantStore updateBillingSettings PG Sync Warning]", err.message);
    }
  }

  // Local JSON fallback
  let client = crmStore.getClient(restaurantId);
  const clients = loadJson(crmStore.CLIENTS_FILE);
  const now = new Date().toISOString();

  if (!client) {
    client = {
      id: restaurantId,
      name: "Restaurant",
      status: "ACTIVE",
      billing: {
        billingEnabled: updates.billingEnabled !== undefined ? Boolean(updates.billingEnabled) : false,
        serviceChargeRate: updates.serviceChargeRate !== undefined ? parseFloat(updates.serviceChargeRate) : 0.0,
        taxRate: updates.taxRate !== undefined ? parseFloat(updates.taxRate) : 5.0,
        currency: updates.currency || "INR",
        gstNumber: updates.gstNumber || null
      },
      createdAt: now,
      updatedAt: now
    };
    clients.push(client);
  } else {
    client.billing = {
      ...(client.billing || {}),
      ...(updates.billingEnabled !== undefined ? { billingEnabled: Boolean(updates.billingEnabled) } : {}),
      ...(updates.serviceChargeRate !== undefined ? { serviceChargeRate: parseFloat(updates.serviceChargeRate) } : {}),
      ...(updates.taxRate !== undefined ? { taxRate: parseFloat(updates.taxRate) } : {}),
      ...(updates.currency !== undefined ? { currency: String(updates.currency).trim().toUpperCase() } : {}),
      ...(updates.gstNumber !== undefined ? { gstNumber: updates.gstNumber ? String(updates.gstNumber).trim() : null } : {})
    };
    client.updatedAt = now;
    const idx = clients.findIndex(c => c.id === restaurantId);
    if (idx !== -1) {
      clients[idx] = client;
    }
  }
  saveJson(crmStore.CLIENTS_FILE, clients);

  return {
    restaurantId,
    billingEnabled: Boolean(client.billing.billingEnabled),
    serviceChargeRate: client.billing.serviceChargeRate || 0.0,
    taxRate: client.billing.taxRate !== undefined ? client.billing.taxRate : 5.0,
    currency: client.billing.currency || "INR",
    gstNumber: client.billing.gstNumber || null,
    updatedAt: client.updatedAt
  };
}

function getBill(restaurantIdOrBillId, maybeBillId) {
  let restaurantId = null;
  let billId = restaurantIdOrBillId;
  if (maybeBillId) {
    restaurantId = restaurantIdOrBillId;
    billId = maybeBillId;
  }

  const bills = loadJson(BILLS_FILE);
  if (restaurantId) {
    return bills.find(b => b.id === billId && b.restaurantId === restaurantId) || null;
  }
  return bills.find(b => b.id === billId) || null;
}

async function getRestaurantBillById(restaurantId, billId) {
  if (isSyncEnabled()) {
    try {
      const res = await restaurantRepository.getBillById(restaurantId, billId);
      if (res) return res;
    } catch (err) {
      console.warn("[RestaurantStore getBillById PG Warning]", err.message);
    }
  }
  return getBill(restaurantId, billId);
}

async function getBills(restaurantId, filters = {}) {
  if (isSyncEnabled()) {
    try {
      return await restaurantRepository.getBills(restaurantId, filters);
    } catch (err) {
      console.warn("[RestaurantStore getBills PG Warning]", err.message);
    }
  }

  const bills = loadJson(BILLS_FILE);
  let filtered = bills.filter(b => b.restaurantId === restaurantId);

  if (filters.paymentStatus) {
    const statuses = Array.isArray(filters.paymentStatus)
      ? filters.paymentStatus
      : filters.paymentStatus.split(",").map(s => s.trim().toUpperCase());
    filtered = filtered.filter(b => statuses.includes(String(b.paymentStatus || "").toUpperCase()));
  }

  if (filters.paymentMethod) {
    const pm = String(filters.paymentMethod).toUpperCase().trim();
    filtered = filtered.filter(b => String(b.paymentMethod || "").toUpperCase() === pm);
  }

  if (filters.orderId) {
    filtered = filtered.filter(b => b.orderId === filters.orderId);
  }

  if (filters.tableId) {
    filtered = filtered.filter(b => b.tableId === filters.tableId);
  }

  return filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function getBillByOrderId(restaurantId, orderId) {
  if (isSyncEnabled()) {
    try {
      const res = await restaurantRepository.getBillByOrderId(restaurantId, orderId);
      if (res) return res;
    } catch (err) {
      console.warn("[RestaurantStore getBillByOrderId PG Warning]", err.message);
    }
  }

  const bills = loadJson(BILLS_FILE);
  return bills.find(b => b.restaurantId === restaurantId && b.orderId === orderId) || null;
}

async function createBillForOrder(restaurantId, orderId, options = {}) {
  if (isSyncEnabled()) {
    try {
      const res = await restaurantRepository.createBillForOrder(restaurantId, orderId, options);
      if (res && res.success && res.bill) {
        const bills = loadJson(BILLS_FILE);
        const exists = bills.find(b => b.id === res.bill.id);
        if (!exists) {
          bills.push(res.bill);
          saveJson(BILLS_FILE, bills);
        }
      }
      return res;
    } catch (err) {
      console.error("[RestaurantStore createBillForOrder PG Error]", err);
      throw err;
    }
  }

  // Local JSON implementation
  const existing = await getBillByOrderId(restaurantId, orderId);
  if (existing) {
    return { success: true, alreadyExisted: true, bill: existing };
  }

  const orders = loadJson(ORDERS_FILE);
  const order = orders.find(o => o.restaurantId === restaurantId && o.id === orderId);
  if (!order) {
    return { notFound: true, message: "Order not found" };
  }

  if (order.status === "CANCELLED") {
    return { ineligible: true, message: "Cannot generate a bill for a cancelled order." };
  }

  const allOrderItems = loadJson(ORDER_ITEMS_FILE);
  const items = allOrderItems.filter(it => it.orderId === orderId);
  if (items.length === 0) {
    return { noItems: true, message: "Cannot generate a bill for an order with no items." };
  }

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

  const settings = await getBillingSettings(restaurantId);
  const scRate = (settings && typeof settings.serviceChargeRate === "number") ? settings.serviceChargeRate : 0;
  const serviceCharge = scRate > 0 ? Math.round((subtotal * (scRate / 100)) * 100) / 100 : 0.00;
  const grandTotal = Math.max(0, Math.round((subtotal - discountAmount + taxAmount + serviceCharge) * 100) / 100);

  const billId = options.id || `bill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const billNum = options.billNumber || `BILL-${order.orderNumber ? order.orderNumber.replace(/^[A-Z]+-?/, "") : Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();

  const record = {
    id: billId,
    restaurantId,
    branchId: order.branchId || null,
    tableId: order.tableId,
    tableSessionId: order.tableSessionId,
    orderId,
    billNumber: billNum,
    subtotal,
    discountAmount,
    taxAmount,
    serviceCharge,
    totalAmount: grandTotal,
    grandTotal,
    paymentStatus: "PENDING",
    paymentMethod: null,
    paymentRef: null,
    settledAt: null,
    settledBy: null,
    paidAt: null,
    notes: options.notes || null,
    orderNumber: order.orderNumber,
    items,
    createdAt: now,
    updatedAt: now
  };

  const bills = loadJson(BILLS_FILE);
  bills.push(record);
  saveJson(BILLS_FILE, bills);

  return {
    success: true,
    alreadyExisted: false,
    bill: record
  };
}

async function recordBillPayment(restaurantId, billId, paymentData = {}) {
  if (isSyncEnabled()) {
    try {
      const res = await restaurantRepository.recordBillPayment(restaurantId, billId, paymentData);
      if (res && res.success && res.bill) {
        const bills = loadJson(BILLS_FILE);
        const idx = bills.findIndex(b => b.id === billId && b.restaurantId === restaurantId);
        if (idx !== -1) {
          bills[idx] = { ...bills[idx], ...res.bill };
          saveJson(BILLS_FILE, bills);
        }
      }
      return res;
    } catch (err) {
      console.error("[RestaurantStore recordBillPayment PG Error]", err);
      throw err;
    }
  }

  // Local JSON fallback
  const normStatus = String(paymentData.paymentStatus || "PAID").toUpperCase().trim();
  if (!VALID_PAYMENT_STATUSES.includes(normStatus)) {
    return {
      invalidStatus: true,
      message: `Invalid payment status "${paymentData.paymentStatus}". Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
    };
  }

  const bills = loadJson(BILLS_FILE);
  const idx = bills.findIndex(b => b.id === billId && b.restaurantId === restaurantId);
  if (idx === -1) {
    return { notFound: true, message: "Bill not found" };
  }

  const currentBill = bills[idx];
  if (currentBill.paymentStatus === normStatus) {
    return { success: true, idempotent: true, bill: currentBill, previousStatus: currentBill.paymentStatus };
  }

  const allowed = VALID_PAYMENT_TRANSITIONS[currentBill.paymentStatus] || [];
  if (!allowed.includes(normStatus)) {
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
      return {
        invalidMethod: true,
        message: `Invalid payment method "${paymentData.paymentMethod}". Must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`
      };
    }
  } else if (normStatus === "PAID" && !normMethod) {
    normMethod = "CASH";
  }

  const now = new Date().toISOString();
  currentBill.paymentStatus = normStatus;
  currentBill.paymentMethod = normMethod;
  if (paymentData.paymentRef !== undefined) currentBill.paymentRef = paymentData.paymentRef;
  if (normStatus === "PAID") {
    currentBill.paidAt = now;
    currentBill.settledAt = now;
    currentBill.settledBy = paymentData.settledBy || "staff";
  } else if (normStatus === "VOID" || normStatus === "REFUNDED") {
    currentBill.settledAt = now;
  }
  if (paymentData.notes !== undefined) currentBill.notes = paymentData.notes;
  currentBill.updatedAt = now;

  bills[idx] = currentBill;
  saveJson(BILLS_FILE, bills);

  return { success: true, bill: currentBill, previousStatus: currentBill.paymentStatus };
}

function createBill(billData = {}) {
  if (!billData.restaurantId || !billData.tableId || !billData.tableSessionId) {
    throw new Error("Bill must include restaurantId, tableId, and tableSessionId.");
  }
  const bills = loadJson(BILLS_FILE);
  const now = new Date().toISOString();

  const record = {
    id: billData.id || `bill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    restaurantId: billData.restaurantId,
    branchId: billData.branchId || null,
    tableId: billData.tableId,
    tableSessionId: billData.tableSessionId,
    orderId: billData.orderId || null,
    billNumber: billData.billNumber || `BILL-${Date.now().toString().slice(-6)}`,
    subtotal: parseFloat(billData.subtotal || 0),
    discountAmount: parseFloat(billData.discountAmount || 0),
    taxAmount: parseFloat(billData.taxAmount || 0),
    serviceCharge: parseFloat(billData.serviceCharge || 0),
    totalAmount: parseFloat(billData.totalAmount || 0),
    paymentStatus: billData.paymentStatus || "PENDING",
    paymentMethod: billData.paymentMethod || null,
    settledAt: billData.settledAt || null,
    settledBy: billData.settledBy || null,
    paidAt: billData.paidAt || null,
    notes: billData.notes || null,
    createdAt: now,
    updatedAt: now
  };

  bills.push(record);
  saveJson(BILLS_FILE, bills);

  if (isSyncEnabled()) {
    restaurantRepository.createBill(record).catch(err => {
      console.warn("[RestaurantStore PG Sync Warning]", err.message);
    });
  }

  return record;
}

// Helper to safely clean up restaurant local files (used in tests)
function clearRestaurantData() {
  ensureStoreExists();
  const files = [
    BRANCHES_FILE,
    TABLES_FILE,
    SESSIONS_FILE,
    CATEGORIES_FILE,
    MENU_ITEMS_FILE,
    ORDERS_FILE,
    ORDER_ITEMS_FILE,
    BILLS_FILE,
    CART_ITEMS_FILE
  ];
  for (const file of files) {
    fs.writeFileSync(file, "[]", "utf8");
  }
}

module.exports = {
  ensureStoreExists,
  getRestaurantProfile,
  updateRestaurantProfile,
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  getTables,
  getTableById,
  createTable,
  updateTable,
  updateTableQrToken,
  getTableByQrToken,
  getSession,
  createTableSession,
  getActiveSessionForTable,
  updateSessionStatus,
  getCartItems,
  getCartItemById,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  getOrdersBySession,
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getOrder,
  createOrder,
  placeOrder,
  VALID_ORDER_TRANSITIONS,
  VALID_ORDER_STATUSES,
  getKitchenOrders,
  getRestaurantOrderById,
  updateOrderStatus,
  getBill,
  createBill,
  getBillingSettings,
  updateBillingSettings,
  getBills,
  getBillByOrderId,
  getRestaurantBillById,
  createBillForOrder,
  recordBillPayment,
  VALID_PAYMENT_STATUSES,
  VALID_PAYMENT_METHODS,
  VALID_PAYMENT_TRANSITIONS,
  clearRestaurantData
};
