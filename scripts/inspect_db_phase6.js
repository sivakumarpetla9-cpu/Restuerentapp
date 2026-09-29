const { query, closePool } = require("../memory/db");

async function check() {
  const billCols = await query(
    `SELECT column_name, data_type, is_nullable, column_default 
     FROM information_schema.columns 
     WHERE table_name = 'restaurant_bills' 
     ORDER BY ordinal_position;`
  );
  console.log("restaurant_bills columns:", billCols.rows);

  const clientCols = await query(
    `SELECT column_name, data_type 
     FROM information_schema.columns 
     WHERE table_name = 'clients' 
     ORDER BY ordinal_position;`
  );
  console.log("clients columns:", clientCols.rows.map(r => r.column_name));

  await closePool();
}

check().catch(console.error);
