import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { parseCustomLimitsJson } from "@/lib/saasFeatures";

/**
 * MODULE 3.3.1: Stores Directory & Lifecycle Summary API (`/api/super-admin/stores`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") || "all").toLowerCase();
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const includeDrafts = searchParams.get("includeDrafts") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10) || 25));

  try {
    const now = new Date();
    const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgoUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0)
    );
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    const [
      allStores,
      allBranches,
      staffGroups,
      medicineGroups,
      supplierGroups,
      customerGroups,
      subscriptions,
      sales30dByBranch,
      monthlySalesByBranch,
      lastSaleByBranch,
      plans,
    ] = await Promise.all([
      prisma.settings.findMany({
        where: includeDrafts
          ? undefined
          : { OR: [{ setupDone: true }, { branches: { some: {} } }] },
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          storeName: true,
          storeEmail: true,
          storePhone: true,
          storeGst: true,
          storeDl: true,
          storeStatus: true,
          suspensionReason: true,
          suspendedAt: true,
          ownerName: true,
          ownerEmail: true,
          city: true,
          state: true,
          setupDone: true,
          createdAt: true,
        },
      }),
      prisma.branch.findMany({
        select: { id: true, storeId: true, active: true },
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
      prisma.storeSubscription.findMany({
        orderBy: [{ id: "desc" }],
        include: {
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              billingCycle: true,
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
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { branchId: { not: null }, saleDate: { gte: thirtyDaysAgoUtc } },
        _sum: { grandTotal: true },
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
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }],
        select: { id: true, code: true, name: true, priceInr: true, billingCycle: true },
      }),
    ]);

    const branchToStore = new Map<number, number>();
    const branchCountByStore = new Map<number, number>();
    for (const b of allBranches) {
      if (b.storeId) {
        branchToStore.set(b.id, b.storeId);
        branchCountByStore.set(b.storeId, (branchCountByStore.get(b.storeId) || 0) + 1);
      }
    }

    const staffCountByStore = new Map<number, number>();
    staffGroups.forEach((g) => {
      if (g.storeId) staffCountByStore.set(g.storeId, g._count._all);
    });

    const medCountByStore = new Map<number, number>();
    medicineGroups.forEach((g) => {
      if (g.storeId) medCountByStore.set(g.storeId, g._count._all);
    });

    const supCountByStore = new Map<number, number>();
    supplierGroups.forEach((g) => {
      if (g.storeId) supCountByStore.set(g.storeId, g._count._all);
    });

    const custCountByStore = new Map<number, number>();
    customerGroups.forEach((g) => {
      if (g.storeId) custCountByStore.set(g.storeId, g._count._all);
    });

    const latestSubByStore = new Map<number, (typeof subscriptions)[number]>();
    for (const sub of subscriptions) {
      if (!latestSubByStore.has(sub.storeId)) {
        latestSubByStore.set(sub.storeId, sub);
      }
    }

    const gmv30dByStore = new Map<number, number>();
    const invoices30dByStore = new Map<number, number>();
    sales30dByBranch.forEach((row) => {
      const sId = row.branchId ? branchToStore.get(row.branchId) : undefined;
      if (!sId) return;
      gmv30dByStore.set(sId, (gmv30dByStore.get(sId) || 0) + Number(row._sum.grandTotal || 0));
      invoices30dByStore.set(sId, (invoices30dByStore.get(sId) || 0) + row._count._all);
    });

    const monthlyInvoicesByStore = new Map<number, number>();
    monthlySalesByBranch.forEach((row) => {
      const sId = row.branchId ? branchToStore.get(row.branchId) : undefined;
      if (!sId) return;
      monthlyInvoicesByStore.set(sId, (monthlyInvoicesByStore.get(sId) || 0) + row._count._all);
    });

    const lastSaleByStore = new Map<number, Date>();
    lastSaleByBranch.forEach((row) => {
      const sId = row.branchId ? branchToStore.get(row.branchId) : undefined;
      const dt = row._max.createdAt;
      if (!sId || !dt) return;
      const prev = lastSaleByStore.get(sId);
      if (!prev || dt > prev) lastSaleByStore.set(sId, dt);
    });

    const enriched = allStores.map((s) => {
      const sub = latestSubByStore.get(s.id) || null;
      const overrides = parseCustomLimitsJson(sub?.customLimitsJson);

      const branchCount = branchCountByStore.get(s.id) || 0;
      const staffCount = staffCountByStore.get(s.id) || 0;
      const medicineCount = medCountByStore.get(s.id) || 0;
      const supplierCount = supCountByStore.get(s.id) || 0;
      const customerCount = custCountByStore.get(s.id) || 0;
      const monthlyInvoices = monthlyInvoicesByStore.get(s.id) || 0;
      const gmv30d = Math.round((gmv30dByStore.get(s.id) || 0) * 100) / 100;
      const lastSaleAt = lastSaleByStore.get(s.id) || null;

      const maxBranches = overrides.maxBranches ?? sub?.plan.maxBranches ?? -1;
      const maxStaffUsers = overrides.maxStaffUsers ?? sub?.plan.maxStaffUsers ?? -1;
      const maxMedicines = overrides.maxMedicines ?? sub?.plan.maxMedicines ?? -1;
      const maxMonthlyInvoices = overrides.maxMonthlyInvoices ?? sub?.plan.maxMonthlyInvoices ?? -1;
      const maxSuppliers = overrides.maxSuppliers ?? sub?.plan.maxSuppliers ?? -1;
      const maxCustomers = overrides.maxCustomers ?? sub?.plan.maxCustomers ?? -1;

      const nearQuota =
        (maxBranches > 0 && branchCount / maxBranches >= 0.8) ||
        (maxStaffUsers > 0 && staffCount / maxStaffUsers >= 0.8) ||
        (maxMedicines > 0 && medicineCount / maxMedicines >= 0.8) ||
        (maxMonthlyInvoices > 0 && monthlyInvoices / maxMonthlyInvoices >= 0.8) ||
        (maxSuppliers > 0 && supplierCount / maxSuppliers >= 0.8) ||
        (maxCustomers > 0 && customerCount / maxCustomers >= 0.8);

      const subStatus = sub?.status || (s.storeStatus === "suspended" ? "suspended" : "none");
      const isPaid = Boolean(sub && sub.status === "active" && Number(sub.plan.priceInr) > 0);
      const isTrial = Boolean(
        s.storeStatus === "trialing" || subStatus === "trialing"
      );
      const expiring7d = Boolean(
        sub?.currentPeriodEnd &&
          sub.currentPeriodEnd <= sevenDaysAhead &&
          sub.currentPeriodEnd >= now &&
          ["active", "trialing", "grace_period"].includes(subStatus)
      );
      const pastDueOrSuspended = Boolean(
        ["suspended", "archived"].includes(s.storeStatus) ||
          ["past_due", "grace_period", "suspended", "expired"].includes(subStatus)
      );
      const inactive14d = Boolean(
        s.setupDone && (!lastSaleAt || lastSaleAt < fourteenDaysAgo)
      );

      return {
        id: s.id,
        storeName: s.storeName || `Unnamed Store #${s.id}`,
        ownerName: s.ownerName,
        ownerEmail: s.ownerEmail || s.storeEmail,
        storePhone: s.storePhone,
        storeGst: s.storeGst,
        storeDl: s.storeDl,
        city: s.city,
        state: s.state,
        storeStatus: s.storeStatus,
        suspensionReason: s.suspensionReason,
        setupDone: s.setupDone,
        createdAt: s.createdAt.toISOString(),
        branchCount,
        staffCount,
        medicineCount,
        supplierCount,
        monthlyInvoices,
        gmv30d,
        lastSaleAt: lastSaleAt ? lastSaleAt.toISOString() : null,
        subscription: sub
          ? {
              id: sub.id,
              status: sub.status,
              billingMode: sub.billingMode,
              currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
              trialEndsAt: sub.trialEndsAt?.toISOString() || null,
              planId: sub.planId,
              planCode: sub.plan.code,
              planName: sub.plan.name,
              priceInr: Number(sub.plan.priceInr),
              limits: {
                maxBranches,
                maxStaffUsers,
                maxMedicines,
                maxMonthlyInvoices,
                maxSuppliers,
                maxCustomers,
              },
            }
          : null,
        flags: {
          isPaid,
          isTrial,
          expiring7d,
          nearQuota,
          pastDueOrSuspended,
          inactive14d,
        },
      };
    });

    const summary = {
      all: enriched.length,
      activePaid: enriched.filter((s) => s.flags.isPaid).length,
      trial: enriched.filter((s) => s.flags.isTrial).length,
      expiring7d: enriched.filter((s) => s.flags.expiring7d).length,
      nearQuota: enriched.filter((s) => s.flags.nearQuota).length,
      pastDueSuspended: enriched.filter((s) => s.flags.pastDueOrSuspended).length,
      inactive14d: enriched.filter((s) => s.flags.inactive14d).length,
    };

    const filtered = enriched.filter((s) => {
      if (search) {
        const hay = [s.storeName, s.ownerName, s.ownerEmail, s.storeGst, s.city, s.state, s.storePhone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(search)) return false;
      }
      switch (filter) {
        case "active_paid":
          return s.flags.isPaid;
        case "trial":
          return s.flags.isTrial;
        case "expiring_7d":
          return s.flags.expiring7d;
        case "near_quota":
          return s.flags.nearQuota;
        case "past_due_suspended":
          return s.flags.pastDueOrSuspended;
        case "inactive_14d":
          return s.flags.inactive14d;
        default:
          return true;
      }
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      stores: paginated,
      summary,
      plans: plans.map((p) => ({ ...p, priceInr: Number(p.priceInr) })),
      pagination: { total, page, limit, totalPages },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/stores Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load stores directory" },
      { status: 500 }
    );
  }
}
