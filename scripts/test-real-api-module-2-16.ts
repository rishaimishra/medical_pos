/**
 * Integration Test Suite for MODULE 2.16: Dashboard & Report Details
 *
 * - 2.16.1: Dashboard Widgets (Today/Month/All-Time Net Revenue, PO status counts, 7-day chart, Top 5 30d medicines, Recent 8 sales, greeting)
 * - 2.16.2: Alert Banner counts & Notification Bell (expired batches + expiring soon + pending returns)
 * - 2.16.3: COGS-Based Profit Calculation (Batch.purchasePrice * soldQty - restock return COGS, ignoring PO totals)
 * - 2.16.4: Admin-Only Sales Summary Metrics (403 for non-admin, MoM Growth %, Daily Average, 12M chart/table, Top 10 Medicines, Top 5 Customers, Split Payment breakdown)
 * - 2.16.5: CSV (UTF-8 BOM) & Multi-Sheet OpenXML Excel (.xlsx) Export across Sales Summary, GST, Schedule Drugs, Dead Stock & Ledger
 */

import AdmZip from "adm-zip";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { GET as getDashboard } from "../src/app/api/admin/dashboard/route";
import { GET as getNotifications } from "../src/app/api/admin/notifications/route";
import { GET as getSalesSummary } from "../src/app/api/admin/reports/sales-summary/route";
import { GET as exportSalesSummary } from "../src/app/api/admin/reports/sales-summary/export/route";
import { GET as exportGst } from "../src/app/api/admin/reports/gst/export/route";
import { GET as exportScheduleDrugs } from "../src/app/api/admin/reports/schedule-drugs/export/route";
import { GET as exportDeadStock } from "../src/app/api/admin/reports/dead-stock/export/route";
import { GET as exportLedger } from "../src/app/api/admin/ledger/export/route";
import { buildXlsxBuffer } from "../src/lib/excel";

let currentToken = "";

function mockRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "GET",
    headers: {
      cookie: `med_pos_admin_session=${currentToken}`,
    },
  });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${desc}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failedTests++;
  }
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  console.log("================================================================================");
  console.log("INTEGRATION TEST SUITE: MODULE 2.16 (DASHBOARD, COGS, SALES SUMMARY & EXCEL)");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const storeRow = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = storeRow?.id || 1;

  const createdCustomerIds: number[] = [];
  const createdMedicineIds: number[] = [];
  const createdBatchIds: number[] = [];
  const createdSaleIds: number[] = [];
  const createdReturnIds: number[] = [];
  const createdPoIds: number[] = [];
  const createdExpenseIds: number[] = [];
  const createdUserIds: number[] = [];
  let branchId = 0;
  let bugBranchId = 0;
  let supplierId = 0;

  try {
    const branch = await prisma.branch.create({
      data: {
        code: `D${runId.toString().slice(-4)}`,
        name: `Module 2.16 Branch ${runId}`,
        storeId,
        active: true,
      },
    });
    branchId = branch.id;

    const pwHash = await hashPassword("Test1234!");
    const adminUser = await prisma.user.create({
      data: {
        name: `Admin User ${runId}`,
        username: `adm216_${runId}`,
        email: `adm216_${runId}@pharmacy.local`,
        password: pwHash,
        role: "admin",
        permissions: JSON.stringify(["view_profit_reports"]),
        branchId,
        storeId,
        active: true,
      },
    });
    const managerUser = await prisma.user.create({
      data: {
        name: `Manager User ${runId}`,
        username: `mgr216_${runId}`,
        email: `mgr216_${runId}@pharmacy.local`,
        password: pwHash,
        role: "manager",
        permissions: JSON.stringify(["view_profit_reports"]),
        branchId,
        storeId,
        active: true,
      },
    });
    const cashierUser = await prisma.user.create({
      data: {
        name: `Cashier User ${runId}`,
        username: `csh216_${runId}`,
        email: `csh216_${runId}@pharmacy.local`,
        password: pwHash,
        role: "cashier",
        permissions: JSON.stringify([]),
        branchId,
        storeId,
        active: true,
      },
    });
    createdUserIds.push(adminUser.id, managerUser.id, cashierUser.id);

    const tsNow = Date.now();
    const adminToken = createSessionToken({
      userId: adminUser.id,
      storeId,
      username: adminUser.username,
      name: adminUser.name,
      email: adminUser.email,
      role: "admin",
      branchId,
      permissions: ["view_profit_reports"],
      allowedPages: ["/admin/dashboard", "/admin/reports", "/admin/financials"],
      maxDiscountPercent: 100,
      issuedAt: tsNow,
      lastActive: tsNow,
    });
    const managerToken = createSessionToken({
      userId: managerUser.id,
      storeId,
      username: managerUser.username,
      name: managerUser.name,
      email: managerUser.email,
      role: "manager",
      branchId,
      permissions: ["view_profit_reports"],
      allowedPages: ["/admin/dashboard", "/admin/reports"],
      maxDiscountPercent: 20,
      issuedAt: tsNow,
      lastActive: tsNow,
    });
    const cashierToken = createSessionToken({
      userId: cashierUser.id,
      storeId,
      username: cashierUser.username,
      name: cashierUser.name,
      email: cashierUser.email,
      role: "cashier",
      branchId,
      permissions: [],
      allowedPages: ["/admin/dashboard", "/admin/pos"],
      maxDiscountPercent: 5,
      issuedAt: tsNow,
      lastActive: tsNow,
    });

    const supplier = await prisma.supplier.create({
      data: {
        name: `Supplier 2.16 ${runId}`,
        phone: `999${runId}1`,
      },
    });
    supplierId = supplier.id;

    // Seed Purchase Orders across statuses (received PO has huge ₹50,000 total to verify COGS profit ignores PO total)
    const poPending = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-P-${runId}`,
        supplierId,
        branchId,
        status: "pending",
        total: 1200,
      },
    });
    const poShipped = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-S-${runId}`,
        supplierId,
        branchId,
        status: "shipped",
        total: 2400,
      },
    });
    const poReceived = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-R-${runId}`,
        supplierId,
        branchId,
        status: "received",
        total: 50000,
      },
    });
    createdPoIds.push(poPending.id, poShipped.id, poReceived.id);

    // Seed Medicines + Batches (expired, expiring soon, healthy with known purchasePrice = 60, mrp = 100)
    const medMain = await prisma.medicine.create({
      data: {
        name: `TestPara ${runId}`,
        company: "Acme Pharma",
        category: "Tablet",
        hsnCode: "3004",
        gstPercent: 12,
        scheduleType: "schedule_h",
      },
    });
    const medSecond = await prisma.medicine.create({
      data: {
        name: `TestVita ${runId}`,
        company: "Acme Pharma",
        category: "Capsule",
        hsnCode: "3004",
        gstPercent: 12,
      },
    });
    createdMedicineIds.push(medMain.id, medSecond.id);

    const now = new Date();
    const pastDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    const soonDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const expiredBatch = await prisma.batch.create({
      data: {
        medicineId: medMain.id,
        batchNo: `EXP-${runId}`,
        expiryDate: pastDate,
        quantity: 5,
        purchasePrice: 40,
        mrp: 80,
        branchId,
      },
    });
    const expiringSoonBatch = await prisma.batch.create({
      data: {
        medicineId: medSecond.id,
        batchNo: `SOON-${runId}`,
        expiryDate: soonDate,
        quantity: 6,
        purchasePrice: 50,
        mrp: 100,
        branchId,
      },
    });
    const healthyBatch = await prisma.batch.create({
      data: {
        medicineId: medMain.id,
        batchNo: `HLTH-${runId}`,
        expiryDate: futureDate,
        quantity: 100,
        purchasePrice: 60,
        mrp: 100,
        branchId,
      },
    });
    createdBatchIds.push(expiredBatch.id, expiringSoonBatch.id, healthyBatch.id);

    // Seed 6 customers to validate Top 5 Customer truncation
    for (let i = 1; i <= 6; i++) {
      const cust = await prisma.customer.create({
        data: {
          name: `Cust ${i} ${runId}`,
          phone: `98${runId}${String(i).padStart(2, "0")}`,
          active: true,
        },
      });
      createdCustomerIds.push(cust.id);
    }

    const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const prevMonthLocal = new Date(now.getFullYear(), now.getMonth() - 1, 10);
    const prevMonthUtc = new Date(
      Date.UTC(prevMonthLocal.getFullYear(), prevMonthLocal.getMonth(), prevMonthLocal.getDate())
    );

    // Sale 1 (Today): Cust 1 buys 5 units @ MRP 100 (500 gross, COGS = 5 * 60 = 300), split payment Cash 200 + UPI 300
    const saleToday = await prisma.sale.create({
      data: {
        invoiceNo: `INV-216-T1-${runId}`,
        customerId: createdCustomerIds[0],
        saleDate: todayUtc,
        totalAmount: 446.43,
        gstAmount: 53.57,
        discountAmount: 0,
        grandTotal: 500,
        paymentMethod: "split",
        splitDetails: JSON.stringify({ cash: 200, upi: 300 }),
        branchId,
        createdBy: adminUser.id,
        items: {
          create: {
            medicineId: medMain.id,
            batchId: healthyBatch.id,
            quantity: 5,
            mrp: 100,
            taxableBase: 446.43,
            gstPercent: 12,
            gstAmount: 53.57,
            price: 500,
          },
        },
      },
      include: { items: true },
    });
    createdSaleIds.push(saleToday.id);

    // Create 1 Processed Return on Sale 1 (1 unit returned & restocked, refund 100, restock COGS = 60)
    // Net Revenue today = 500 - 100 = 400; Net COGS today = 300 - 60 = 240; Gross Profit today = 160!
    const processedRet = await prisma.return.create({
      data: {
        returnNumber: `RET-P-${runId}`,
        saleId: saleToday.id,
        customerId: createdCustomerIds[0],
        branchId,
        reason: "Excess strip",
        refundAmount: 100,
        refundMethod: "cash",
        status: "processed",
        stockAdjusted: true,
        processedAt: now,
        items: {
          create: {
            saleItemId: saleToday.items[0].id,
            medicineId: medMain.id,
            batchId: healthyBatch.id,
            quantity: 1,
            price: 100,
            restockAction: "restock",
          },
        },
      },
    });
    createdReturnIds.push(processedRet.id);

    // Create 1 Pending Return on Sale 1 (must NOT be deducted from Net Revenue, MUST appear in notifications!)
    const pendingRet = await prisma.return.create({
      data: {
        returnNumber: `RET-Q-${runId}`,
        saleId: saleToday.id,
        customerId: createdCustomerIds[0],
        branchId,
        reason: "Pending review",
        refundAmount: 50,
        refundMethod: "cash",
        status: "pending",
      },
    });
    createdReturnIds.push(pendingRet.id);

    // Create 5 more sales today for Customers 2..6 (so total 9 sales including previous month & extra test invoices -> Recent 8 caps at 8, Top 5 Customers caps at 5)
    for (let i = 1; i < 6; i++) {
      const qty = i; // 1..5 units -> netSpend = 100..500
      const amt = qty * 100;
      const s = await prisma.sale.create({
        data: {
          invoiceNo: `INV-216-C${i}-${runId}`,
          customerId: createdCustomerIds[i],
          saleDate: todayUtc,
          totalAmount: amt * 0.89,
          gstAmount: amt * 0.11,
          grandTotal: amt,
          paymentMethod: i % 2 === 0 ? "card" : "upi",
          branchId,
          createdBy: adminUser.id,
          items: {
            create: {
              medicineId: medSecond.id,
              batchId: expiringSoonBatch.id,
              quantity: qty,
              mrp: 100,
              taxableBase: amt * 0.89,
              gstPercent: 12,
              gstAmount: amt * 0.11,
              price: amt,
            },
          },
        },
      });
      createdSaleIds.push(s.id);
    }

    // Create 3 more today sales for Cust 6 so total sales count = 9 (> 8 for Recent 8 test)
    for (let k = 1; k <= 3; k++) {
      const s = await prisma.sale.create({
        data: {
          invoiceNo: `INV-216-X${k}-${runId}`,
          customerId: createdCustomerIds[5],
          saleDate: todayUtc,
          totalAmount: 100,
          gstAmount: 0,
          grandTotal: 100,
          paymentMethod: "cash",
          branchId,
          createdBy: adminUser.id,
          items: {
            create: {
              medicineId: medMain.id,
              batchId: healthyBatch.id,
              quantity: 1,
              mrp: 100,
              taxableBase: 100,
              gstPercent: 0,
              gstAmount: 0,
              price: 100,
            },
          },
        },
      });
      createdSaleIds.push(s.id);
    }

    // Create 1 Sale in Previous Calendar Month (Net = 1000) so MoM growth % is tested cleanly
    const salePrevMonth = await prisma.sale.create({
      data: {
        invoiceNo: `INV-216-PREV-${runId}`,
        customerId: createdCustomerIds[5],
        saleDate: prevMonthUtc,
        totalAmount: 1000,
        gstAmount: 0,
        grandTotal: 1000,
        paymentMethod: "cash",
        branchId,
        createdBy: adminUser.id,
        items: {
          create: {
            medicineId: medMain.id,
            batchId: healthyBatch.id,
            quantity: 10,
            mrp: 100,
            taxableBase: 1000,
            gstPercent: 0,
            gstAmount: 0,
            price: 1000,
          },
        },
      },
    });
    createdSaleIds.push(salePrevMonth.id);

    // Seed 1 Expense in current month (₹150)
    const expRow = await prisma.expense.create({
      data: {
        voucherNo: `EXP-216-${runId}`,
        storeId,
        branchId,
        userId: adminUser.id,
        type: "expense",
        category: "Utilities",
        title: "Test Power Bill",
        amount: 150,
        expenseDate: now,
      },
    });
    createdExpenseIds.push(expRow.id);

    // =========================================================================
    // TEST GROUP 1: DASHBOARD API (2.16.1, 2.16.2, 2.16.3)
    // =========================================================================
    console.log("\n[1] Testing /api/admin/dashboard...");
    currentToken = adminToken;
    const dashRes = await getDashboard(
      mockRequest(`http://localhost:3000/api/admin/dashboard?branchId=${branchId}`)
    );
    const dashJson = await dashRes.json();

    // Expected today:
    // Sale1 = 500 - 100 (processed ret) = 400 (COGS = 5*60 - 1*60 = 240)
    // Sales C1..C5 = 100+200+300+400+500 = 1500 (COGS = 15*50 = 750)
    // Sales X1..X3 = 300 (COGS = 3*60 = 180)
    // Today Gross = 2300, Refund = 100, Net Revenue = 2200
    // Today COGS = 240 + 750 + 180 = 1170 -> Gross Profit = 2200 - 1170 = 1030 (ignores ₹50,000 PO!)
    assert(dashRes.status === 200 && dashJson.success === true, "Dashboard returns HTTP 200 success");
    assert(
      ["Good Morning", "Good Afternoon", "Good Evening"].includes(dashJson.greeting),
      `Time-based greeting returned (${dashJson.greeting})`
    );
    assert(
      dashJson.revenueSummary.today.netRevenue === 2200,
      `Today Net Revenue = ₹2200 (Sales 2300 - Processed Refund 100, got ${dashJson.revenueSummary.today.netRevenue})`
    );
    assert(
      dashJson.revenueSummary.today.grossProfit === 1030,
      `Today COGS Gross Profit = ₹1030 (ignoring ₹50,000 PO bill, got ${dashJson.revenueSummary.today.grossProfit})`
    );
    assert(
      dashJson.revenueSummary.month.netRevenue === 2200 && dashJson.revenueSummary.allTime.netRevenue === 3200,
      `Month Net (₹2200) and All-Time Net (₹3200) accurate`
    );
    assert(
      dashJson.poStatusCounts.pending === 1 &&
        dashJson.poStatusCounts.shipped === 1 &&
        dashJson.poStatusCounts.received === 1 &&
        dashJson.poStatusCounts.total === 3,
      "PO counts by status accurate (pending: 1, shipped: 1, received: 1, total: 3)"
    );
    assert(
      Array.isArray(dashJson.sevenDayChart) &&
        dashJson.sevenDayChart.length === 7 &&
        dashJson.sevenDayChart[6].netRevenue === 2200,
      "7-day chart contains 7 buckets ending today with netRevenue = 2200"
    );
    assert(
      Array.isArray(dashJson.topMedicines30d) &&
        dashJson.topMedicines30d.length === 2 &&
        dashJson.topMedicines30d[0].name.includes(`TestVita`),
      "Top medicines 30d ranks TestVita (₹1500) ahead of TestPara (₹700 net after return)"
    );
    assert(
      Array.isArray(dashJson.recentSales) && dashJson.recentSales.length === 8,
      `Recent sales capped at 8 rows (got ${dashJson.recentSales?.length})`
    );
    assert(
      dashJson.overview.expiredCount === 1 &&
        dashJson.overview.expiringSoonCount === 1 &&
        dashJson.overview.pendingReturnCount === 1,
      "Overview flags 1 expired batch, 1 expiring soon batch, and 1 pending return"
    );

    // =========================================================================
    // TEST GROUP 2: NOTIFICATIONS API (2.16.2)
    // =========================================================================
    console.log("\n[2] Testing /api/admin/notifications (Expired + Expiring + Pending Returns)...");
    const notifRes = await getNotifications(
      mockRequest(`http://localhost:3000/api/admin/notifications?branchId=${branchId}`)
    );
    const notifJson = await notifRes.json();
    const notifs = notifJson.notifications || [];

    assert(notifRes.status === 200 && notifJson.success === true, "Notifications API returns 200");
    assert(
      notifs.some((n: any) => n.title === "Expired Drug Alert"),
      "Notifications surfaces already-expired batch with 'Expired Drug Alert'"
    );
    assert(
      notifs.some((n: any) => n.title === "Drug Expiring Soon"),
      "Notifications surfaces <=30d expiring batch with 'Drug Expiring Soon'"
    );
    assert(
      notifs.some((n: any) => n.type === "return" && n.href === "/admin/returns"),
      "Notifications surfaces pending return request linking to /admin/returns"
    );

    // =========================================================================
    // TEST GROUP 3: ADMIN-ONLY SALES SUMMARY RBAC & METRICS (2.16.4)
    // =========================================================================
    console.log("\n[3] Testing /api/admin/reports/sales-summary (RBAC & Metrics)...");
    currentToken = cashierToken;
    const cshRes = await getSalesSummary(
      mockRequest(`http://localhost:3000/api/admin/reports/sales-summary?branchId=${branchId}`)
    );
    assert(cshRes.status === 403, "Cashier receives 403 Forbidden on Admin Sales Summary");

    currentToken = managerToken;
    const mgrRes = await getSalesSummary(
      mockRequest(`http://localhost:3000/api/admin/reports/sales-summary?branchId=${branchId}`)
    );
    assert(mgrRes.status === 403, "Manager receives 403 Forbidden (strictly Admin-only)");

    currentToken = adminToken;
    const monthStartStr = toYmd(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEndStr = toYmd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const sumRes = await getSalesSummary(
      mockRequest(
        `http://localhost:3000/api/admin/reports/sales-summary?branchId=${branchId}&startDate=${monthStartStr}&endDate=${monthEndStr}`
      )
    );
    const sumJson = await sumRes.json();

    assert(sumRes.status === 200 && sumJson.success === true, "Admin accesses Sales Summary (200 OK)");
    // Current month net revenue = 2200, previous month = 1000 => MoM Growth = +120%
    assert(
      sumJson.summary.momGrowthPercent === 120,
      `MoM Growth % = +120% ((2200 - 1000)/1000*100, got ${sumJson.summary.momGrowthPercent})`
    );
    assert(
      sumJson.summary.dailyAverage === Number((2200 / sumJson.range.daysCount).toFixed(2)),
      `Daily Average accurately averages netRevenue over ${sumJson.range.daysCount} days`
    );
    assert(
      Array.isArray(sumJson.months) && sumJson.months.length === 12,
      "12-Month Breakdown returns exact 12 monthly buckets"
    );
    assert(
      Array.isArray(sumJson.topCustomers) && sumJson.topCustomers.length === 5,
      `Top Customers strictly capped at 5 rows (got ${sumJson.topCustomers?.length})`
    );
    assert(
      sumJson.topCustomers[0].customerId === createdCustomerIds[5] && sumJson.topCustomers[0].netSpend === 800,
      `Top Customer #1 is Cust 6 with ₹800 spend (got ₹${sumJson.topCustomers?.[0]?.netSpend})`
    );
    const upiEntry = (sumJson.paymentMethods || []).find((p: any) => p.method === "upi");
    const cashEntry = (sumJson.paymentMethods || []).find((p: any) => p.method === "cash");
    const cardEntry = (sumJson.paymentMethods || []).find((p: any) => p.method === "card");
    // Today sales payments: Sale1 split (cash 200, upi 300) + C1 (upi 100) + C2 (card 200) + C3 (upi 300) + C4 (card 400) + C5 (upi 500) + X1..X3 (cash 300)
    // Totals: cash = 500, upi = 1200, card = 600
    assert(
      cashEntry?.amount === 500 && upiEntry?.amount === 1200 && cardEntry?.amount === 600,
      `Split Payment decomposition accurate (cash=${cashEntry?.amount}, upi=${upiEntry?.amount}, card=${cardEntry?.amount})`
    );

    // =========================================================================
    // TEST GROUP 4: CSV (UTF-8 BOM) & EXCEL (.xlsx) EXPORTS (2.16.5)
    // =========================================================================
    console.log("\n[4] Testing CSV & Multi-Sheet OpenXML .xlsx Exports...");
    currentToken = managerToken;
    const mgrExpRes = await exportSalesSummary(
      mockRequest(`http://localhost:3000/api/admin/reports/sales-summary/export?branchId=${branchId}&format=xlsx`)
    );
    assert(mgrExpRes.status === 403, "Non-admin blocked (403) from Sales Summary Export");

    currentToken = adminToken;
    const csvRes = await exportSalesSummary(
      mockRequest(
        `http://localhost:3000/api/admin/reports/sales-summary/export?branchId=${branchId}&startDate=${monthStartStr}&endDate=${monthEndStr}&format=csv`
      )
    );
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    const hasUtf8Bom = csvBuf.length >= 3 && csvBuf[0] === 0xef && csvBuf[1] === 0xbb && csvBuf[2] === 0xbf;
    assert(
      csvRes.status === 200 && hasUtf8Bom,
      "Sales Summary CSV starts with UTF-8 BOM bytes (EF BB BF)"
    );

    const xlsxRes = await exportSalesSummary(
      mockRequest(
        `http://localhost:3000/api/admin/reports/sales-summary/export?branchId=${branchId}&startDate=${monthStartStr}&endDate=${monthEndStr}&format=xlsx`
      )
    );
    const xlsxBuf = Buffer.from(await xlsxRes.arrayBuffer());
    const zip = new AdmZip(xlsxBuf);
    const entryNames = zip.getEntries().map((e) => e.entryName);
    const workbookXml = zip.readAsText("xl/workbook.xml");
    assert(
      xlsxRes.status === 200 &&
        xlsxBuf[0] === 0x50 &&
        xlsxBuf[1] === 0x4b &&
        entryNames.includes("xl/worksheets/sheet1.xml") &&
        workbookXml.includes("12-Month Trend") &&
        workbookXml.includes("Top 10 Medicines") &&
        workbookXml.includes("Top 5 Customers"),
      "Sales Summary .xlsx export is valid PK ZIP workbook with multi-sheet OOXML tabs"
    );

    // Check Excel .xlsx export on existing endpoints
    for (const [label, fn, url] of [
      ["GST Export", exportGst, `http://localhost:3000/api/admin/reports/gst/export?branchId=${branchId}&format=xlsx`],
      ["Schedule Drugs Export", exportScheduleDrugs, `http://localhost:3000/api/admin/reports/schedule-drugs/export?branchId=${branchId}&format=xlsx`],
      ["Dead Stock Export", exportDeadStock, `http://localhost:3000/api/admin/reports/dead-stock/export?branchId=${branchId}&format=xlsx`],
      ["Master Ledger Export", exportLedger, `http://localhost:3000/api/admin/ledger/export?branchId=${branchId}&format=xlsx`],
    ] as const) {
      const r = await fn(mockRequest(url));
      const b = Buffer.from(await r.arrayBuffer());
      const z = new AdmZip(b);
      assert(
        r.status === 200 && b[0] === 0x50 && b[1] === 0x4b && z.getEntries().some((e) => e.entryName === "xl/workbook.xml"),
        `${label} ?format=xlsx returns valid OpenXML .xlsx workbook`
      );
    }

    // =========================================================================
    // TEST GROUP 5: BUG REGRESSION CHECKS (EXCEL INJECTION, 100% RETURN NET/GST, BRANCH GUARD)
    // =========================================================================
    console.log("\n[5] Running Bug Regression Checks (Bugs 1, 3, 4, 6)...");
    const xlsxInjBuf = buildXlsxBuffer([
      {
        name: "Very Long Report Sheet Name Exceeding Limit Alpha",
        headers: ["Formula", "Plus", "Normal"],
        rows: [["=CMD|'/C calc'!A0", "+1+1", "Safe"]],
      },
      {
        name: "Very Long Report Sheet Name Exceeding Limit Beta",
        headers: ["Minus", "At", "Normal"],
        rows: [["-SUM(1,1)", "@SUM(1)", "Normal"]],
      },
    ]);
    const injZip = new AdmZip(xlsxInjBuf);
    const sheet1Xml = injZip.readAsText("xl/worksheets/sheet1.xml");
    const sheet2Xml = injZip.readAsText("xl/worksheets/sheet2.xml");
    const injWbXml = injZip.readAsText("xl/workbook.xml");
    const sheetNameMatches = [...injWbXml.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    assert(
      sheet1Xml.includes("&apos;=CMD|&apos;/C calc&apos;!A0") &&
        sheet1Xml.includes("&apos;+1+1") &&
        sheet2Xml.includes("&apos;-SUM(1,1)") &&
        sheet2Xml.includes("&apos;@SUM(1)") &&
        sheetNameMatches.length === 2 &&
        new Set(sheetNameMatches).size === 2 &&
        sheetNameMatches.every((n) => n.length <= 31),
      "buildXlsxBuffer neutralizes Excel formulas and deduplicates 31-char sheet names"
    );

    // Isolated branch for discounted 100% return (Bugs 1 & 3) + switch_branches RBAC guard (Bug 4)
    const bugBranch = await prisma.branch.create({
      data: {
        code: `B${runId.toString().slice(-4)}`,
        name: `Bug Regression Branch ${runId}`,
        storeId,
        active: true,
      },
    });
    bugBranchId = bugBranch.id;

    const bugMed = await prisma.medicine.create({
      data: {
        name: `RetDiscMed ${runId}`,
        company: "BugLab",
        category: "Tablet",
        hsnCode: "3004",
        gstPercent: 12,
      },
    });
    createdMedicineIds.push(bugMed.id);

    const bugBatch = await prisma.batch.create({
      data: {
        medicineId: bugMed.id,
        batchNo: `BBUG-${runId}`,
        expiryDate: futureDate,
        quantity: 10,
        purchasePrice: 50,
        mrp: 100,
        branchId: bugBranchId,
      },
    });
    createdBatchIds.push(bugBatch.id);

    const bugSale = await prisma.sale.create({
      data: {
        invoiceNo: `INV-216-BUG-${runId}`,
        saleDate: todayUtc,
        totalAmount: 160.71,
        gstAmount: 19.29,
        discountAmount: 20,
        grandTotal: 180,
        paymentMethod: "cash",
        branchId: bugBranchId,
        createdBy: adminUser.id,
        items: {
          create: {
            medicineId: bugMed.id,
            batchId: bugBatch.id,
            quantity: 2,
            mrp: 100,
            taxableBase: 178.57,
            gstPercent: 12,
            gstAmount: 21.43,
            price: 200,
          },
        },
      },
      include: { items: true },
    });
    createdSaleIds.push(bugSale.id);

    const bugRet = await prisma.return.create({
      data: {
        returnNumber: `RET-BUG-${runId}`,
        saleId: bugSale.id,
        branchId: bugBranchId,
        reason: "Full return on discounted sale",
        refundAmount: 180,
        refundMethod: "cash",
        status: "processed",
        stockAdjusted: true,
        processedAt: now,
        items: {
          create: {
            saleItemId: bugSale.items[0].id,
            medicineId: bugMed.id,
            batchId: bugBatch.id,
            quantity: 2,
            price: 90,
            restockAction: "restock",
          },
        },
      },
    });
    createdReturnIds.push(bugRet.id);

    // Without switch_branches permission, manager cannot query another branch (?branchId -> 403, ?branchId=all -> scoped to own branch)
    currentToken = managerToken;
    const lockedBranchRes = await getDashboard(
      mockRequest(`http://localhost:3000/api/admin/dashboard?branchId=${bugBranchId}`)
    );
    const allBranchesLockedRes = await getDashboard(
      mockRequest(`http://localhost:3000/api/admin/dashboard?branchId=all`)
    );
    const allBranchesLockedJson = await allBranchesLockedRes.json();
    assert(
      lockedBranchRes.status === 403 &&
        allBranchesLockedRes.status === 200 &&
        allBranchesLockedJson.revenueSummary?.today?.netRevenue === 2200,
      "Non-admin without switch_branches permission is blocked from other branches (403) and ?branchId=all stays scoped to own branch"
    );

    // With switch_branches permission, inspect bugBranchId -> netRevenue=0, gstAmount=0, topMedicines=0
    currentToken = createSessionToken({
      userId: adminUser.id,
      storeId,
      username: adminUser.username,
      name: adminUser.name,
      email: adminUser.email,
      role: "admin",
      branchId,
      permissions: ["view_profit_reports", "switch_branches"],
      allowedPages: ["/admin/dashboard", "/admin/reports", "/admin/financials"],
      maxDiscountPercent: 100,
      issuedAt: tsNow,
      lastActive: tsNow,
    });
    const bugDashRes = await getDashboard(
      mockRequest(`http://localhost:3000/api/admin/dashboard?branchId=${bugBranchId}`)
    );
    const bugDashJson = await bugDashRes.json();
    const bugSumRes = await getSalesSummary(
      mockRequest(
        `http://localhost:3000/api/admin/reports/sales-summary?branchId=${bugBranchId}&startDate=${monthStartStr}&endDate=${monthEndStr}`
      )
    );
    const bugSumJson = await bugSumRes.json();
    assert(
      bugSumJson.summary?.netRevenue === 0 &&
        bugSumJson.summary?.gstAmount === 0 &&
        (bugSumJson.topMedicines || []).length === 0 &&
        (bugDashJson.topMedicines30d || []).length === 0,
      "100% returned bill-discounted sale leaves 0 phantom medicine revenue/units & reverses GST cleanly"
    );
  } finally {
    console.log("\nCleaning up Module 2.16 test fixtures...");
    if (createdReturnIds.length) {
      await prisma.returnItem.deleteMany({ where: { returnId: { in: createdReturnIds } } });
      await prisma.return.deleteMany({ where: { id: { in: createdReturnIds } } });
    }
    if (createdSaleIds.length) {
      await prisma.saleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
      await prisma.sale.deleteMany({ where: { id: { in: createdSaleIds } } });
    }
    if (createdExpenseIds.length) {
      await prisma.expense.deleteMany({ where: { id: { in: createdExpenseIds } } });
    }
    if (createdPoIds.length) {
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: createdPoIds } } });
    }
    if (createdBatchIds.length) {
      await prisma.batch.deleteMany({ where: { id: { in: createdBatchIds } } });
    }
    if (createdMedicineIds.length) {
      await prisma.medicine.deleteMany({ where: { id: { in: createdMedicineIds } } });
    }
    if (createdCustomerIds.length) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (supplierId) {
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (bugBranchId) {
      await prisma.branch.deleteMany({ where: { id: bugBranchId } });
    }
    if (branchId) {
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\nSUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
