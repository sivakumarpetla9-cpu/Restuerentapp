/**
 * Seed Script: Controlled Demo Restaurant Tenant for Pilot QA
 * 
 * Sets up "Demo Restaurant" with:
 * - 1 Branch (Downtown Flagship)
 * - 5 Tables (T-01 through T-05) with valid HMAC-SHA256 QR tokens
 * - 3 Menu Categories (Starters, Mains, Beverages)
 * - 12 Menu Items (VEG / NON_VEG, realistic prices, 1 unavailable item)
 * - Billing settings (default billingEnabled: false)
 *
 * Persists to both Neon PostgreSQL (when configured) and local JSON stores.
 */

require("dotenv").config();
const { isPostgresConfigured, closePool } = require("../memory/db");
const restaurantRepository = require("../memory/repositories/restaurantRepository");
const restaurantStore = require("../memory/restaurantStore");
const { generateQrToken } = require("../security/qrToken");

async function seedDemoRestaurant() {
  console.log("=================================================");
  console.log("SEEDING CONTROLLED DEMO RESTAURANT TENANT");
  console.log("=================================================");

  const restaurantId = "demo-restaurant-1";
  const branchId = "demo-branch-main";

  // 1. Restaurant Profile
  const profileData = {
    id: restaurantId,
    name: "Demo Restaurant",
    company: "Demo Hospitality Pvt Ltd",
    email: "demo@restaurant.test",
    phone: "+91-9876543210",
    currency: "INR",
    taxRate: 5.0,
    gstNumber: "07AAAAA0000A1Z5",
    operatingHours: { open: "11:00", close: "23:00" },
    branding: {
      primaryColor: "#0284c7",
      tagline: "Authentic Culinary Excellence"
    },
    settings: {
      billing: {
        billingEnabled: false,
        serviceChargeRate: 5.0,
        defaultTaxRate: 5.0,
        currency: "INR"
      }
    }
  };

  if (isPostgresConfigured()) {
    await restaurantRepository.updateRestaurantProfile(restaurantId, profileData);
  }
  restaurantStore.updateRestaurantProfile(restaurantId, profileData);
  console.log("✔ Profile created: Demo Restaurant");

  // 2. Branch
  const branchData = {
    id: branchId,
    restaurantId,
    name: "Downtown Flagship",
    branchCode: "DT-01",
    address: "42 Connaught Place, Block C",
    city: "New Delhi",
    phone: "+91-11-23456789",
    email: "flagship@demorestaurant.com",
    status: "ACTIVE"
  };

  if (isPostgresConfigured()) {
    await restaurantRepository.createBranch(branchData);
  }
  restaurantStore.createBranch(branchData);
  console.log("✔ Branch created: Downtown Flagship (DT-01)");

  // 3. Tables (5 tables with HMAC QR tokens)
  const tables = [
    { id: "demo-tbl-01", tableNumber: "T-01", name: "Window Booth 1", capacity: 4 },
    { id: "demo-tbl-02", tableNumber: "T-02", name: "Center Table 2", capacity: 2 },
    { id: "demo-tbl-03", tableNumber: "T-03", name: "Patio Table 3", capacity: 4 },
    { id: "demo-tbl-04", tableNumber: "T-04", name: "Family Booth 4", capacity: 6 },
    { id: "demo-tbl-05", tableNumber: "T-05", name: "VIP Lounge 5", capacity: 8 }
  ];

  const createdTables = [];
  for (const tbl of tables) {
    const qrToken = generateQrToken(restaurantId, tbl.id, branchId);
    const tableRecord = {
      id: tbl.id,
      restaurantId,
      branchId,
      tableNumber: tbl.tableNumber,
      name: tbl.name,
      capacity: tbl.capacity,
      status: "AVAILABLE",
      isActive: true,
      qrCodeToken: qrToken
    };

    if (isPostgresConfigured()) {
      await restaurantRepository.createTable(tableRecord);
    }
    restaurantStore.createTable(tableRecord);
    createdTables.push(tableRecord);
    console.log(`✔ Table created: ${tbl.tableNumber} (${tbl.name}) [Capacity: ${tbl.capacity}] - QR: ${qrToken.slice(0, 24)}...`);
  }

  // 4. Categories (3 categories)
  const categories = [
    { id: "demo-cat-starters", name: "Starters & Appetizers", displayOrder: 1, isActive: true },
    { id: "demo-cat-mains", name: "Main Courses", displayOrder: 2, isActive: true },
    { id: "demo-cat-beverages", name: "Beverages & Desserts", displayOrder: 3, isActive: true }
  ];

  for (const cat of categories) {
    const catRecord = {
      id: cat.id,
      restaurantId,
      name: cat.name,
      displayOrder: cat.displayOrder,
      isActive: cat.isActive
    };
    if (isPostgresConfigured()) {
      await restaurantRepository.createCategory(catRecord);
    }
    restaurantStore.createCategory(catRecord);
    console.log(`✔ Category created: ${cat.name}`);
  }

  // 5. Menu Items (12 items, VEG/NON_VEG, 1 unavailable)
  const items = [
    // Starters
    {
      id: "demo-mi-01",
      categoryId: "demo-cat-starters",
      name: "Crispy Paneer Tikka",
      description: "Chargrilled cottage cheese marinated in aromatic tandoori spices",
      price: 280.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-02",
      categoryId: "demo-cat-starters",
      name: "Murgh Malai Kebab",
      description: "Tender chicken morsels in rich cream, cheese, and cardamom glaze",
      price: 340.00,
      dietaryType: "NON_VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-03",
      categoryId: "demo-cat-starters",
      name: "Dahi Ke Kebab",
      description: "Hung curd patties infused with green chillies and fresh coriander",
      price: 260.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-04",
      categoryId: "demo-cat-starters",
      name: "Amritsari Fish Fry",
      description: "Spiced crispy batter-fried fish fillets served with mint chutney",
      price: 380.00,
      dietaryType: "NON_VEG",
      isAvailable: false, // Intentionally unavailable for testing item availability filters
      isActive: true
    },
    // Mains
    {
      id: "demo-mi-05",
      categoryId: "demo-cat-mains",
      name: "Dal Makhani Grandeur",
      description: "Slow-cooked black lentils overnight in butter, tomatoes, and cream",
      price: 310.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-06",
      categoryId: "demo-cat-mains",
      name: "Butter Chicken Old Delhi",
      description: "Succulent tandoori chicken simmered in satin tomato makhani sauce",
      price: 420.00,
      dietaryType: "NON_VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-07",
      categoryId: "demo-cat-mains",
      name: "Paneer Butter Masala",
      description: "Cottage cheese cubes tossed in velvet onion-tomato-cashew gravy",
      price: 330.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-08",
      categoryId: "demo-cat-mains",
      name: "Dum Gosht Biryani",
      description: "Fragrant basmati rice layered with spiced mutton cuts and saffron",
      price: 480.00,
      dietaryType: "NON_VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-09",
      categoryId: "demo-cat-mains",
      name: "Garlic Butter Naan",
      description: "Tandoori leavened flatbread brushed with garlic butter and fresh cilantro",
      price: 75.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    // Beverages & Desserts
    {
      id: "demo-mi-10",
      categoryId: "demo-cat-beverages",
      name: "Royal Kesar Pista Lassi",
      description: "Thick chilled churned yogurt with Kashmiri saffron and crushed pistachios",
      price: 140.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-11",
      categoryId: "demo-cat-beverages",
      name: "Gulab Jamun Flambé",
      description: "Golden fried milk dumplings soaked in rose syrup and green cardamom",
      price: 160.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    },
    {
      id: "demo-mi-12",
      categoryId: "demo-cat-beverages",
      name: "Cold Brew Masala Chai",
      description: "Artisanal spiced Assam black tea brew served chilled over clear ice",
      price: 120.00,
      dietaryType: "VEG",
      isAvailable: true,
      isActive: true
    }
  ];

  for (const item of items) {
    const itemRecord = {
      id: item.id,
      restaurantId,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      dietaryType: item.dietaryType,
      isAvailable: item.isAvailable,
      isActive: item.isActive
    };
    if (isPostgresConfigured()) {
      await restaurantRepository.createMenuItem(itemRecord);
    }
    restaurantStore.createMenuItem(itemRecord);
    console.log(`✔ Menu item: [${item.dietaryType}] ${item.name} (₹${item.price.toFixed(2)}) [Available: ${item.isAvailable}]`);
  }

  console.log("\n=================================================");
  console.log("DEMO RESTAURANT SEEDED SUCCESSFULLY!");
  console.log("Restaurant ID : demo-restaurant-1");
  console.log("Tables        : 5 tables configured with secure QR tokens");
  console.log("Categories    : 3 categories");
  console.log("Menu Items    : 12 items (8 VEG, 4 NON-VEG, 1 Unavailable)");
  console.log("=================================================");

  if (isPostgresConfigured()) {
    await closePool();
  }
}

if (require.main === module) {
  seedDemoRestaurant().catch(err => {
    console.error("Error seeding demo restaurant:", err);
    process.exit(1);
  });
}

module.exports = { seedDemoRestaurant };
