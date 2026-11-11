import { prisma } from "../src/lib/db-transaction";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { encodeCode128B, generateBarcodeSvg } from "../src/lib/barcode";
import * as barcodeRoute from "../src/app/api/admin/pos/barcode/route";
import * as discountsRoute from "../src/app/api/admin/discounts/route";
import * as singleDiscountRoute from "../src/app/api/admin/discounts/[id]/route";
import * as managerOverrideRoute from "../src/app/api/admin/pos/manager-override/route";
import * as posRoute from "../src/app/api/admin/pos/route";
import { NextRequest } from "next/server";

let testPassed = 0;
let testFailed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✔ [PASS] ${testName}`);
    testPassed++;
  } else {
    console.error(`  ✖ [FAIL] ${testName}`);
    if (details) console.error("    Details:", details);
    testFailed++;
  }
}

function createReq(
  url: string,
  token?: string,
  method = "GET",
  body?: any
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers["cookie"] = `med_pos_admin_session=${token}`;
  }

  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log("================================================================================");
  console.log("INTEGRATION TEST SUITE: MODULE 2.3 & MODULE 2.4");
  console.log("Barcode Scanning, Label Printing, Configurable Discounts & Manager Overrides");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const currentStore = await prisma.settings.findFirst();
  const storeId = currentStore?.id || 1;

  // 1. Setup Test Store Branches
  const branchMain = await prisma.branch.create({
    data: {
      storeId,
      code: `BR-M23-${runId}`,
      name: `M23 Main Pharmacy-${runId}`,
      address: "123 Health Ave, Kolkata",
      phone: `98765${runId.toString().slice(0, 5)}`,
      email: `m23-main-${runId}@drxstore.com`,
      isMain: true,
      active: true,
    },
  });

  const branchOther = await prisma.branch.create({
    data: {
      storeId,
      code: `BR-OTH-${runId}`,
      name: `M23 Other Pharmacy-${runId}`,
      address: "456 North St, Kolkata",
      phone: `98766${runId.toString().slice(0, 5)}`,
      email: `m23-other-${runId}@drxstore.com`,
      isMain: false,
      active: true,
    },
  });

  // 2. Setup Test Users: Admin, Manager, and Cashier
  const passwordHash = await hashPassword("SecurePass@123");

  const adminUser = await prisma.user.create({
    data: {
      storeId,
      name: `Super Admin-${runId}`,
      username: `admin_${runId}`,
      email: `admin_${runId}@drxstore.com`,
      password: passwordHash,
      role: "admin",
      branchId: null,
      active: true,
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      storeId,
      name: `Store Manager-${runId}`,
      username: `manager_${runId}`,
      email: `manager_${runId}@drxstore.com`,
      password: passwordHash,
      role: "manager",
      branchId: branchMain.id,
      active: true,
    },
  });

  const cashierUser = await prisma.user.create({
    data: {
      storeId,
      name: `Counter Cashier-${runId}`,
      username: `cashier_${runId}`,
      email: `cashier_${runId}@drxstore.com`,
      password: passwordHash,
      role: "cashier",
      branchId: branchMain.id,
      active: true,
    },
  });

  // Create HMAC session tokens
  const adminToken = createSessionToken({
    userId: adminUser.id,
    storeId,
    username: adminUser.username,
    name: adminUser.name,
    email: adminUser.email,
    role: "admin",
    branchId: null,
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 100,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const managerToken = createSessionToken({
    userId: managerUser.id,
    storeId,
    username: managerUser.username,
    name: managerUser.name,
    email: managerUser.email,
    role: "manager",
    branchId: branchMain.id,
    permissions: ["apply_high_discount"],
    allowedPages: [],
    maxDiscountPercent: 50,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const cashierToken = createSessionToken({
    userId: cashierUser.id,
    storeId,
    username: cashierUser.username,
    name: cashierUser.name,
    email: cashierUser.email,
    role: "cashier",
    branchId: branchMain.id,
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 10,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  // 3. Setup Test Medicines & Batches with Barcodes
  const barcodeHsn = `890${runId}`;
  const batchCode1 = `BAT-BC1-${runId}`;
  const batchCode2 = `BAT-BC2-${runId}`;
  const batchCodeZeroStock = `BAT-ZERO-${runId}`;

  const med1 = await prisma.medicine.create({
    data: {
      name: `Cefixime 200mg-${runId}`,
      genericName: "Cefixime Trihydrate 200mg",
      company: "Alkem Laboratories",
      category: "Tablet",
      hsnCode: barcodeHsn,
      gstPercent: 12.0,
      rackLocation: "Rack: C-01 / Shelf: 2",
      scheduleType: "schedule_h",
    },
  });

  const expNear = new Date();
  expNear.setDate(expNear.getDate() + 45); // expires in 45 days

  const expFar = new Date();
  expFar.setDate(expFar.getDate() + 365); // expires in 1 year

  const batch1 = await prisma.batch.create({
    data: {
      medicineId: med1.id,
      batchNo: batchCode1,
      expiryDate: expNear,
      quantity: 50,
      purchasePrice: 65.0,
      mrp: 110.0,
      branchId: branchMain.id,
    },
  });

  const batch2 = await prisma.batch.create({
    data: {
      medicineId: med1.id,
      batchNo: batchCode2,
      expiryDate: expFar,
      quantity: 100,
      purchasePrice: 68.0,
      mrp: 115.0,
      branchId: branchMain.id,
    },
  });

  const batchZero = await prisma.batch.create({
    data: {
      medicineId: med1.id,
      batchNo: batchCodeZeroStock,
      expiryDate: expFar,
      quantity: 0,
      purchasePrice: 70.0,
      mrp: 120.0,
      branchId: branchMain.id,
    },
  });

  console.log("\n--- TEST GROUP 1: MODULE 2.3 (BARCODE SCANNING & LABEL GENERATION) ---");

  // Test 1: Direct Barcode Lookup by Batch Number
  const scanBatchRes = await barcodeRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/barcode?code=${batchCode1}&branchId=${branchMain.id}`, cashierToken)
  );
  const scanBatchJson = await scanBatchRes.json();
  assert(scanBatchRes.status === 200 && scanBatchJson.success, "2.3.1: Scanned batch number resolved successfully");
  assert(scanBatchJson.batch.batchNo === batchCode1, "2.3.1: Matched exact batch number");
  assert(scanBatchJson.medicine.name === med1.name, "2.3.1: Resolved parent medicine correctly");
  assert(scanBatchJson.availableStock === 50, "2.3.1: Returns accurate available batch stock");

  // Test 2: Barcode Lookup by Medicine HSN Code (Auto-Suggests Earliest FEFO Batch)
  const scanHsnRes = await barcodeRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/barcode?code=${barcodeHsn}&branchId=${branchMain.id}`, cashierToken)
  );
  const scanHsnJson = await scanHsnRes.json();
  assert(scanHsnRes.status === 200 && scanHsnJson.success, "2.3.1: Scanned medicine HSN code resolved successfully");
  assert(scanHsnJson.batch.id === batch1.id, "2.3.1: Auto-suggests earliest unexpired batch (FEFO priority)");
  assert(scanHsnJson.availableStock === 150, "2.3.1: Calculates total branch stock across batches");

  // Test 3: Out-of-Stock Batch Scan Must Return Friendly Warning
  const scanZeroRes = await barcodeRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/barcode?code=${batchCodeZeroStock}&branchId=${branchMain.id}`, cashierToken)
  );
  const scanZeroJson = await scanZeroRes.json();
  assert(scanZeroRes.status === 400 && scanZeroJson.availableStock === 0, "2.3.1: Out-of-stock batch scan is safely flagged");

  // Test 4: Unknown Barcode Returns 404
  const scanUnknownRes = await barcodeRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/barcode?code=NONEXISTENT_999999&branchId=${branchMain.id}`, cashierToken)
  );
  assert(scanUnknownRes.status === 404, "2.3.1: Unrecognized barcode returns 404 Not Found");

  // Test 5: Cross-Branch Unauthorized Barcode Lookup Blocked (403)
  const scanCrossBranchRes = await barcodeRoute.GET(
    createReq(`http://localhost:3000/api/admin/pos/barcode?code=${batchCode1}&branchId=${branchOther.id}`, cashierToken)
  );
  assert(scanCrossBranchRes.status === 403, "2.3.1: Cashier scanning on unauthorized branch is rejected (403)");

  // Test 6: Code 128 Binary Pattern Encoding
  const binaryBars = encodeCode128B(`BAT-${runId}`);
  assert(typeof binaryBars === "string" && binaryBars.length > 50, "2.3.2: Code 128 encodes text into binary module stream");

  // Test 7: Zero-Dependency Vector SVG Barcode Generation
  const svgBarcode = generateBarcodeSvg(batchCode1, { width: 240, height: 60 });
  assert(svgBarcode.startsWith("<svg") && svgBarcode.includes("</svg>"), "2.3.2: SVG vector barcode successfully generated");
  assert(svgBarcode.includes(batchCode1), "2.3.2: Barcode SVG includes human-readable batch label");

  console.log("\n--- TEST GROUP 2: MODULE 2.4.1 (CONFIGURABLE DISCOUNT ARCHITECTURE) ---");

  // Test 8: Cashier Forbidden from Creating Master Discount Policy
  const cashierCreateDiscountRes = await discountsRoute.POST(
    createReq("http://localhost:3000/api/admin/discounts", cashierToken, "POST", {
      name: `Unauthorized Discount-${runId}`,
      type: "percent",
      value: 15,
    })
  );
  assert(cashierCreateDiscountRes.status === 403, "2.4.1: Cashier role blocked from creating master discount policies (403)");

  // Test 9: Admin Creates Master Percentage Discount Policy
  const createSeniorDiscRes = await discountsRoute.POST(
    createReq("http://localhost:3000/api/admin/discounts", adminToken, "POST", {
      name: `Senior Citizen 15%-${runId}`,
      type: "percent",
      value: 15.0,
      minAmount: 100.0,
      active: true,
    })
  );
  const createSeniorDiscJson = await createSeniorDiscRes.json();
  assert(createSeniorDiscRes.status === 200 && createSeniorDiscJson.success, "2.4.1: Admin successfully creates Senior Citizen % discount");
  const seniorDiscId = createSeniorDiscJson.discount.id;

  // Test 10: Admin Creates Master Flat Currency Discount Policy
  const createFlatDiscRes = await discountsRoute.POST(
    createReq("http://localhost:3000/api/admin/discounts", adminToken, "POST", {
      name: `Festive Flat ₹50 Off-${runId}`,
      type: "flat",
      value: 50.0,
      minAmount: 500.0,
      active: true,
    })
  );
  const createFlatDiscJson = await createFlatDiscRes.json();
  assert(createFlatDiscRes.status === 200 && createFlatDiscJson.success, "2.4.1: Admin successfully creates Flat ₹ discount policy");
  const flatDiscId = createFlatDiscJson.discount.id;

  // Test 11: Invalid Percentage (> 100%) Rejected
  const invalidDiscRes = await discountsRoute.POST(
    createReq("http://localhost:3000/api/admin/discounts", adminToken, "POST", {
      name: "Excessive 150% Discount",
      type: "percent",
      value: 150.0,
    })
  );
  assert(invalidDiscRes.status === 400, "2.4.1: Discount percentage > 100% is strictly rejected (400)");

  // Test 12: List Active Discounts
  const listDiscountsRes = await discountsRoute.GET(
    createReq("http://localhost:3000/api/admin/discounts?active=true", cashierToken)
  );
  const listDiscountsJson = await listDiscountsRes.json();
  assert(listDiscountsRes.status === 200 && listDiscountsJson.discounts.some((d: any) => d.id === seniorDiscId), "2.4.1: Active discount policies listed for POS terminal");

  // Test 13: Update Discount Policy Parameters
  const updateDiscRes = await singleDiscountRoute.PUT(
    createReq(`http://localhost:3000/api/admin/discounts/${seniorDiscId}`, adminToken, "PUT", {
      minAmount: 150.0,
    }),
    { params: Promise.resolve({ id: String(seniorDiscId) }) }
  );
  const updateDiscJson = await updateDiscRes.json();
  assert(updateDiscRes.status === 200 && updateDiscJson.discount.minAmount === 150.0, "2.4.1: Discount policy updated successfully");

  console.log("\n--- TEST GROUP 3: MODULE 2.4.2 (ITEM-LEVEL & BILL-LEVEL DISCOUNTS & MANAGER OVERRIDES) ---");

  // Test 14: Cashier Applies Item-Level Discount within Allowable Limit (10%)
  const itemDiscSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [
        {
          batchId: batch1.id,
          quantity: 2, // 2 x 110 = 220 gross
          discountPercent: 10,
          discountAmount: 22.0, // 10% discount = 22 off -> Net 198
        },
      ],
      discountAmount: 0,
    })
  );
  const itemDiscSaleJson = await itemDiscSaleRes.json();
  assert(itemDiscSaleRes.status === 200 && itemDiscSaleJson.success, "2.4.2: Item-level discount within cashier limit applied successfully");
  assert(Number(itemDiscSaleJson.sale.grandTotal) === 198.0, "2.4.2: Grand total correctly reflects item discount (220 - 22 = 198)");
  assert(Number(itemDiscSaleJson.sale.discountAmount) === 22.0, "2.4.2: Total discount recorded on sale header");

  // Test 15: Cashier Attempting Item Discount > 10% WITHOUT Manager Approval (Must Fail)
  const unauthHighDiscRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [
        {
          batchId: batch2.id,
          quantity: 2, // 2 x 115 = 230
          discountPercent: 20, // 20% > 10% limit!
          discountAmount: 46.0,
        },
      ],
      discountAmount: 0,
    })
  );
  const unauthHighDiscJson = await unauthHighDiscRes.json();
  assert(
    unauthHighDiscRes.status === 400 &&
      unauthHighDiscJson.error.includes("exceeds cashier limit"),
    "2.4.2: Item discount exceeding cashier limit without manager authorization is strictly blocked"
  );

  // Test 16: Manager Override API - Invalid Password Rejected
  const wrongPassOverrideRes = await managerOverrideRoute.POST(
    createReq("http://localhost:3000/api/admin/pos/manager-override", cashierToken, "POST", {
      usernameOrEmail: managerUser.username,
      password: "WrongPassword999",
      requestedDiscountPercent: 20,
    })
  );
  assert(wrongPassOverrideRes.status === 401, "2.4.2: Manager override with incorrect credentials rejected (401)");

  // Test 17: Manager Override API - Cashier Cannot Self-Authorize High Discount
  const selfOverrideRes = await managerOverrideRoute.POST(
    createReq("http://localhost:3000/api/admin/pos/manager-override", cashierToken, "POST", {
      usernameOrEmail: cashierUser.username,
      password: "SecurePass@123",
      requestedDiscountPercent: 20,
    })
  );
  assert(selfOverrideRes.status === 403, "2.4.2: Cashier attempting to self-authorize manager override is blocked (403)");

  // Test 18: Manager Override API - Valid Manager Credentials Authorize Discount
  const validOverrideRes = await managerOverrideRoute.POST(
    createReq("http://localhost:3000/api/admin/pos/manager-override", cashierToken, "POST", {
      usernameOrEmail: managerUser.username,
      password: "SecurePass@123",
      requestedDiscountPercent: 20,
      reason: "VIP Customer special concession",
      itemDescription: med1.name,
    })
  );
  const validOverrideJson = await validOverrideRes.json();
  assert(validOverrideRes.status === 200 && validOverrideJson.authorized, "2.4.2: Manager credentials successfully authorized high discount");
  assert(validOverrideJson.managerName === managerUser.name, "2.4.2: Authorization returned manager identity");

  // Test 19: Cashier Completes Sale with High Item Discount WITH Manager Authorization
  const authHighDiscSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [
        {
          batchId: batch2.id,
          quantity: 2, // 2 x 115 = 230
          discountPercent: 20,
          discountAmount: 46.0,
          managerApprovedBy: validOverrideJson.managerName,
        },
      ],
      discountAmount: 0,
    })
  );
  const authHighDiscSaleJson = await authHighDiscSaleRes.json();
  assert(authHighDiscSaleRes.status === 200 && authHighDiscSaleJson.success, "2.4.2: High item discount with manager approval succeeds");
  assert(Number(authHighDiscSaleJson.sale.grandTotal) === 184.0, "2.4.2: Grand total is accurate (230 - 46 = 184)");

  // Test 20: Cashier Attempting Bill-Level Discount > 10% Without Approval (Must Fail)
  const unauthBillDiscRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [{ batchId: batch1.id, quantity: 2 }], // 2 x 110 = 220
      discountAmount: 55.0, // 55 / 220 = 25% > 10%!
      discountPercent: 25,
    })
  );
  assert(unauthBillDiscRes.status === 400, "2.4.2: Bill-level discount exceeding cashier limit is blocked without manager approval");

  // Test 21: Bill-Level Discount WITH Manager Approval Succeeds
  const authBillDiscSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", cashierToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [{ batchId: batch1.id, quantity: 2 }], // 2 x 110 = 220
      discountAmount: 55.0, // 220 - 55 = 165
      discountPercent: 25,
      managerApprovedBy: managerUser.name,
    })
  );
  const authBillDiscSaleJson = await authBillDiscSaleRes.json();
  assert(authBillDiscSaleRes.status === 200 && authBillDiscSaleJson.success, "2.4.2: Bill discount with manager approval succeeds");
  assert(Number(authBillDiscSaleJson.sale.grandTotal) === 165.0, "2.4.2: Accurate grand total for approved bill discount (220 - 55 = 165)");

  // Test 22: Combined Item-Level AND Bill-Level Discount
  const combinedDiscSaleRes = await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", managerToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [
        {
          batchId: batch1.id,
          quantity: 1, // 110 - 10 item discount = 100 net
          discountAmount: 10.0,
        },
      ],
      discountAmount: 15.0, // 100 - 15 bill discount = 85 grand total
    })
  );
  const combinedDiscSaleJson = await combinedDiscSaleRes.json();
  assert(combinedDiscSaleRes.status === 200 && combinedDiscSaleJson.success, "2.4.2: Combined item + bill discount transaction succeeds");
  assert(Number(combinedDiscSaleJson.sale.grandTotal) === 85.0, "2.4.2: Grand total correctly combines item & bill discounts (110 - 10 - 15 = 85)");
  assert(Number(combinedDiscSaleJson.sale.discountAmount) === 25.0, "2.4.2: Combined total discount recorded in sale header (10 + 15 = 25)");

  // Test 23: Deleting a Discount Policy in Use Safely Deactivates Instead of Crashing
  // First, associate a sale with flatDiscId
  await posRoute.POST(
    createReq("http://localhost:3000/api/admin/pos", adminToken, "POST", {
      customerId: null,
      paymentMethod: "cash",
      branchId: branchMain.id,
      items: [{ batchId: batch1.id, quantity: 5 }], // 550
      discountAmount: 50.0,
      discountId: flatDiscId,
    })
  );

  const deleteInUseDiscRes = await singleDiscountRoute.DELETE(
    createReq(`http://localhost:3000/api/admin/discounts/${flatDiscId}`, adminToken, "DELETE"),
    { params: Promise.resolve({ id: String(flatDiscId) }) }
  );
  const deleteInUseDiscJson = await deleteInUseDiscRes.json();
  assert(deleteInUseDiscRes.status === 200 && deleteInUseDiscJson.deactivated, "2.4.1: Discount in use by sales is soft-deactivated to preserve accounting history");

  const deactivatedPolicy = await prisma.discount.findUnique({ where: { id: flatDiscId } });
  assert(deactivatedPolicy?.active === false, "2.4.1: Discount policy active status verified as false");

  // Test 24: Unused Discount Policy is Hard-Deleted Cleanly
  const deleteUnusedDiscRes = await singleDiscountRoute.DELETE(
    createReq(`http://localhost:3000/api/admin/discounts/${seniorDiscId}`, adminToken, "DELETE"),
    { params: Promise.resolve({ id: String(seniorDiscId) }) }
  );
  const deleteUnusedDiscJson = await deleteUnusedDiscRes.json();
  assert(deleteUnusedDiscRes.status === 200 && !deleteUnusedDiscJson.deactivated, "2.4.1: Unused discount policy deleted cleanly");

  console.log("\n================================================================================");
  console.log(`FINAL OUTCOME: ${testPassed} Passed | ${testFailed} Failed`);
  console.log("================================================================================");

  if (testFailed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Test execution threw error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

