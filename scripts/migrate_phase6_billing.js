/**
 * Migration script for Restaurant OS v1 - Phase 6 (Billing & Payments)
 * Adds order_id, service_charge, paid_at, payment_ref to restaurant_bills non-destructively.
 */

const { query, closePool, isPostgresConfigured } = require("../memory/db");

async function applyPhase6Migration() {
  if (!isPostgresConfigured()) {
    console.log("[Phase 6 Migration] PostgreSQL not configured. Skipping SQL migration.");
    return;
  }

  console.log("[Phase 6 Migration] Applying additive columns to restaurant_bills...");

  await query(`
    ALTER TABLE restaurant_bills 
      ADD COLUMN IF NOT EXISTS order_id VARCHAR(64) REFERENCES restaurant_orders(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS service_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(255);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_restaurant_bills_order_id ON restaurant_bills(order_id);
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_bills_order_id 
    ON restaurant_bills(restaurant_id, order_id) 
    WHERE order_id IS NOT NULL;
  `);

  console.log("[Phase 6 Migration] Migration completed successfully.");
}

if (require.main === module) {
  applyPhase6Migration()
    .then(() => closePool())
    .catch(err => {
      console.error("[Phase 6 Migration Error]", err);
      process.exit(1);
    });
}

module.exports = { applyPhase6Migration };
