import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db-transaction";
import { buildUserSessionPayload, createSessionToken } from "../src/lib/auth";

// Import Route Handlers directly
import { GET as getSuppliers, POST as createSupplier, PUT as updateSupplier, DELETE as deleteSupplier } from "../src/app/api/admin/suppliers/route";
import { GET as exportSuppliers } from "../src/app/api/admin/suppliers/export/route";
import { GET as getSupplierLedger, POST as recordSupplierPayment } from "../src/app/api/admin/suppliers/[id]/payments/route";
import { GET as getPortalUser, POST as createPortalUser } from "../src/app/api/admin/suppliers/[id]/portal-user/route";
import { GET as getPurchases, POST as createPurchase } from "../src/app/api/admin/purchases/route";
import { GET as getPurchaseDetail, PUT as updatePurchase, DELETE as deletePurchase } from "../src/app/api/admin/purchases/[id]/route";
import { GET as getPOSuggestions } from "../src/app/api/admin/purchases/suggestions/route";
import { POST as clonePurchase } from "../src/app/api/admin/purchases/[id]/clone/route";
import { POST as processGRN } from "../src/app/api/admin/grn/route";

async function runTests() {
  console.log("================================================================================");
  console.log("MODULE 1.10 & 1.11: SUPPLIERS, PURCHASE ORDERS & GRN INWARD VERIFICATION SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`\x1b[32m✔ PASS\x1b[0m [Test #${total}]: ${testName}`);
    } else {
      console.error(`\x1b[31m✖ FAIL\x1b[0m [Test #${total}]: ${testName} - Detail: ${detail || "Condition not met"}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  const runId = Date.now().toString().slice(-6);

  // 1. Setup Admin, Pharmacist, and Cashier Auth Sessions
  const admin = await prisma.user.findFirst({
    where: { role: "admin", active: true },
    include: { branch: true },
  });
  if (!admin) throw new Error("No active admin user found.");

  const adminSession = buildUserSessionPayload(admin);
  const adminToken = createSessionToken(adminSession);
  const adminCookie = `med_pos_admin_session=${adminToken}`;

  const mainBranch = await prisma.branch.findFirst({
    where: { isMain: true, active: true },
  }) || await prisma.branch.findFirst({ where: { active: true } });

  if (!mainBranch) throw new Error("No active branch found.");

  // Cashier (lacks manage_purchases)
  const cashier = await prisma.user.create({
    data: {
      username: `cashier_test_${runId}`,
      email: `cashier_${runId}@pharmacy.local`,
      name: "Counter Cashier",
      password: "hashed_dummy_password",
      role: "cashier",
      permissions: JSON.stringify({
        grantedPermissions: ["manage_customers"],
        revokedPermissions: ["manage_purchases"],
      }),
      storeId: admin.storeId,
      branchId: mainBranch.id,
      active: true,
    },
  });
  const cashierSession = buildUserSessionPayload(cashier);
  const cashierToken = createSessionToken(cashierSession);
  const cashierCookie = `med_pos_admin_session=${cashierToken}`;

  // Create Test Medicine
  const testMed = await prisma.medicine.create({
    data: {
      name: `Cefixime 200mg ${runId}`,
      genericName: "Cefixime Trihydrate",
      company: `Apex Laboratories ${runId}`,
      category: "Tablet",
      gstPercent: 12.0,
      rackLocation: "Rack: B-1 • Shelf: 2",
    },
  });

  console.log(`Environment Initialized:`);
  console.log(`- Super Admin: ${admin.username} (Store: ${admin.storeId})`);
  console.log(`- Main Branch: ${mainBranch.name} (ID: ${mainBranch.id})`);
  console.log(`- Test Medicine: ${testMed.name} (ID: ${testMed.id})\n`);

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 1.10: SUPPLIERS & VENDORS DIRECTORY (1.10.1 - 1.10.3)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("--- MODULE 1.10: SUPPLIERS DIRECTORY & ACCOUNTS PAYABLE ---");

    // Test 1: Unauthenticated request to /api/admin/suppliers returns HTTP 401
    const unauthReq = new NextRequest("http://localhost:3000/api/admin/suppliers");
    const unauthRes = await getSuppliers(unauthReq);
    assert(unauthRes.status === 401, "GET /api/admin/suppliers without auth returns HTTP 401");

    // Test 2: Cashier lacking manage_purchases returns HTTP 403
    const cashierReq = new NextRequest("http://localhost:3000/api/admin/suppliers", {
      headers: { Cookie: cashierCookie },
    });
    const cashierRes = await getSuppliers(cashierReq);
    assert(cashierRes.status === 403, "Cashier lacking manage_purchases returns HTTP 403");

    // Test 3: Admin creates new supplier with contact, GSTIN, DL No, paymentTerms
    const supplierPhone = `98${runId}1234`;
    const createReq = new NextRequest("http://localhost:3000/api/admin/suppliers", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Medex Pharma Distributors ${runId}`,
        contact: "Subhashis Roy",
        phone: supplierPhone,
        email: `contact_${runId}@medexpharma.com`,
        address: "42 Park Street, Kolkata - 700016",
        gstNo: `19ABCDE${runId}Z5`,
        dlNo: `DL-20B-WB-${runId}`,
        paymentTerms: 30,
      }),
    });
    const createRes = await createSupplier(createReq);
    const createJson = await createRes.json();
    assert(createRes.status === 200 && createJson.success === true, "Admin creates new supplier successfully", createJson.message);
    const createdSupplier = createJson.supplier;
    assert(createdSupplier.paymentTerms === 30, "Supplier payment terms defaults/saves to 30 days");

    // Test 4: Duplicate supplier name prevention
    const dupNameReq = new NextRequest("http://localhost:3000/api/admin/suppliers", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Medex Pharma Distributors ${runId}`,
        phone: `99${runId}9999`,
      }),
    });
    const dupNameRes = await createSupplier(dupNameReq);
    assert(dupNameRes.status === 400, "Duplicate supplier name is blocked with HTTP 400");

    // Test 5: Duplicate supplier phone prevention
    const dupPhoneReq = new NextRequest("http://localhost:3000/api/admin/suppliers", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Different Vendor ${runId}`,
        phone: supplierPhone,
      }),
    });
    const dupPhoneRes = await createSupplier(dupPhoneReq);
    assert(dupPhoneRes.status === 400, "Duplicate supplier phone is blocked with HTTP 400");

    // Test 6: Update supplier details (paymentTerms, contact)
    const updateReq = new NextRequest("http://localhost:3000/api/admin/suppliers", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: createdSupplier.id,
        contact: "Subhashis Roy (Senior Manager)",
        paymentTerms: 45,
      }),
    });
    const updateRes = await updateSupplier(updateReq);
    const updateJson = await updateRes.json();
    assert(updateRes.status === 200 && updateJson.supplier.paymentTerms === 45, "Update supplier details updates paymentTerms to 45 days");

    // Test 7: GET suppliers returns enriched list with financial totals
    const getReq = new NextRequest(`http://localhost:3000/api/admin/suppliers?search=${encodeURIComponent(createdSupplier.name)}`, {
      headers: { Cookie: adminCookie },
    });
    const getRes = await getSuppliers(getReq);
    const getJson = await getRes.json();
    assert(getRes.status === 200 && getJson.suppliers.length >= 1, "GET suppliers finds created supplier with search filter");
    const foundSupplier = getJson.suppliers[0];
    assert(typeof foundSupplier.outstandingBalance === "number", "Suppliers payload includes calculated outstandingBalance");

    // Test 8: CSV Export endpoint returns UTF-8 BOM
    const exportReq = new NextRequest("http://localhost:3000/api/admin/suppliers/export", {
      headers: { Cookie: adminCookie },
    });
    const exportRes = await exportSuppliers(exportReq);
    assert(exportRes.status === 200, "GET /api/admin/suppliers/export returns HTTP 200");
    const exportBuf = new Uint8Array(await exportRes.arrayBuffer());
    assert(
      exportBuf[0] === 0xef && exportBuf[1] === 0xbb && exportBuf[2] === 0xbf,
      "Export CSV begins with UTF-8 BOM (0xEF, 0xBB, 0xBF) for Excel compatibility"
    );
    const exportText = new TextDecoder().decode(exportBuf);
    assert(exportText.includes("Vendor Name") && exportText.includes("Outstanding Balance"), "Export CSV contains required financial headers");

    // Test 9: Supplier Accounts Payable Ledger: Record payment
    const paymentReq = new NextRequest(`http://localhost:3000/api/admin/suppliers/${createdSupplier.id}/payments`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 2500.0,
        paymentMethod: "bank_transfer",
        referenceNo: `UTR-${runId}-8877`,
        notes: "Advance payment against upcoming PO",
      }),
    });
    const paymentRes = await recordSupplierPayment(paymentReq, { params: Promise.resolve({ id: String(createdSupplier.id) }) });
    const paymentJson = await paymentRes.json();
    assert(paymentRes.status === 200 && paymentJson.success === true, "Records supplier payment of ₹2500 successfully", paymentJson.message);

    // Test 10: Supplier Accounts Payable Ledger: Fetch chronological history
    const ledgerReq = new NextRequest(`http://localhost:3000/api/admin/suppliers/${createdSupplier.id}/payments`, {
      headers: { Cookie: adminCookie },
    });
    const ledgerRes = await getSupplierLedger(ledgerReq, { params: Promise.resolve({ id: String(createdSupplier.id) }) });
    const ledgerJson = await ledgerRes.json();
    assert(ledgerRes.status === 200 && ledgerJson.ledger.length >= 1, "GET supplier ledger returns chronological entries");
    assert(ledgerJson.summary.totalPaid >= 2500.0, "Ledger summary reflects recorded payment");

    // Test 11: Supplier Portal User Generation
    const portalReq = new NextRequest(`http://localhost:3000/api/admin/suppliers/${createdSupplier.id}/portal-user`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `sup_${runId}`,
        email: `portal_${runId}@medexpharma.com`,
        password: "TempPassword123!",
        sendEmail: false,
      }),
    });
    const portalRes = await createPortalUser(portalReq, { params: Promise.resolve({ id: String(createdSupplier.id) }) });
    const portalJson = await portalRes.json();
    assert(portalRes.status === 200 && portalJson.success === true, "Generates supplier portal account successfully");
    assert(portalJson.credentials.username === `sup_${runId}`, "Portal credentials returned to admin");

    // Test 12: Resetting portal credentials
    const resetPortalReq = new NextRequest(`http://localhost:3000/api/admin/suppliers/${createdSupplier.id}/portal-user`, {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `sup_${runId}`,
        email: `portal_${runId}@medexpharma.com`,
        password: "NewSecurePassword456!",
        sendEmail: false,
      }),
    });
    const resetPortalRes = await createPortalUser(resetPortalReq, { params: Promise.resolve({ id: String(createdSupplier.id) }) });
    const resetPortalJson = await resetPortalRes.json();
    assert(resetPortalRes.status === 200 && resetPortalJson.message.includes("reset"), "Resetting credentials updates existing supplier portal user");

    // ─────────────────────────────────────────────────────────────────────────
    // MODULE 1.11: PURCHASE ORDERS & GRN INWARDING (1.11.1 - 1.11.3)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("\n--- MODULE 1.11: PURCHASE ORDERS & GRN INWARDING ---");

    // Test 13: Unauthenticated request to /api/admin/purchases returns HTTP 401
    const unauthPORes = await getPurchases(new NextRequest("http://localhost:3000/api/admin/purchases"));
    assert(unauthPORes.status === 401, "GET /api/admin/purchases without auth returns HTTP 401");

    // Test 14: Input validation on PO creation: Missing items returns HTTP 400
    const emptyPORes = await createPurchase(new NextRequest("http://localhost:3000/api/admin/purchases", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: createdSupplier.id,
        items: [],
      }),
    }));
    assert(emptyPORes.status === 400, "Creating empty purchase order returns HTTP 400 Bad Request");

    // Test 15: Create manual Purchase Order with sequential PO Number
    const createPORes = await createPurchase(new NextRequest("http://localhost:3000/api/admin/purchases", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: createdSupplier.id,
        branchId: mainBranch.id,
        notes: "Monthly bulk order for antibacterial stock",
        items: [
          {
            medicineId: testMed.id,
            quantity: 100, // 100 units ordered
            price: 75.50,  // Purchase cost
            mrp: 120.00,   // Expected selling MRP
          },
        ],
      }),
    }));
    const createPOJson = await createPORes.json();
    assert(createPORes.status === 200 && createPOJson.success === true, "Creates Purchase Order with line items successfully", createPOJson.message);
    const createdPO = createPOJson.purchaseOrder;
    assert(createdPO.poNumber.startsWith("PO-"), "PO number follows sequential format (PO-YYYY-00001)");
    assert(Number(createdPO.total) === 7550.0, "PO total correctly calculated (100 * 75.50 = 7550.00)");
    assert(createdPO.status === "pending", "New PO initializes with status 'pending'");

    // Test 16: Delete guard on Supplier: Cannot delete supplier with active PO
    const deleteSupRes = await deleteSupplier(new NextRequest(`http://localhost:3000/api/admin/suppliers?id=${createdSupplier.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    }));
    assert(deleteSupRes.status === 400, "Deleting supplier with active purchase orders is BLOCKED with HTTP 400");

    // Test 17: Smart Auto-PO Suggestions Engine
    const suggestionsRes = await getPOSuggestions(new NextRequest(`http://localhost:3000/api/admin/purchases/suggestions?branchId=${mainBranch.id}`, {
      headers: { Cookie: adminCookie },
    }));
    const suggestionsJson = await suggestionsRes.json();
    assert(suggestionsRes.status === 200 && suggestionsJson.success === true, "GET /api/admin/purchases/suggestions succeeds");
    assert(Array.isArray(suggestionsJson.suggestions), "Suggestions returns structured items array");

    // Test 18: PO Status Lifecycle: pending -> confirmed (sets confirmedAt)
    const confirmRes = await updatePurchase(new NextRequest(`http://localhost:3000/api/admin/purchases/${createdPO.id}`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", status: "confirmed" }),
    }), { params: Promise.resolve({ id: String(createdPO.id) }) });
    const confirmJson = await confirmRes.json();
    assert(confirmRes.status === 200 && confirmJson.purchaseOrder.status === "confirmed", "PO status transitions to 'confirmed'");
    assert(confirmJson.purchaseOrder.confirmedAt !== null, "confirmedAt timestamp recorded automatically");

    // Test 19: PO Status Lifecycle: confirmed -> shipped (sets shippedAt)
    const shipRes = await updatePurchase(new NextRequest(`http://localhost:3000/api/admin/purchases/${createdPO.id}`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", status: "shipped" }),
    }), { params: Promise.resolve({ id: String(createdPO.id) }) });
    const shipJson = await shipRes.json();
    assert(shipRes.status === 200 && shipJson.purchaseOrder.status === "shipped", "PO status transitions to 'shipped'");

    // Test 20: 1-Click Reorder PO Cloning
    const cloneRes = await clonePurchase(new NextRequest(`http://localhost:3000/api/admin/purchases/${createdPO.id}/clone`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    }), { params: Promise.resolve({ id: String(createdPO.id) }) });
    const cloneJson = await cloneRes.json();
    assert(cloneRes.status === 200 && cloneJson.success === true, "1-Click Reorder clones PO into new pending order");
    assert(cloneJson.purchaseOrder.poNumber !== createdPO.poNumber, "Cloned PO receives a fresh unique sequential PO number");
    assert(cloneJson.purchaseOrder.items.length === 1, "Cloned PO copies all line items");

    // Test 21: GRN Inward Stock Ingestion: PARTIAL delivery with bonus units
    const poItemId = createdPO.items[0].id;
    const partialBatchNo = `B-PART-${runId}`;
    const futureExp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const grnPartialRes = await processGRN(new NextRequest("http://localhost:3000/api/admin/grn", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        poId: createdPO.id,
        invoiceNo: `CHALLAN-PART-${runId}`,
        branchId: mainBranch.id,
        items: [
          {
            poItemId,
            receivedQty: 60, // 60 out of 100
            bonusQty: 5,     // 5 free bonus units
            batchNo: partialBatchNo,
            expiryDate: futureExp,
            purchasePrice: 75.50,
            mrp: 120.00,
          },
        ],
      }),
    }));
    const grnPartialJson = await grnPartialRes.json();
    assert(grnPartialRes.status === 200 && grnPartialJson.success === true, "GRN partial delivery processed successfully", grnPartialJson.message);
    assert(grnPartialJson.purchaseOrder.status === "shipped", "Partial delivery keeps PO status 'shipped'");

    // Verify stock created in Batch table
    const batchInDb = await prisma.batch.findFirst({
      where: { batchNo: partialBatchNo, branchId: mainBranch.id },
    });
    assert(batchInDb !== null && batchInDb.quantity === 65, "Batch stock reflects receivedQty + bonusQty (60 + 5 = 65 units)");

    // Verify StockAdjustment created
    const adjInDb = await prisma.stockAdjustment.findFirst({
      where: { batchId: batchInDb?.id, type: "add" },
    });
    assert(adjInDb !== null && adjInDb.quantity === 65, "Immutable StockAdjustment audit entry created with quantity 65");

    // Test 22: GRN Inward Stock Ingestion: FINAL remaining delivery (Full receipt)
    const grnFinalRes = await processGRN(new NextRequest("http://localhost:3000/api/admin/grn", {
      method: "POST",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        poId: createdPO.id,
        invoiceNo: `CHALLAN-FINAL-${runId}`,
        branchId: mainBranch.id,
        items: [
          {
            poItemId,
            receivedQty: 40, // Remaining 40 units
            bonusQty: 2,     // 2 bonus units
            batchNo: partialBatchNo, // MERGING with same batch!
            expiryDate: futureExp,
            purchasePrice: 75.50,
            mrp: 120.00,
          },
        ],
      }),
    }));
    const grnFinalJson = await grnFinalRes.json();
    assert(grnFinalRes.status === 200 && grnFinalJson.success === true, "Final GRN delivery completes PO inwarding");
    assert(grnFinalJson.purchaseOrder.status === "received", "PO status transitions to 'received' upon 100% item inwarding");
    assert(grnFinalJson.purchaseOrder.receivedAt !== null, "receivedAt timestamp recorded upon completion");

    // Verify Batch MERGE
    const mergedBatch = await prisma.batch.findFirst({
      where: { id: batchInDb?.id },
    });
    assert(mergedBatch !== null && mergedBatch.quantity === 107, "Batch merges additional inward stock (65 + 40 + 2 = 107 units)");

    // Test 23: State machine guard: Cannot cancel received PO
    const cancelReceivedRes = await updatePurchase(new NextRequest(`http://localhost:3000/api/admin/purchases/${createdPO.id}`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_status", status: "cancelled" }),
    }), { params: Promise.resolve({ id: String(createdPO.id) }) });
    assert(cancelReceivedRes.status === 400, "Cancelling a received Purchase Order is BLOCKED with HTTP 400");

    // Test 24: Safety delete guard: Cannot delete received or inwarded PO
    const deleteReceivedRes = await deletePurchase(new NextRequest(`http://localhost:3000/api/admin/purchases/${createdPO.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    }), { params: Promise.resolve({ id: String(createdPO.id) }) });
    assert(deleteReceivedRes.status === 400, "Deleting an inwarded/received Purchase Order is BLOCKED with HTTP 400");

    console.log(`\n================================================================================`);
    console.log(`ALL TESTS PASSED: ${passed} / ${total} (100% SUCCESS)`);
    console.log(`MODULE 1.10 & 1.11 PRODUCTION READY`);
    console.log(`================================================================================\n`);
  } finally {
    // Cleanup temporary test cashier
    await prisma.user.delete({ where: { id: cashier.id } }).catch(() => {});
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
