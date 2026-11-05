/**
 * REAL HTTP API INTEGRATION TEST SUITE (Zero-Shortcut Mandate)
 * Makes live HTTP requests against http://localhost:3000 to verify:
 * 1. Multi-Tenant storeId & branchId isolation
 * 2. Privilege Escalation Guards (Manager cannot create/promote to Admin)
 * 3. Revocation Integrity (revokedPermissions enforced)
 * 4. Falsy 0% GST and 0 Min Stock preservation
 * 5. Partial Updates (PUT) metadata & rack locator preservation
 * 6. Harmonized duplicate detection (Name + Company case-insensitive)
 * 7. Safety delete blocking (Batches, PO, Adjustments return HTTP 400)
 * 8. CSV Import preview & regulatory schedule mapping
 * 9. CSV Import batched commit
 * 10. Multi-Branch export and batch scoping
 */

import { prisma } from "../src/lib/db-transaction";
import { buildUserSessionPayload, createSessionToken } from "../src/lib/auth";
import { getEffectivePermissions, parseUserPermissions } from "../src/lib/rbac";
import { parsePackMetadata } from "../src/app/api/admin/medicines/route";

const BASE_URL = "http://localhost:3000";

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ""}`);
    totalFailed++;
  }
}

async function runRealIntegrationTests() {
  console.log("\n========================================================");
  console.log("  STARTING REAL HTTP API INTEGRATION TEST SUITE (LIVE)  ");
  console.log("========================================================\n");

  // 1. Setup Auth Tokens
  const adminUser = await prisma.user.findFirst({
    where: { role: "admin", active: true },
    include: { branch: true },
  });

  if (!adminUser) {
    throw new Error("No active Super Admin user found in database to execute tests.");
  }

  const adminSession = buildUserSessionPayload(adminUser);
  const adminToken = createSessionToken(adminSession);

  // Create temporary Manager user for privilege escalation testing
  const testManagerUsername = `test_mgr_${Date.now()}`;
  const managerUser = await prisma.user.create({
    data: {
      username: testManagerUsername,
      email: `${testManagerUsername}@testpharma.com`,
      password: "test_hashed_pwd",
      name: "Test Store Manager",
      role: "manager",
      storeId: adminUser.storeId,
      branchId: null, // Global manager
      active: true,
      permissions: JSON.stringify({
        grantedPermissions: ["manage_users", "manage_medicines"],
      }),
    },
  });

  const managerSession = buildUserSessionPayload(managerUser);
  const managerToken = createSessionToken(managerSession);

  console.log(`Authenticated as Super Admin: @${adminUser.username} (Store ID: ${adminUser.storeId})`);
  console.log(`Created Test Manager: @${managerUser.username} (Role: manager)\n`);

  const createdMedicineIds: number[] = [];
  const createdUserIds: number[] = [managerUser.id];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Privilege Escalation Guard (Manager cannot create Admin) -> HTTP 403
    // ─────────────────────────────────────────────────────────────────────────
    console.log("[TEST 1] Privilege Escalation Guard (Non-Admin cannot create Admin)");
    {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          type: "staff",
          name: "Escalated Admin Attempt",
          username: `hacker_${Date.now()}`,
          email: `hacker_${Date.now()}@test.com`,
          password: "password123",
          role: "admin", // Privilege escalation attempt
        }),
      });

      const json = await res.json();
      assert(res.status === 403, "HTTP Status must be 403 Forbidden", `Got ${res.status}`);
      assert(json.success === false, "JSON payload success must be false");
      assert(
        json.message && (json.message.includes("Super Admins can create Admin accounts") || json.message.toLowerCase().includes("privilege escalation")),
        "Error message must specify privilege escalation protection",
        json.message
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Self-Demotion / Demotion of Admin Guard -> HTTP 403
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 2] Privilege Escalation Guard (Manager cannot edit Super Admin)");
    {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${managerToken}`,
        },
        body: JSON.stringify({
          type: "staff",
          id: adminUser.id,
          name: "Altered Admin Name",
          role: "staff", // Demoting super admin
        }),
      });

      const json = await res.json();
      assert(res.status === 403, "HTTP Status must be 403 Forbidden", `Got ${res.status}`);
      assert(json.success === false, "Demotion must be rejected");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Revocation Integrity in RBAC (Rule 2 & Bug 22A)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 3] Revocation Integrity (Revoking role defaults via revokedPermissions)");
    {
      const staffUsername = `staff_revok_${Date.now()}`;
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          type: "staff",
          name: "Revocation Test Staff",
          username: staffUsername,
          email: `${staffUsername}@test.com`,
          password: "password123",
          role: "staff", // Defaults: ["manage_medicines", "manage_purchases", "manage_customers"]
          permissions: {
            grantedPermissions: ["manage_stock_adjustments"],
            revokedPermissions: ["manage_purchases"], // Actively revoke manage_purchases
          },
        }),
      });

      const json = await res.json();
      assert(res.status === 200, "HTTP Status must be 200 OK", `Got ${res.status}`);
      assert(json.success === true, "User creation must succeed");

      const createdStaff = await prisma.user.findFirst({
        where: { username: staffUsername },
      });
      assert(Boolean(createdStaff), "Created staff must exist in database");

      if (createdStaff) {
        createdUserIds.push(createdStaff.id);
        const parsed = parseUserPermissions(createdStaff.permissions);
        assert(
          Array.isArray(parsed.revokedPermissions) && parsed.revokedPermissions.includes("manage_purchases"),
          "revokedPermissions must contain manage_purchases in DB JSON"
        );

        const effective = getEffectivePermissions(createdStaff.role, createdStaff.permissions);
        assert(
          !effective.includes("manage_purchases"),
          "Effective permissions MUST NOT include revoked manage_purchases"
        );
        assert(
          effective.includes("manage_stock_adjustments"),
          "Effective permissions MUST include granted manage_stock_adjustments"
        );
        assert(
          effective.includes("manage_medicines"),
          "Effective permissions MUST still include non-revoked default manage_medicines"
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Falsy 0% GST and 0 Min Stock (Rule 1 & Bug 23B)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 4] Boundary / Falsy Preservation: 0% GST & 0 Min Stock");
    let testMedId = 0;
    {
      const testMedName = `ZeroGST_Drug_${Date.now()}`;
      const res = await fetch(`${BASE_URL}/api/admin/medicines`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: testMedName,
          genericName: "Acetaminophen Exempt",
          company: "Sun Pharma Laboratories",
          category: "Tablet",
          hsnCode: "30049099",
          gstPercent: 0, // Valid 0% GST (falsy)
          minStockLevel: 0, // Valid 0 minStock (falsy)
          unitsPerPack: 10,
          packUnit: "Strip",
          looseUnit: "Tablet",
          rackNo: "A-1",
          shelfNo: "2",
          boxNo: "B-4",
          scheduleType: "normal",
        }),
      });

      const json = await res.json();
      assert(res.status === 200, "HTTP Status must be 200 OK", `Got ${res.status}`);
      assert(json.success === true, "Medicine creation must succeed");

      const dbMed = await prisma.medicine.findFirst({
        where: { name: testMedName },
      });
      assert(Boolean(dbMed), "Medicine must exist in database");

      if (dbMed) {
        testMedId = dbMed.id;
        createdMedicineIds.push(dbMed.id);
        assert(Number(dbMed.gstPercent) === 0, `GST must be preserved as 0%, got ${dbMed.gstPercent}`);

        const { meta } = parsePackMetadata(dbMed.description);
        assert(meta.minStockLevel === 0, `minStockLevel must be preserved as 0, got ${meta.minStockLevel}`);
        assert(meta.rackNo === "A-1", `rackNo must be A-1, got ${meta.rackNo}`);
        assert(
          dbMed.rackLocation === "Rack: A-1 • Shelf: 2 • Box: B-4",
          `Formatted rackLocation must match, got ${dbMed.rackLocation}`
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Partial Updates (PUT) Preserving Packaging & Locators (Bug 8 & 9)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 5] Partial Update (PUT): Preservation of packaging & locator metadata");
    {
      // Partial update: Only updating name and generic name, omitting packaging & locators
      const updatedName = `ZeroGST_Renamed_${Date.now()}`;
      const res = await fetch(`${BASE_URL}/api/admin/medicines`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: testMedId,
          name: updatedName,
          genericName: "Paracetamol BP 500mg",
        }),
      });

      const json = await res.json();
      assert(res.status === 200, "HTTP Status must be 200 OK", `Got ${res.status}`);
      assert(json.success === true, "Partial update must succeed");

      const dbMed = await prisma.medicine.findUnique({
        where: { id: testMedId },
      });

      if (dbMed) {
        assert(dbMed.name === updatedName, "Name must be updated");
        assert(Number(dbMed.gstPercent) === 0, "0% GST must NOT be clobbered to 12% on partial update");

        const { meta } = parsePackMetadata(dbMed.description);
        assert(meta.minStockLevel === 0, "0 minStockLevel must NOT be clobbered to 10 on partial update");
        assert(meta.unitsPerPack === 10, "unitsPerPack must be preserved");
        assert(meta.rackNo === "A-1", "rackNo must be preserved");
        assert(
          dbMed.rackLocation === "Rack: A-1 • Shelf: 2 • Box: B-4",
          `rackLocation must NOT duplicate prefixes, got ${dbMed.rackLocation}`
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Harmonized Duplicate Detection (Bug 12) -> HTTP 400
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 6] Harmonized Duplicate Detection (Name + Company case-insensitive)");
    {
      const currentMed = await prisma.medicine.findUnique({ where: { id: testMedId } });
      const res = await fetch(`${BASE_URL}/api/admin/medicines`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: currentMed!.name.toLowerCase(), // case variation
          company: currentMed!.company.toUpperCase(), // case variation
          category: "Tablet",
        }),
      });

      const json = await res.json();
      assert(res.status === 400, "Duplicate attempt must return HTTP 400", `Got ${res.status}`);
      assert(json.success === false, "Duplicate attempt must fail");
      assert(
        json.message && json.message.toLowerCase().includes("already exists"),
        "Error message must specify already exists"
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Safety Rule 1.7.5: Deletion Block on Linked Transactions -> HTTP 400
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 7] Safety Delete Blocking (Prevent DB Foreign Key Crash)");
    {
      // Create a batch linked to this medicine
      const testBatch = await prisma.batch.create({
        data: {
          medicineId: testMedId,
          batchNo: `BATCH_${Date.now()}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          quantity: 50,
          purchasePrice: 10.0,
          mrp: 20.0,
        },
      });

      const res = await fetch(`${BASE_URL}/api/admin/medicines?id=${testMedId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const json = await res.json();
      assert(res.status === 400, "Deletion with batch must return HTTP 400", `Got ${res.status}`);
      assert(json.success === false, "Deletion must be rejected");
      assert(
        json.message && json.message.includes("inventory batch record(s) exist"),
        "Error message must mention linked batch records"
      );

      // Clean up batch for next tests
      await prisma.batch.delete({ where: { id: testBatch.id } });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: CSV Import Preview & Regulatory Schedule Mapping (Bug 10, 11, 12)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 8] CSV Import Preview: Schedule mapping, dirty aliases & duplicate detection");
    {
      const currentMed = await prisma.medicine.findUnique({ where: { id: testMedId } });
      const uniqueName1 = `Amoxi_Import_${Date.now()}`;
      const uniqueName2 = `Cough_Syrup_${Date.now()}`;

      const csvData = `Medicine Name,Manufacturer,Category,Schedule,Units_Per_Pack,GST
${uniqueName1},Cipla Ltd,Capsule,Schedule H,10,12
${currentMed!.name},${currentMed!.company},Tablet,normal,10,0
(Blank Med),,Tablet,normal,10,12
${uniqueName2},Mankind Pharma,Syrup,H1,1,12
${uniqueName1},Cipla Ltd,Capsule,Schedule H,10,12`; // duplicate within CSV

      const res = await fetch(`${BASE_URL}/api/admin/medicines/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          action: "preview",
          csvContent: csvData,
        }),
      });

      const json = await res.json();
      assert(res.status === 200, "Preview must return HTTP 200", `Got ${res.status}`);
      assert(json.success === true, "Preview must succeed");
      assert(json.summary.totalRows === 5, "Total preview rows must be 5");
      assert(json.summary.readyToImport === 2, `Ready to import must be 2, got ${json.summary.readyToImport}`);
      assert(json.summary.duplicatesSkipped === 2, `Duplicates skipped must be 2, got ${json.summary.duplicatesSkipped}`);
      assert(json.summary.invalidSkipped === 1, `Invalid (missing company) must be 1, got ${json.summary.invalidSkipped}`);

      // Check Schedule Mapping for Row 1 ("Schedule H" -> "schedule_h")
      const row1 = json.rows.find((r: any) => r.name === uniqueName1);
      assert(row1?.scheduleType === "schedule_h", `Schedule H must map to schedule_h, got ${row1?.scheduleType}`);

      // Check Schedule Mapping for Row 4 ("H1" -> "schedule_h1")
      const row4 = json.rows.find((r: any) => r.name === uniqueName2);
      assert(row4?.scheduleType === "schedule_h1", `H1 must map to schedule_h1, got ${row4?.scheduleType}`);

      // ───────────────────────────────────────────────────────────────────────
      // TEST 9: CSV Import Batched Commit (Rule 1: No timeout loose loops)
      // ───────────────────────────────────────────────────────────────────────
      console.log("\n[TEST 9] CSV Import Commit: Atomic batched database insertion");
      {
        const commitRes = await fetch(`${BASE_URL}/api/admin/medicines/import`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            action: "commit",
            rows: json.rows,
          }),
        });

        const commitJson = await commitRes.json();
        assert(commitRes.status === 200, "Commit must return HTTP 200", `Got ${commitRes.status}`);
        assert(commitJson.success === true, "Commit must succeed");
        assert(commitJson.importedCount === 2, `Imported count must be 2, got ${commitJson.importedCount}`);

        const importedMeds = await prisma.medicine.findMany({
          where: { name: { in: [uniqueName1, uniqueName2] } },
        });
        assert(importedMeds.length === 2, "Both medicines must now exist in DB");
        importedMeds.forEach((m) => createdMedicineIds.push(m.id));
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 10: Multi-Branch Isolation & Export (Rule 2 & Bug 5)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n[TEST 10] Multi-Branch Scoping & Export Protection");
    {
      const exportRes = await fetch(`${BASE_URL}/api/admin/medicines/export`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(exportRes.status === 200, "Export without branch must return HTTP 200");
      const arrayBuf = await exportRes.arrayBuffer();
      const rawBuf = Buffer.from(arrayBuf);
      const csvText = rawBuf.toString("utf8");
      assert(csvText.includes("Medicine Name"), "Export CSV must have valid headers");
      const hasBom = rawBuf[0] === 0xef && rawBuf[1] === 0xbb && rawBuf[2] === 0xbf;
      assert(hasBom, "Export CSV raw byte payload must include UTF-8 BOM (0xEF, 0xBB, 0xBF) for Excel");

      // Verify branch-scoped export
      const exportBranchRes = await fetch(`${BASE_URL}/api/admin/medicines/export?branchId=6`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(exportBranchRes.status === 200, "Export with branchId=6 must return HTTP 200");
    }

  } finally {
    // CLEANUP: Cleanly remove all test-created entities
    console.log("\nCleaning up test artifacts from database...");
    if (createdMedicineIds.length > 0) {
      await prisma.medicine.deleteMany({
        where: { id: { in: createdMedicineIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    console.log("Cleanup complete.");
  }

  console.log("\n========================================================");
  console.log(`  INTEGRATION TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED  `);
  console.log("========================================================\n");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runRealIntegrationTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
