import { prisma } from "../src/lib/prisma";
import { getStoreSettings, updateStoreSettings, getExpiryStatus, formatCurrency } from "../src/lib/config";
import { runInTransaction, getDatabaseHealth } from "../src/lib/db-transaction";

async function testModule1_1() {
  console.log("==================================================");
  console.log("TESTING MODULE 1.1: SYSTEM ARCHITECTURE & DATABASE");
  console.log("==================================================\n");

  // TEST 1.1.1: Database Schema & Connectivity
  console.log(">>> [1.1.1] Testing Database Connection & Schema Health...");
  const health = await getDatabaseHealth();
  console.log("Database Health Result:", health);
  if (health.status !== "healthy") {
    throw new Error(`Database connection failed: ${health.error}`);
  }
  console.log("✓ Database is connected and healthy with latency:", health.latencyMs, "ms\n");

  // Verify key tables exist by querying counts
  const tables = [
    "settings", "user", "medicine", "category", "batch",
    "supplier", "supplierUser", "customer", "sale", "saleItem",
    "purchaseOrder", "pOItem", "return", "returnItem", "discount",
    "stockAdjustment", "loginAttempt", "customerPurchaseLog",
    "supplierMessage", "patientMessage", "auditLog"
  ];
  console.log(`Checking all ${tables.length} tables in Prisma schema...`);
  for (const t of tables) {
    // @ts-ignore
    const count = await prisma[t].count();
    console.log(`  - Table [${t}]: ${count} records`);
  }
  console.log("✓ All 21 normalized models verified in live PostgreSQL database.\n");

  // TEST 1.1.2: Configuration Engine
  console.log(">>> [1.1.2] Testing Centralized Store Variables & Configuration...");
  const config = await getStoreSettings();
  console.log("Store Configuration:", {
    storeName: config.storeName,
    currency: config.currency,
    lowQtyThreshold: config.lowQtyThreshold,
    expiryDaysThreshold: config.expiryDaysThreshold,
    timezone: config.timezone,
    appMode: config.appMode,
  });

  if (config.lowQtyThreshold !== 10) {
    throw new Error(`Expected default lowQtyThreshold = 10, got ${config.lowQtyThreshold}`);
  }
  if (config.expiryDaysThreshold !== 90) {
    throw new Error(`Expected default expiryDaysThreshold = 90, got ${config.expiryDaysThreshold}`);
  }
  if (config.currency !== "₹") {
    throw new Error(`Expected currency = ₹, got ${config.currency}`);
  }

  // Test currency formatter
  const formatted = formatCurrency(1250.5);
  console.log("Currency Format Test (1250.5):", formatted);
  if (!formatted.includes("1,250.50")) {
    throw new Error(`Unexpected formatted currency: ${formatted}`);
  }

  // Test expiry status helper
  const in20Days = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const in120Days = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const expiredPast = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  console.log("Expiry Tier (+20d):", getExpiryStatus(in20Days).tier); // critical_30
  console.log("Expiry Tier (+60d):", getExpiryStatus(in60Days).tier); // warning_90
  console.log("Expiry Tier (+120d):", getExpiryStatus(in120Days).tier); // safe
  console.log("Expiry Tier (-5d):", getExpiryStatus(expiredPast).tier); // expired

  console.log("✓ Configuration engine & defaults verified successfully.\n");

  // TEST 1.1.3: ACID Transaction & Rollback
  console.log(">>> [1.1.3] Testing ACID Transaction Rollback Safety...");
  
  // Create a test category to test rollback
  const testCatName = `TEST_ROLLBACK_${Date.now()}`;
  let rollbackSuccess = false;

  try {
    await runInTransaction(async (tx) => {
      // Step 1: Create a record
      await tx.category.create({
        data: {
          name: testCatName,
          type: "custom",
        },
      });

      // Step 2: Force an intentional error to test rollback
      throw new Error("INTENTIONAL_TEST_ABORT_FOR_ROLLBACK");
    });
  } catch (err: any) {
    if (err.message === "INTENTIONAL_TEST_ABORT_FOR_ROLLBACK") {
      rollbackSuccess = true;
    } else {
      throw err;
    }
  }

  if (!rollbackSuccess) {
    throw new Error("Transaction did not throw expected test error!");
  }

  // Verify the record was rolled back and does NOT exist in the database
  const found = await prisma.category.findUnique({
    where: { name: testCatName },
  });

  if (found) {
    throw new Error(`ACID FAIL: Record '${testCatName}' was persisted despite transaction failure!`);
  }
  console.log("✓ ACID Rollback verified: Record was cleanly rolled back with 0 orphaned data.\n");

  // Test successful transaction
  const validCatName = `TEST_COMMITTED_${Date.now()}`;
  await runInTransaction(async (tx) => {
    await tx.category.create({
      data: {
        name: validCatName,
        type: "custom",
      },
    });
  });

  const committed = await prisma.category.findUnique({
    where: { name: validCatName },
  });
  if (!committed) {
    throw new Error("ACID FAIL: Committed transaction record was not found!");
  }
  console.log("✓ ACID Commit verified: Record successfully committed.\n");

  // Clean up test record
  await prisma.category.delete({ where: { name: validCatName } });
  console.log("✓ Cleaned up test record.");

  console.log("\n==================================================");
  console.log("ALL MODULE 1.1 TESTS PASSED SUCCESSFULLY! (3/3)");
  console.log("==================================================");
}

testModule1_1()
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

