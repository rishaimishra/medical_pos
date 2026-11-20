import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { normalizeMonthlyMrr, parseCustomLimitsJson } from "@/lib/saasFeatures";

/**
 * MODULE 3.8: CEO Executive Command Dashboard API (`GET /api/super-admin/dashboard`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const now = new Date();
    const todayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const thirtyDaysAgoUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const seventyTwoHoursAhead = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    const [
      stores,
      branches,
      subscriptions,
      allPayments,
      todaySalesAgg,
      thirtyDaySalesAgg,
      allTimeSalesAgg,
      rxUploadsCount,
      recentWebhooks,
      staffGroups,
      medGroups,
      supGroups,
      custGroups,
      monthlySalesByBranch,
      lastSaleByBranch,
      recentPlatformEvents,
    ] = await Promise.all([
      prisma.settings.findMany({
        where: { OR: [{ setupDone: true }, { branches: { some: {} } }] },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          storeName: true,
          storeStatus: true,
          ownerEmail: true,
          storeEmail: true,
          setupDone: true,
          createdAt: true,
        },
      }),
      prisma.branch.findMany({ select: { id: true, storeId: true } }),
      prisma.storeSubscription.findMany({
        orderBy: [{ id: "desc" }],
        include: {
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              billingCycle: true,
              intervalCount: true,
              priceInr: true,
              maxBranches: true,
              maxStaffUsers: true,
              maxMedicines: true,
              maxMonthlyInvoices: true,
              maxSuppliers: true,
              maxCustomers: true,
            },
          },
        },
      }),
      prisma.subscriptionPayment.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          store: { select: { id: true, storeName: true } },
          plan: { select: { code: true, name: true } },
        },
      }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: todayStartUtc } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: { saleDate: { gte: thirtyDaysAgoUtc } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.patientMessage.count({ where: { filePath: { not: null } } }),
      prisma.razorpayWebhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          eventId: true,
          eventType: true,
          processed: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      prisma.user.groupBy({
        by: ["storeId"],
        where: { storeId: { not: null }, active: true },
        _count: { _all: true },
      }),
      prisma.medicine.groupBy({
        by: ["storeId"],
        where: { storeId: { not: null } },
        _count: { _all: true },
      }),
      prisma.supplier.groupBy({
        by: ["storeId"],
        where: { storeId: { not: null } },
        _count: { _all: true },
      }),
      prisma.customer.groupBy({
        by: ["storeId"],
        where: { storeId: { not: null } },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { branchId: { not: null }, saleDate: { gte: monthStartUtc } },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { branchId: { not: null } },
        _max: { createdAt: true },
      }),
      prisma.platformAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { platformUser: { select: { name: true } } },
      }),
    ]);

    const branchToStore = new Map<number, number>();
    const branchCountByStore = new Map<number, number>();
    branches.forEach((b) => {
      if (b.storeId) {
        branchToStore.set(b.id, b.storeId);
        branchCountByStore.set(b.storeId, (branchCountByStore.get(b.storeId) || 0) + 1);
      }
    });

    const staffCountByStore = new Map<number, number>();
    staffGroups.forEach((g) => {
      if (g.storeId) staffCountByStore.set(g.storeId, g._count._all);
    });

    const medCountByStore = new Map<number, number>();
    medGroups.forEach((g) => {
      if (g.storeId) medCountByStore.set(g.storeId, g._count._all);
    });

    const supCountByStore = new Map<number, number>();
    supGroups.forEach((g) => {
      if (g.storeId) supCountByStore.set(g.storeId, g._count._all);
    });

    const custCountByStore = new Map<number, number>();
    custGroups.forEach((g) => {
      if (g.storeId) custCountByStore.set(g.storeId, g._count._all);
    });

    const monthlyInvByStore = new Map<number, number>();
    monthlySalesByBranch.forEach((row) => {
      const sId = row.branchId ? branchToStore.get(row.branchId) : undefined;
      if (sId) monthlyInvByStore.set(sId, (monthlyInvByStore.get(sId) || 0) + row._count._all);
    });

    const lastSaleByStore = new Map<number, Date>();
    lastSaleByBranch.forEach((row) => {
      const sId = row.branchId ? branchToStore.get(row.branchId) : undefined;
      const dt = row._max.createdAt;
      if (!sId || !dt) return;
      const prev = lastSaleByStore.get(sId);
      if (!prev || dt > prev) lastSaleByStore.set(sId, dt);
    });

    // Latest subscription per store (prevents double-counting upgrade rows in MRR)
    const latestSubByStore = new Map<number, (typeof subscriptions)[number]>();
    const storeHadTrial = new Set<number>();
    const storeHasConvertedPaid = new Set<number>();
    for (const s of subscriptions) {
      if (!latestSubByStore.has(s.storeId)) {
        latestSubByStore.set(s.storeId, s);
      }
      if (s.plan.code === "FREE_TRIAL" || s.trialEndsAt) storeHadTrial.add(s.storeId);
      if (Number(s.plan.priceInr) > 0 && ["active", "grace_period", "cancelled"].includes(s.status)) {
        storeHasConvertedPaid.add(s.storeId);
      }
    }

    let mrr = 0;
    let activePaidStores = 0;
    let trialingStores = 0;
    let pastDueGraceStores = 0;
    let churnedStores = 0;
    let recentChurn30d = 0;

    const planShareMap = new Map<string, { code: string; name: string; count: number; mrr: number }>();

    const upsellLeads: Array<{
      storeId: number;
      storeName: string;
      planName: string;
      triggers: string[];
      maxUsagePct: number;
    }> = [];

    const atRiskAlerts: Array<{
      storeId: number;
      storeName: string;
      severity: "urgent" | "warning";
      reason: string;
      category: string;
    }> = [];

    for (const store of stores) {
      const sub = latestSubByStore.get(store.id);
      const rawSubStatus = (sub?.status || store.storeStatus || "active").toLowerCase();
      const isPeriodExpired = Boolean(
        sub &&
          ["active", "trialing"].includes(rawSubStatus) &&
          sub.currentPeriodEnd &&
          sub.currentPeriodEnd < now
      );
      const subStatus = isPeriodExpired ? "expired" : rawSubStatus;
      const price = sub ? Number(sub.plan.priceInr) : 0;

      if (sub && subStatus === "active" && price > 0) {
        activePaidStores++;
        const storeMrr = normalizeMonthlyMrr(price, sub.plan.billingCycle, sub.plan.intervalCount);
        mrr += storeMrr;

        const existingTier = planShareMap.get(sub.plan.code) || {
          code: sub.plan.code,
          name: sub.plan.name,
          count: 0,
          mrr: 0,
        };
        existingTier.count++;
        existingTier.mrr += storeMrr;
        planShareMap.set(sub.plan.code, existingTier);
      } else if (subStatus === "trialing") {
        trialingStores++;
      } else if (subStatus === "grace_period" || subStatus === "past_due") {
        pastDueGraceStores++;
      } else if (["suspended", "cancelled", "expired", "archived"].includes(subStatus)) {
        churnedStores++;
        if (sub && sub.updatedAt >= thirtyDaysAgoUtc) recentChurn30d++;
      }

      // Intelligence Feed 1: Upsell Leads (>=80% quota usage on active/trial stores)
      if (sub && ["active", "trialing"].includes(subStatus)) {
        const customLim = parseCustomLimitsJson(sub.customLimitsJson);
        const maxBr = customLim.maxBranches ?? sub.plan.maxBranches;
        const maxSt = customLim.maxStaffUsers ?? sub.plan.maxStaffUsers;
        const maxMed = customLim.maxMedicines ?? sub.plan.maxMedicines;
        const maxInv = customLim.maxMonthlyInvoices ?? sub.plan.maxMonthlyInvoices;
        const maxSup = customLim.maxSuppliers ?? sub.plan.maxSuppliers;
        const maxCust = customLim.maxCustomers ?? sub.plan.maxCustomers;

        const usedBr = branchCountByStore.get(store.id) || 0;
        const usedSt = staffCountByStore.get(store.id) || 0;
        const usedMed = medCountByStore.get(store.id) || 0;
        const usedInv = monthlyInvByStore.get(store.id) || 0;
        const usedSup = supCountByStore.get(store.id) || 0;
        const usedCust = custCountByStore.get(store.id) || 0;

        const triggers: string[] = [];
        let maxPct = 0;
        const checkRatio = (label: string, used: number, lim: number) => {
          if (lim > 0 && used / lim >= 0.8) {
            const pct = Math.min(999, Math.round((used / lim) * 100));
            if (pct > maxPct) maxPct = pct;
            triggers.push(`${label}: ${used}/${lim} (${pct}%)`);
          }
        };
        checkRatio("Branches", usedBr, maxBr);
        checkRatio("Staff", usedSt, maxSt);
        checkRatio("Medicines", usedMed, maxMed);
        checkRatio("Monthly Bills", usedInv, maxInv);
        checkRatio("Suppliers", usedSup, maxSup);
        checkRatio("Customers", usedCust, maxCust);

        if (triggers.length > 0) {
          upsellLeads.push({
            storeId: store.id,
            storeName: store.storeName || `Store #${store.id}`,
            planName: sub.plan.name,
            triggers,
            maxUsagePct: maxPct,
          });
        }
      }

      // Intelligence Feed 2: Churn Risk & Inactivity Alerts
      if (subStatus === "grace_period" || subStatus === "past_due") {
        atRiskAlerts.push({
          storeId: store.id,
          storeName: store.storeName || `Store #${store.id}`,
          severity: "urgent",
          category: "Payment Retry / Grace Period",
          reason: sub?.graceEndsAt
            ? `Payment failed — grace window expires ${sub.graceEndsAt.toLocaleDateString("en-IN")}`
            : "Subscription renewal overdue in grace period",
        });
      } else if (
        subStatus === "trialing" &&
        sub?.trialEndsAt &&
        sub.trialEndsAt >= now &&
        sub.trialEndsAt <= seventyTwoHoursAhead
      ) {
        const hrs = Math.max(1, Math.round((sub.trialEndsAt.getTime() - now.getTime()) / 3_600_000));
        atRiskAlerts.push({
          storeId: store.id,
          storeName: store.storeName || `Store #${store.id}`,
          severity: "warning",
          category: "Trial Expiring <= 72h",
          reason: `Free trial ends in ${hrs} hour(s) without paid conversion`,
        });
      } else if (store.setupDone && ["active", "trialing"].includes(subStatus)) {
        const lastSale = lastSaleByStore.get(store.id);
        if (!lastSale || lastSale < fourteenDaysAgo) {
          atRiskAlerts.push({
            storeId: store.id,
            storeName: store.storeName || `Store #${store.id}`,
            severity: "warning",
            category: "0 POS Sales (14+ Days)",
            reason: lastSale
              ? `No POS checkout since ${lastSale.toLocaleDateString("en-IN")}`
              : "Setup finalized but zero POS bills recorded yet",
          });
        }
      }
    }

    mrr = Math.round(mrr * 100) / 100;
    const arr = Math.round(mrr * 12 * 100) / 100;
    const arpu = activePaidStores > 0 ? Math.round((mrr / activePaidStores) * 100) / 100 : 0;

    // Conversion & Monthly Logo Churn %
    const conversionDenominator = new Set([...storeHadTrial, ...storeHasConvertedPaid]).size || stores.length;
    const trialToPaidConversionPct =
      conversionDenominator > 0
        ? Math.round((storeHasConvertedPaid.size / conversionDenominator) * 1000) / 10
        : 0;
    const churnBase = activePaidStores + recentChurn30d;
    const monthlyChurnRatePct =
      churnBase > 0 ? Math.round((recentChurn30d / churnBase) * 1000) / 10 : 0;

    // Net Collected Revenue (Captured minus Refunded: MTD & All-Time)
    let mtdPreGst = 0;
    let mtdGst = 0;
    let mtdTotal = 0;
    let allTimePreGst = 0;
    let allTimeGst = 0;
    let allTimeTotal = 0;
    let pay30dSuccess = 0;
    let pay30dFailed = 0;

    for (const p of allPayments) {
      const ts = p.paidAt || p.createdAt;
      const sign = p.status === "captured" ? 1 : p.status === "refunded" ? -1 : 0;
      if (sign !== 0) {
        allTimePreGst += sign * Number(p.amountSubtotal);
        allTimeGst += sign * Number(p.gstAmount);
        allTimeTotal += sign * Number(p.totalAmount);
        if (ts >= monthStartUtc) {
          mtdPreGst += sign * Number(p.amountSubtotal);
          mtdGst += sign * Number(p.gstAmount);
          mtdTotal += sign * Number(p.totalAmount);
        }
      }
      if (p.createdAt >= thirtyDaysAgoUtc) {
        if (p.status === "captured") pay30dSuccess++;
        else if (p.status === "failed") pay30dFailed++;
      }
    }

    const paymentSuccessRatePct =
      pay30dSuccess + pay30dFailed > 0
        ? Math.round((pay30dSuccess / (pay30dSuccess + pay30dFailed)) * 1000) / 10
        : 100;

    const webhookErrors = recentWebhooks.filter((w) => Boolean(w.errorMessage) || !w.processed).length;

    return NextResponse.json({
      success: true,
      financialKpis: {
        mrr,
        arr,
        arpu,
        mtdCollected: {
          preGst: Math.round(mtdPreGst * 100) / 100,
          gst: Math.round(mtdGst * 100) / 100,
          total: Math.round(mtdTotal * 100) / 100,
        },
        allTimeCollected: {
          preGst: Math.round(allTimePreGst * 100) / 100,
          gst: Math.round(allTimeGst * 100) / 100,
          total: Math.round(allTimeTotal * 100) / 100,
        },
        totalStores: stores.length,
        activePaidStores,
        trialingStores,
        pastDueGraceStores,
        churnedStores,
        trialToPaidConversionPct,
        monthlyChurnRatePct,
      },
      operationalPulse: {
        gmvToday: Number(todaySalesAgg._sum.grandTotal || 0),
        invoicesToday: todaySalesAgg._count._all,
        gmv30d: Number(thirtyDaySalesAgg._sum.grandTotal || 0),
        invoices30d: thirtyDaySalesAgg._count._all,
        gmvAllTime: Number(allTimeSalesAgg._sum.grandTotal || 0),
        totalRetailInvoices: allTimeSalesAgg._count._all,
        totalRxUploads: rxUploadsCount,
        paymentSuccessRatePct,
        pay30dSuccess,
        pay30dFailed,
        webhookHealth: {
          status: webhookErrors === 0 ? "healthy" : "attention",
          recentCount: recentWebhooks.length,
          errorCount: webhookErrors,
          lastEventAt: recentWebhooks[0]?.createdAt || null,
        },
      },
      planDistribution: Array.from(planShareMap.values()).map((row) => ({
        ...row,
        mrr: Math.round(row.mrr * 100) / 100,
      })),
      feeds: {
        upsellLeads: upsellLeads.sort((a, b) => b.maxUsagePct - a.maxUsagePct).slice(0, 10),
        atRiskAlerts: atRiskAlerts.slice(0, 12),
        recentPayments: allPayments.slice(0, 8).map((p) => ({
          id: p.id,
          invoiceNo: p.invoiceNo,
          storeId: p.storeId,
          storeName: p.store?.storeName || `Store #${p.storeId}`,
          planName: p.plan?.name || p.plan?.code,
          totalAmount: Number(p.totalAmount),
          status: p.status,
          createdAt: p.createdAt,
        })),
        recentStores: stores.slice(0, 6),
        recentAuditLogs: recentPlatformEvents,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/dashboard Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load CEO executive dashboard" },
      { status: 500 }
    );
  }
}
