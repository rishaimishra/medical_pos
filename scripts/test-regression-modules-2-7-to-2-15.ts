import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import * as salesRoute from "../src/app/api/admin/sales/route";
import * as shareRoute from "../src/app/api/admin/sales/[id]/share/route";
import * as invoicesRoute from "../src/app/api/admin/pos/invoices/[id]/route";
import * as returnsLookupRoute from "../src/app/api/admin/returns/lookup/route";
import * as returnsRoute from "../src/app/api/admin/returns/route";
import * as returnDetailRoute from "../src/app/api/admin/returns/[id]/route";
import * as expensesRoute from "../src/app/api/admin/expenses/route";
import * as expenseDetailRoute from "../src/app/api/admin/expenses/[id]/route";
import * as drawerSummaryRoute from "../src/app/api/admin/cash-drawer/summary/route";
import * as ledgerRoute from "../src/app/api/admin/ledger/route";
import * as scheduleRoute from "../src/app/api/admin/reports/schedule-drugs/route";
import * as gstRoute from "../src/app/api/admin/reports/gst/route";
import * as analyticsRoute from "../src/app/api/admin/reports/analytics/route";
import * as pnlRoute from "../src/app/api/admin/reports/profit-loss/route";
import * as deadStockRoute from "../src/app/api/admin/reports/dead-stock/route";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: any) {
  if (cond) {
    console.log(`  ✔ [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  ✖ [FAIL] ${label}`, detail !== undefined ? detail : "");
    failed++;
  }
}

function makeReq(url: string, token: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: `med_pos_admin_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  console.log("================================================================================");
  console.log("REGRESSION TEST SUITE: MODULES 2.7 – 2.15 BUG FIX VERIFICATION");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const storeA = await prisma.settings.create({
    data: {
      storeName: `Store Alpha ${runId}`,
      storeGst: "19ALPHA1234F1Z5",
      storeDl: "DL-ALPHA-01",
      setupDone: true,
    },
  });
  const storeB = await prisma.settings.create({
    data: {
      storeName: `Store Beta ${runId}`,
      setupDone: true,
    },
  });

  const branchA = await prisma.branch.create({
    data: {
      storeId: storeA.id,
      code: `BA${String(runId).slice(-4)}`,
      name: `Branch A ${runId}`,
      isMain: true,
    },
  });
  const branchB = await prisma.branch.create({
    data: {
      storeId: storeB.id,
      code: `BB${String(runId).slice(-4)}`,
      name: `Branch B ${runId}`,
      isMain: true,
    },
  });

  const pwHash = await hashPassword("Pass123!");
  const adminA = await prisma.user.create({
    data: {
      storeId: storeA.id,
      branchId: null,
      name: `Admin A ${runId}`,
      username: `adma_${runId}`,
      email: `adma_${runId}@test.local`,
      password: pwHash,
      role: "admin",
      active: true,
    },
  });
  const cashierA = await prisma.user.create({
    data: {
      storeId: storeA.id,
      branchId: branchA.id,
      name: `Cashier A ${runId}`,
      username: `casha_${runId}`,
      email: `casha_${runId}@test.local`,
      password: pwHash,
      role: "cashier",
      active: true,
    },
  });
  const adminB = await prisma.user.create({
    data: {
      storeId: storeB.id,
      branchId: null,
      name: `Admin B ${runId}`,
      username: `admb_${runId}`,
      email: `admb_${runId}@test.local`,
      password: pwHash,
      role: "admin",
      active: true,
    },
  });

  const tokAdminA = createSessionToken({
    userId: adminA.id,
    storeId: storeA.id,
    branchId: null,
    username: adminA.username,
    name: adminA.name,
    email: adminA.email,
    role: "admin",
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 100,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });
  const tokCashierA = createSessionToken({
    userId: cashierA.id,
    storeId: storeA.id,
    branchId: branchA.id,
    username: cashierA.username,
    name: cashierA.name,
    email: cashierA.email,
    role: "cashier",
    permissions: ["manage_customers"],
    allowedPages: [],
    maxDiscountPercent: 10,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });
  const tokAdminB = createSessionToken({
    userId: adminB.id,
    storeId: storeB.id,
    branchId: null,
    username: adminB.username,
    name: adminB.name,
    email: adminB.email,
    role: "admin",
    permissions: [],
    allowedPages: [],
    maxDiscountPercent: 100,
    issuedAt: Date.now(),
    lastActive: Date.now(),
  });

  const custA = await prisma.customer.create({
    data: {
      name: `Patient Zero ${runId}`,
      phone: `09876${String(runId).slice(0, 6)}`, // Leading zero 11-digit format
      creditLimit: 5000,
    },
  });

  const medH1 = await prisma.medicine.create({
    data: {
      name: `RegSchedH1 ${runId}`,
      company: "TestLab",
      category: "Tablet",
      hsnCode: "30049011",
      gstPercent: 12,
      scheduleType: "schedule_h1",
    },
  });
  const batchA = await prisma.batch.create({
    data: {
      medicineId: medH1.id,
      branchId: branchA.id,
      batchNo: `BREG-${runId}`,
      expiryDate: new Date("2028-12-31"),
      quantity: 100,
      purchasePrice: 50,
      mrp: 100,
    },
  });

  // Create Sale with 10% item discount (MRP 100 x 4 = 400 gross, 10% item discount -> price = 360, no bill discount -> grandTotal = 360)
  const saleItemDisc = await prisma.sale.create({
    data: {
      invoiceNo: `DRX-REG-${runId}-1`,
      customerId: custA.id,
      branchId: branchA.id,
      createdBy: adminA.id,
      saleDate: new Date(),
      totalAmount: 400,
      discountAmount: 40,
      gstAmount: Number((360 - 360 / 1.12).toFixed(2)),
      grandTotal: 360,
      paymentMethod: "credit",
      creditAmount: 360,
      items: {
        create: [
          {
            medicineId: medH1.id,
            batchId: batchA.id,
            quantity: 4,
            mrp: 100,
            taxableBase: Number((360 / 1.12).toFixed(2)),
            gstPercent: 12,
            gstAmount: Number((360 - 360 / 1.12).toFixed(2)),
            price: 360,
          },
        ],
      },
    },
    include: { items: true },
  });

  // Sale 2 in Store B for tenant isolation test
  const saleB = await prisma.sale.create({
    data: {
      invoiceNo: `DRX-BET-${runId}-1`,
      branchId: branchB.id,
      createdBy: adminB.id,
      saleDate: new Date(),
      totalAmount: 999,
      gstAmount: 107.04,
      grandTotal: 999,
      paymentMethod: "cash",
    },
  });

  // 1. Sales history payload & store fallback + WhatsApp leading-zero fix
  const salesRes = await salesRoute.GET(makeReq(`http://localhost:3000/api/admin/sales?branchId=${branchA.id}`, tokAdminA));
  const salesJson = await salesRes.json();
  const foundSale = salesJson.data.find((s: any) => s.id === saleItemDisc.id);
  assert(
    Boolean(foundSale && foundSale.items[0].name === medH1.name && foundSale.items[0].hsnCode === "30049011"),
    "Sales list exposes full item name & HSN for Thermal/A4 reprints",
    foundSale?.items?.[0]
  );
  assert(
    Boolean(foundSale?.store?.gstNo === "19ALPHA1234F1Z5" && foundSale?.store?.dlNo === "DL-ALPHA-01"),
    "Sales list merges Settings GSTIN/DL fallback when branch omits them",
    foundSale?.store
  );

  const shareRes = await shareRoute.POST(
    makeReq(`http://localhost:3000/api/admin/sales/${saleItemDisc.id}/share`, tokAdminA, "POST", { channel: "whatsapp" }),
    { params: Promise.resolve({ id: String(saleItemDisc.id) }) }
  );
  const shareJson = await shareRes.json();
  assert(
    shareJson.delivery?.whatsapp?.phone?.startsWith("91") && shareJson.delivery.whatsapp.phone.length === 12,
    "WhatsApp phone sanitizer strips leading '0' and adds '91' country code",
    shareJson.delivery?.whatsapp?.phone
  );

  // Tenant IDOR checks
  const invBRes = await invoicesRoute.GET(makeReq(`http://localhost:3000/api/admin/pos/invoices/${saleB.id}`, tokAdminA), {
    params: Promise.resolve({ id: String(saleB.id) }),
  });
  assert(invBRes.status === 403, "Invoice API blocks cross-tenant store read (403)", invBRes.status);

  // 2. Returns: item discount NOT double-discounted, duplicate saleItemId blocked, pending->processed workflow & store_credit
  const lookupRes = await returnsLookupRoute.GET(
    makeReq(`http://localhost:3000/api/admin/returns/lookup?invoiceNo=${saleItemDisc.invoiceNo}`, tokAdminA)
  );
  const lookupJson = await lookupRes.json();
  assert(
    lookupJson.sale.items[0].unitRefundPrice === 90,
    "Item-level 10% discount is NOT double-discounted on return lookup (expected ₹90/unit)",
    lookupJson.sale.items[0].unitRefundPrice
  );

  const saleItemId = saleItemDisc.items[0].id;
  const dupGuardRes = await returnsRoute.POST(
    makeReq(`http://localhost:3000/api/admin/returns`, tokAdminA, "POST", {
      saleId: saleItemDisc.id,
      refundMethod: "store_credit",
      items: [
        { saleItemId, quantity: 3, restockAction: "restock" },
        { saleItemId, quantity: 3, restockAction: "restock" },
      ],
    })
  );
  assert(dupGuardRes.status === 400, "Duplicate saleItemId rows exceeding purchased qty blocked (400)", dupGuardRes.status);

  // Create PENDING return of 2 units @ store_credit
  const pendRes = await returnsRoute.POST(
    makeReq(`http://localhost:3000/api/admin/returns`, tokAdminA, "POST", {
      saleId: saleItemDisc.id,
      refundMethod: "store_credit",
      status: "pending",
      items: [{ saleItemId, quantity: 2, restockAction: "restock" }],
    })
  );
  const pendJson = await pendRes.json();
  assert(pendRes.status === 200 && pendJson.return.status === "pending", "Pending return created cleanly");

  const batchAfterPending = await prisma.batch.findUnique({ where: { id: batchA.id } });
  assert(batchAfterPending?.quantity === 100, "Pending return does not adjust batch stock yet", batchAfterPending?.quantity);

  // Approve pending -> processed via PATCH
  const approveRes = await returnDetailRoute.PATCH(
    makeReq(`http://localhost:3000/api/admin/returns/${pendJson.return.id}`, tokAdminA, "PATCH", { status: "processed" }),
    { params: Promise.resolve({ id: String(pendJson.return.id) }) }
  );
  const approveJson = await approveRes.json();
  assert(approveRes.status === 200 && approveJson.return.status === "processed", "PATCH approves pending return to processed");

  const batchAfterApprove = await prisma.batch.findUnique({ where: { id: batchA.id } });
  assert(batchAfterApprove?.quantity === 102, "Approving restock return increments batch quantity by 2", batchAfterApprove?.quantity);

  const creditSettlement = await prisma.customerPayment.findFirst({
    where: { customerId: custA.id, referenceNo: pendJson.return.returnNumber },
  });
  assert(
    Boolean(creditSettlement && Number(creditSettlement.amount) === 180 && creditSettlement.paymentMethod === "store_credit"),
    "Store credit refund creates CustomerPayment credit settlement (₹180)",
    creditSettlement
  );

  // Process remaining 2 units as immediate restock + upi (total returned = all 4 units)
  const ret2Res = await returnsRoute.POST(
    makeReq(`http://localhost:3000/api/admin/returns`, tokAdminA, "POST", {
      saleId: saleItemDisc.id,
      refundMethod: "upi",
      items: [{ saleItemId, quantity: 2, restockAction: "restock" }],
    })
  );
  assert(ret2Res.status === 200, "Second return completes remaining 2 units");

  // 3. Cash Drawer ignores non-cash returns (store_credit + upi) & allows cashier access
  const drawerRes = await drawerSummaryRoute.GET(
    makeReq(`http://localhost:3000/api/admin/cash-drawer/summary?branchId=${branchA.id}`, tokCashierA)
  );
  const drawerJson = await drawerRes.json();
  assert(
    drawerRes.status === 200 && drawerJson.figures.cashReturns === 0,
    "Cashier allowed on cash drawer summary AND non-cash returns (store_credit/upi) are NOT deducted from drawer cash",
    drawerJson.figures
  );

  // 4. Ledger excludes Store B data, avoids double counting credit sale + store_credit settlement
  const ledgerRes = await ledgerRoute.GET(makeReq(`http://localhost:3000/api/admin/ledger`, tokAdminA));
  const ledgerJson = await ledgerRes.json();
  const hasStoreB = ledgerJson.entries.some((e: any) => e.refNo === saleB.invoiceNo);
  assert(!hasStoreB, "Master ledger strictly isolates by storeId across all branches");

  // Create two expenses, delete the FIRST one (gap at 00001 while 00002 remains), verify 3rd does not collide
  const exp1 = await (
    await expensesRoute.POST(
      makeReq(`http://localhost:3000/api/admin/expenses`, tokAdminA, "POST", {
        branchId: branchA.id,
        category: "Electricity",
        title: "Test Power 1",
        amount: 100,
      })
    )
  ).json();
  const exp2 = await (
    await expensesRoute.POST(
      makeReq(`http://localhost:3000/api/admin/expenses`, tokAdminA, "POST", {
        branchId: branchA.id,
        category: "Electricity",
        title: "Test Power 2",
        amount: 110,
      })
    )
  ).json();
  await expenseDetailRoute.DELETE(makeReq(`http://localhost:3000/api/admin/expenses/${exp1.expense.id}`, tokAdminA, "DELETE"), {
    params: Promise.resolve({ id: String(exp1.expense.id) }),
  });
  const exp3Res = await expensesRoute.POST(
    makeReq(`http://localhost:3000/api/admin/expenses`, tokAdminA, "POST", {
      branchId: branchA.id,
      category: "Electricity",
      title: "Test Power 3",
      amount: 120,
    })
  );
  const exp3Json = await exp3Res.json();
  assert(
    exp3Res.status === 200 && exp3Json.expense.voucherNo !== exp2.expense.voucherNo,
    "Expense deletion gap does not collide on next voucher number",
    exp3Json.expense?.voucherNo
  );

  // 5. Reports: RBAC + Schedule H/H1, GST, Analytics, P&L, Dead Stock adjustments after full return
  const deniedPnl = await pnlRoute.GET(makeReq(`http://localhost:3000/api/admin/reports/profit-loss`, tokCashierA));
  assert(deniedPnl.status === 403, "Reports API enforces view_profit_reports RBAC against cashier (403)", deniedPnl.status);

  const schedJson = await (
    await scheduleRoute.GET(makeReq(`http://localhost:3000/api/admin/reports/schedule-drugs?branchId=${branchA.id}`, tokAdminA))
  ).json();
  assert(schedJson.records.length === 0, "Schedule H1 register excludes fully-returned sales", schedJson.records.length);

  const gstJson = await (
    await gstRoute.GET(makeReq(`http://localhost:3000/api/admin/reports/gst?branchId=${branchA.id}`, tokAdminA))
  ).json();
  assert(gstJson.gstr1.summary.totalTurnover === 0, "GSTR-1 outward turnover reverses returned items", gstJson.gstr1.summary.totalTurnover);

  const analyticsJson = await (
    await analyticsRoute.GET(makeReq(`http://localhost:3000/api/admin/reports/analytics?branchId=${branchA.id}&range=month`, tokAdminA))
  ).json();
  const pnlJson = await (
    await pnlRoute.GET(makeReq(`http://localhost:3000/api/admin/reports/profit-loss?branchId=${branchA.id}`, tokAdminA))
  ).json();
  assert(
    analyticsJson.summary.cogs === 0 && pnlJson.statement.cogs === 0 && analyticsJson.summary.grossProfit === pnlJson.statement.grossProfit,
    "Analytics & P&L reverse restocked COGS to ₹0 and agree identically on Gross Profit",
    { analytics: analyticsJson.summary, pnl: pnlJson.statement }
  );

  // Dead stock should detect batchA even though it had a sale that was 100% returned, if older than cutoff -> verify with thresholdDays=30 if batch created now (new batch < 30 days won't match unless backdated, so backdate batchA.createdAt by 100 days)
  await prisma.batch.update({
    where: { id: batchA.id },
    data: { createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) },
  });
  const deadJson = await (
    await deadStockRoute.GET(makeReq(`http://localhost:3000/api/admin/reports/dead-stock?branchId=${branchA.id}&thresholdDays=60`, tokAdminA))
  ).json();
  assert(
    deadJson.records.some((r: any) => r.batchId === batchA.id),
    "Dead Stock still flags batch whose only sale was 100% returned",
    deadJson.records.length
  );

  // Cleanup
  await prisma.expense.deleteMany({ where: { storeId: { in: [storeA.id, storeB.id] } } });
  await prisma.customerPayment.deleteMany({ where: { customerId: custA.id } });
  await prisma.returnItem.deleteMany({ where: { returnReturn: { saleId: saleItemDisc.id } } });
  await prisma.return.deleteMany({ where: { saleId: saleItemDisc.id } });
  await prisma.stockAdjustment.deleteMany({ where: { batchId: batchA.id } });
  await prisma.saleItem.deleteMany({ where: { saleId: { in: [saleItemDisc.id, saleB.id] } } });
  await prisma.sale.deleteMany({ where: { id: { in: [saleItemDisc.id, saleB.id] } } });
  await prisma.batch.deleteMany({ where: { id: batchA.id } });
  await prisma.medicine.deleteMany({ where: { id: medH1.id } });
  await prisma.customer.delete({ where: { id: custA.id } });
  await prisma.user.deleteMany({ where: { id: { in: [adminA.id, cashierA.id, adminB.id] } } });
  await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } });
  await prisma.settings.deleteMany({ where: { id: { in: [storeA.id, storeB.id] } } });

  console.log(`\nREGRESSION SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
