-- Restaurant OS v1 - Production Schema Foundation for Neon PostgreSQL
-- Introduces 8 domain-isolated tables with strict multi-tenant scoping (restaurant_id -> clients.id).
-- 1. restaurant_branches
-- 2. restaurant_tables
-- 3. table_sessions
-- 4. menu_categories
-- 5. menu_items
-- 6. restaurant_orders
-- 7. order_items
-- 8. restaurant_bills

-- 1. Restaurant Branches (Multi-branch support per client)
CREATE TABLE IF NOT EXISTS restaurant_branches (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  branch_code VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_restaurant_branches_name UNIQUE (restaurant_id, name)
);

-- 2. Restaurant Tables (Physical dining tables)
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES restaurant_branches(id) ON DELETE SET NULL,
  table_number VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  capacity INTEGER NOT NULL DEFAULT 4 CHECK (capacity > 0),
  status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  qr_code_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplication index for tables with branch assigned
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_tables_with_branch 
  ON restaurant_tables (restaurant_id, branch_id, table_number) 
  WHERE branch_id IS NOT NULL;

-- Deduplication index for single-branch / unassigned tables
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_tables_no_branch 
  ON restaurant_tables (restaurant_id, table_number) 
  WHERE branch_id IS NULL;

-- 3. Table Sessions (Customer dining sessions at a physical table)
CREATE TABLE IF NOT EXISTS table_sessions (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES restaurant_branches(id) ON DELETE SET NULL,
  table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  session_code VARCHAR(64) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  guest_count INTEGER DEFAULT 1 CHECK (guest_count > 0),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_table_session_status CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED'))
);

-- 4. Menu Categories (Categorical hierarchy: Starters, Mains, Desserts, Beverages)
CREATE TABLE IF NOT EXISTS menu_categories (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES restaurant_branches(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_menu_categories_name UNIQUE (restaurant_id, name)
);

-- 5. Menu Items (Catalog items with current pricing)
CREATE TABLE IF NOT EXISTS menu_items (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_id VARCHAR(64) NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00 CHECK (tax_rate >= 0),
  dietary_type VARCHAR(50) DEFAULT 'NON_VEG',
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  customizations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_menu_item_dietary CHECK (dietary_type IN ('VEG', 'NON_VEG', 'VEGAN', 'EGG'))
);

-- 6. Restaurant Orders (Order aggregate placed by customers at a table)
CREATE TABLE IF NOT EXISTS restaurant_orders (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES restaurant_branches(id) ON DELETE SET NULL,
  table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  table_session_id VARCHAR(64) NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  order_number VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'NEW',
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  notes TEXT,
  cancel_reason TEXT,
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_order_status CHECK (status IN ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'))
);

-- 7. Order Items (Line items with HISTORICAL PRICE SNAPSHOT)
CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  order_id VARCHAR(64) NOT NULL REFERENCES restaurant_orders(id) ON DELETE CASCADE,
  menu_item_id VARCHAR(64) REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0), -- Immutable price snapshot at placement time
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0), -- Immutable tax rate snapshot
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Restaurant Bills (Consolidated table bill across multiple orders)
CREATE TABLE IF NOT EXISTS restaurant_bills (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch_id VARCHAR(64) REFERENCES restaurant_branches(id) ON DELETE SET NULL,
  table_id VARCHAR(64) NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  table_session_id VARCHAR(64) NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  order_id VARCHAR(64) REFERENCES restaurant_orders(id) ON DELETE SET NULL,
  bill_number VARCHAR(50) NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
  service_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (service_charge >= 0),
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  payment_method VARCHAR(50),
  payment_ref VARCHAR(255),
  settled_at TIMESTAMPTZ,
  settled_by VARCHAR(255),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bill_payment_status CHECK (payment_status IN ('PENDING', 'PAID', 'VOID', 'REFUNDED'))
);

-- Phase 6 additive migration safety
ALTER TABLE restaurant_bills ADD COLUMN IF NOT EXISTS order_id VARCHAR(64) REFERENCES restaurant_orders(id) ON DELETE SET NULL;
ALTER TABLE restaurant_bills ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE restaurant_bills ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE restaurant_bills ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(255);

-- =========================================================================
-- INDEXES FOR TENANT ISOLATION & HIGH-FREQUENCY WORKFLOW QUERIES
-- =========================================================================

-- Branches
CREATE INDEX IF NOT EXISTS idx_restaurant_branches_rid ON restaurant_branches(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_branches_rid_status ON restaurant_branches(restaurant_id, status);

-- Tables
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_rid ON restaurant_tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch ON restaurant_tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_rid_status ON restaurant_tables(restaurant_id, status);

-- Table Sessions
CREATE INDEX IF NOT EXISTS idx_table_sessions_rid ON table_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_table ON table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_rid_status ON table_sessions(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_rid_created ON table_sessions(restaurant_id, created_at);

-- Menu Categories
CREATE INDEX IF NOT EXISTS idx_menu_categories_rid ON menu_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_rid_order ON menu_categories(restaurant_id, display_order);

-- Menu Items
CREATE INDEX IF NOT EXISTS idx_menu_items_rid ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_rid_avail ON menu_items(restaurant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_rid_status ON menu_items(restaurant_id, is_active);

-- Restaurant Orders
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_rid ON restaurant_orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_session ON restaurant_orders(table_session_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table ON restaurant_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_rid_status ON restaurant_orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_rid_created ON restaurant_orders(restaurant_id, created_at);

-- Order Items
CREATE INDEX IF NOT EXISTS idx_order_items_rid ON order_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON order_items(menu_item_id);

-- Restaurant Bills
CREATE INDEX IF NOT EXISTS idx_restaurant_bills_rid ON restaurant_bills(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_bills_session ON restaurant_bills(table_session_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_bills_table ON restaurant_bills(table_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_bills_rid_status ON restaurant_bills(restaurant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_restaurant_bills_rid_created ON restaurant_bills(restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_restaurant_bills_order_id ON restaurant_bills(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_bills_order_id ON restaurant_bills(restaurant_id, order_id) WHERE order_id IS NOT NULL;

-- 9. Cart Items (Active dining customer carts per table session)
CREATE TABLE IF NOT EXISTS cart_items (
  id VARCHAR(64) PRIMARY KEY,
  restaurant_id VARCHAR(64) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  table_session_id VARCHAR(64) NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  customizations JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_cart_session_item UNIQUE (table_session_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_rid ON cart_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_session ON cart_items(table_session_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_menu_item ON cart_items(menu_item_id);

