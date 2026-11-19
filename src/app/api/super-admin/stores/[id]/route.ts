import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { hashPassword, verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logAudit, logPlatformAudit } from "@/lib/audit";
import { getBatchPurchaseCost } from "@/lib/reports";
import { PRESCRIPTION_STORAGE_DIR } from "@/lib/prescriptionFiles";
import { invalidateStoreEntitlements } from "@/lib/entitlements";
import {
  calculateSaasTaxFromSubtotal,
  generateNextSubscriptionInvoiceNo,
} from "@/lib/razorpay";
import {
  SAAS_FEATURE_REGISTRY,
  parseCustomFeaturesJson,
  parseCustomLimitsJson,
  parseFeaturesJson,
} from "@/lib/saasFeatures";

/**
 * MODULE 3.3.2: Single-Store 360° Inspection & Lifecycle Control API (`/api/super-admin/stores/[id]`)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const storeId = parseInt(rawId, 10);
  if (!storeId || isNaN(storeId)) {
    return NextResponse.json({ success: false, message: "Invalid store ID" }, { status: 400 });
  }

  try {
    const store = await prisma.settings.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ success: false, message: "Store not found" }, { status: 404 });
    }

    const now = new Date();
    const todayStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const thirtyDaysAgoUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
      branches,
      staffUsers,
      subscriptions,
      payments,
      allBatches,
      sales30dByBranch,
      latestClosings,
      todayAgg,
      thirtyDayAgg,
      allTimeAgg,
      monthlyInvoiceCount,
      medCount,
      supCount,
      custCount,
      discCount,
      rxFiles,
      storeAuditLogs,
      platformAuditLogs,
      recentMedicines,
      recentSales,
      recentPOs,
      recentExpenses,
      allPlans,
    ] = await Promise.all([
      prisma.branch.findMany({
        where: { storeId },
        orderBy: [{ isMain: "desc" }, { id: "asc" }],
      }),
      prisma.user.findMany({
        where: { storeId },
        orderBy: [{ active: "desc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          branchId: true,
          active: true,
          lastLogin: true,
          createdAt: true,
          branch: { select: { id: true, code: true, name: true } },
        },
      }),
      prisma.storeSubscription.findMany({
        where: { storeId },
        orderBy: { id: "desc" },
        include: { plan: true },
        take: 10,
      }),
      prisma.subscriptionPayment.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        include: { plan: { select: { name: true, code: true } } },
        take: 25,
      }),
      prisma.batch.findMany({
        where: { branch: { storeId } },
        select: { id: true, branchId: true, quantity: true, purchasePrice: true, mrp: true, expiryDate: true },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { branch: { storeId }, saleDate: { gte: thirtyDaysAgoUtc } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.cashDrawerClosing.findMany({
        where: { storeId },
        orderBy: { shiftEnd: "desc" },
        take: 30,
        select: { id: true, branchId: true, closingNumber: true, shiftEnd: true, status: true, difference: true },
      }),
      prisma.sale.aggregate({
        where: { branch: { storeId }, saleDate: { gte: todayStartUtc } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: { branch: { storeId }, saleDate: { gte: thirtyDaysAgoUtc } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.sale.aggregate({
        where: { branch: { storeId } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.sale.count({
        where: { branch: { storeId }, saleDate: { gte: monthStartUtc } },
      }),
      prisma.medicine.count({ where: { storeId } }),
      prisma.supplier.count({ where: { storeId } }),
      prisma.customer.count({ where: { storeId } }),
      prisma.discount.count({ where: { storeId, active: true } }),
      prisma.patientMessage.findMany({
        where: { storeId, filePath: { not: null } },
        select: { filePath: true },
        take: 500,
      }),
      prisma.auditLog.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { name: true, username: true } },
          branch: { select: { code: true, name: true } },
        },
      }),
      prisma.platformAuditLog.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: { platformUser: { select: { name: true, role: true } } },
      }),
      prisma.medicine.findMany({
        where: { storeId },
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: {
          id: true,
          name: true,
          genericName: true,
          company: true,
          category: true,
          scheduleType: true,
          gstPercent: true,
          batches: {
            where: { branch: { storeId } },
            select: { quantity: true, expiryDate: true },
          },
        },
      }),
      prisma.sale.findMany({
        where: { branch: { storeId } },
        orderBy: [{ saleDate: "desc" }, { id: "desc" }],
        take: 25,
        include: {
          branch: { select: { code: true, name: true } },
          customer: { select: { name: true, phone: true } },
        },
      }),
      prisma.purchaseOrder.findMany({
        where: { branch: { storeId } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          supplier: { select: { name: true } },
          branch: { select: { code: true, name: true } },
        },
      }),
      prisma.expense.findMany({
        where: { storeId },
        orderBy: { expenseDate: "desc" },
        take: 20,
      }),
      prisma.subscriptionPlan.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { priceInr: "asc" }],
        select: { id: true, code: true, name: true, priceInr: true, billingCycle: true },
      }),
    ]);

    // Compute per-branch metrics
    const stockValByBranch = new Map<number, number>();
    const skuCountByBranch = new Map<number, number>();
    let totalInventoryCost = 0;

    for (const b of allBatches) {
      const cost = getBatchPurchaseCost(b, b.mrp) * Math.max(0, b.quantity);
      totalInventoryCost += cost;
      if (b.branchId) {
        stockValByBranch.set(b.branchId, (stockValByBranch.get(b.branchId) || 0) + cost);
        if (b.quantity > 0) {
          skuCountByBranch.set(b.branchId, (skuCountByBranch.get(b.branchId) || 0) + 1);
        }
      }
    }

    const sales30dMap = new Map<number, { revenue: number; count: number }>();
    sales30dByBranch.forEach((row) => {
      if (row.branchId) {
        sales30dMap.set(row.branchId, {
          revenue: Math.round(Number(row._sum.grandTotal || 0) * 100) / 100,
          count: row._count._all,
        });
      }
    });

    const lastClosingMap = new Map<number, (typeof latestClosings)[number]>();
    for (const c of latestClosings) {
      if (c.branchId && !lastClosingMap.has(c.branchId)) {
        lastClosingMap.set(c.branchId, c);
      }
    }

    const staffCountByBranch = new Map<number, number>();
    for (const u of staffUsers) {
      if (u.branchId && u.active) {
        staffCountByBranch.set(u.branchId, (staffCountByBranch.get(u.branchId) || 0) + 1);
      }
    }

    // Rx Storage on disk
    let rxBytes = 0;
    for (const f of rxFiles) {
      if (!f.filePath) continue;
      try {
        const fp = path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(f.filePath));
        if (fp.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep) && fs.existsSync(fp)) {
          rxBytes += fs.statSync(fp).size;
        }
      } catch {
        // Ignore missing disk entries
      }
    }
    const rxStorageMb = Math.round((rxBytes / (1024 * 1024)) * 100) / 100;

    const currentSub = subscriptions[0] || null;
    const planFeatures = currentSub ? parseFeaturesJson(currentSub.plan.featuresJson) : null;
    const customFeatures = parseCustomFeaturesJson(currentSub?.customFeaturesJson);
    const customLimits = parseCustomLimitsJson(currentSub?.customLimitsJson);
    const effectiveFeatures = planFeatures ? { ...planFeatures, ...customFeatures } : null;

    const limits = {
      maxBranches: customLimits.maxBranches ?? currentSub?.plan.maxBranches ?? -1,
      maxStaffUsers: customLimits.maxStaffUsers ?? currentSub?.plan.maxStaffUsers ?? -1,
      maxMedicines: customLimits.maxMedicines ?? currentSub?.plan.maxMedicines ?? -1,
      maxMonthlyInvoices: customLimits.maxMonthlyInvoices ?? currentSub?.plan.maxMonthlyInvoices ?? -1,
      maxSuppliers: customLimits.maxSuppliers ?? currentSub?.plan.maxSuppliers ?? -1,
      maxRxStorageMb: customLimits.maxRxStorageMb ?? currentSub?.plan.maxRxStorageMb ?? -1,
      maxCustomers: customLimits.maxCustomers ?? currentSub?.plan.maxCustomers ?? -1,
      maxDiscountSchemes: customLimits.maxDiscountSchemes ?? currentSub?.plan.maxDiscountSchemes ?? -1,
    };

    const activeStaffCount = staffUsers.filter((u) => u.active).length;

    return NextResponse.json({
      success: true,
      overview: {
        id: store.id,
        storeName: store.storeName,
        storeAddress: store.storeAddress,
        storePhone: store.storePhone,
        storeEmail: store.storeEmail,
        storeGst: store.storeGst,
        storeDl: store.storeDl,
        currency: store.currency,
        lowQty: store.lowQty,
        expiryDays: store.expiryDays,
        emailProvider: store.emailProvider,
        hasSendgrid: Boolean(store.sendgridKey),
        hasSmtp: Boolean(store.smtpHost && store.smtpUser),
        storeStatus: store.storeStatus,
        suspensionReason: store.suspensionReason,
        suspendedAt: store.suspendedAt,
        ownerName: store.ownerName,
        ownerEmail: store.ownerEmail,
        city: store.city,
        state: store.state,
        setupDone: store.setupDone,
        createdAt: store.createdAt,
        kpis: {
          revenueToday: Number(todayAgg._sum.grandTotal || 0),
          invoicesToday: todayAgg._count._all,
          revenue30d: Number(thirtyDayAgg._sum.grandTotal || 0),
          invoices30d: thirtyDayAgg._count._all,
          revenueAllTime: Number(allTimeAgg._sum.grandTotal || 0),
          invoicesAllTime: allTimeAgg._count._all,
          inventoryCostValue: Math.round(totalInventoryCost * 100) / 100,
        },
      },
      branches: branches.map((b) => ({
        ...b,
        staffCount: staffCountByBranch.get(b.id) || 0,
        batchSkuCount: skuCountByBranch.get(b.id) || 0,
        stockValue: Math.round((stockValByBranch.get(b.id) || 0) * 100) / 100,
        sales30d: sales30dMap.get(b.id)?.revenue || 0,
        invoices30d: sales30dMap.get(b.id)?.count || 0,
        lastClosing: lastClosingMap.get(b.id) || null,
      })),
      staff: staffUsers,
      subscription: {
        current: currentSub
          ? {
              ...currentSub,
              plan: { ...currentSub.plan, priceInr: Number(currentSub.plan.priceInr) },
              effectiveFeatures,
              customFeatures,
              customLimits,
              limits,
            }
          : null,
        history: subscriptions.map((s) => ({
          id: s.id,
          planName: s.plan.name,
          planCode: s.plan.code,
          status: s.status,
          billingMode: s.billingMode,
          currentPeriodStart: s.currentPeriodStart,
          currentPeriodEnd: s.currentPeriodEnd,
        })),
        usageMeters: [
          { key: "maxBranches", label: "Store Branches", used: branches.length, limit: limits.maxBranches },
          { key: "maxStaffUsers", label: "Active Staff", used: activeStaffCount, limit: limits.maxStaffUsers },
          { key: "maxMedicines", label: "Medicine SKUs", used: medCount, limit: limits.maxMedicines },
          { key: "maxMonthlyInvoices", label: "Monthly Invoices", used: monthlyInvoiceCount, limit: limits.maxMonthlyInvoices },
          { key: "maxSuppliers", label: "Suppliers", used: supCount, limit: limits.maxSuppliers },
          { key: "maxRxStorageMb", label: "Rx Storage (MB)", used: rxStorageMb, limit: limits.maxRxStorageMb },
          { key: "maxCustomers", label: "Patients Registry", used: custCount, limit: limits.maxCustomers },
          { key: "maxDiscountSchemes", label: "Active Discounts", used: discCount, limit: limits.maxDiscountSchemes },
        ],
        payments: payments.map((p) => ({
          ...p,
          amountSubtotal: Number(p.amountSubtotal),
          gstAmount: Number(p.gstAmount),
          totalAmount: Number(p.totalAmount),
        })),
        featureRegistry: SAAS_FEATURE_REGISTRY,
      },
      audit: {
        storeAuditLogs,
        platformAuditLogs,
      },
      operations: {
        recentMedicines: recentMedicines.map((m) => ({
          id: m.id,
          name: m.name,
          genericName: m.genericName,
          company: m.company,
          category: m.category,
          scheduleType: m.scheduleType,
          gstPercent: Number(m.gstPercent),
          totalStock: m.batches.reduce((acc, b) => acc + b.quantity, 0),
        })),
        recentSales: recentSales.map((s) => ({
          id: s.id,
          invoiceNo: s.invoiceNo,
          saleDate: s.saleDate,
          grandTotal: Number(s.grandTotal),
          paymentMethod: s.paymentMethod,
          branchName: s.branch?.name || "-",
          customerName: s.customer?.name || "Walk-in",
        })),
        recentPOs: recentPOs.map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          poDate: po.poDate,
          status: po.status,
          total: Number(po.total),
          supplierName: po.supplier?.name || "-",
          branchName: po.branch?.name || "-",
        })),
        recentExpenses: recentExpenses.map((e) => ({
          id: e.id,
          voucherNo: e.voucherNo,
          type: e.type,
          category: e.category,
          title: e.title,
          amount: Number(e.amount),
          expenseDate: e.expenseDate,
        })),
      },
      plans: allPlans.map((p) => ({ ...p, priceInr: Number(p.priceInr) })),
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/stores/[id] Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load store workspace" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const storeId = parseInt(rawId, 10);
  if (!storeId || isNaN(storeId)) {
    return NextResponse.json({ success: false, message: "Invalid store ID" }, { status: 400 });
  }

  const ip = getClientIp(req);

  try {
    const store = await prisma.settings.findUnique({ where: { id: storeId } });
    if (!store) {
      return NextResponse.json({ success: false, message: "Store not found" }, { status: 404 });
    }

    const body = await req.json();
    const action = String(body.action || "").toLowerCase();

    if (action === "set_status") {
      const nextStatus = String(body.storeStatus || "").toLowerCase();
      if (!["active", "trialing", "grace_period", "suspended", "archived"].includes(nextStatus)) {
        return NextResponse.json({ success: false, message: "Invalid storeStatus." }, { status: 400 });
      }
      const reason = body.reason ? String(body.reason).trim() : null;
      if (nextStatus === "suspended" && (!reason || reason.length < 3)) {
        return NextResponse.json(
          { success: false, message: "A suspension reason is required." },
          { status: 400 }
        );
      }

      const updated = await prisma.settings.update({
        where: { id: storeId },
        data: {
          storeStatus: nextStatus,
          suspensionReason: nextStatus === "suspended" ? reason : nextStatus === "active" ? null : store.suspensionReason,
          suspendedAt: nextStatus === "suspended" ? new Date() : nextStatus === "active" ? null : store.suspendedAt,
        },
      });

      const latestSub = await prisma.storeSubscription.findFirst({
        where: { storeId },
        orderBy: { id: "desc" },
      });
      if (latestSub && ["suspended", "grace_period", "active"].includes(nextStatus)) {
        await prisma.storeSubscription.update({
          where: { id: latestSub.id },
          data: { status: nextStatus },
        });
      }

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: `STORE_STATUS_${nextStatus.toUpperCase()}`,
        entity: "settings",
        entityId: storeId,
        details: { storeName: store.storeName, nextStatus, reason },
        ipAddress: ip,
      });

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({ success: true, storeStatus: updated.storeStatus });
    }

    if (action === "extend_trial") {
      const days = parseInt(String(body.days || "14"), 10);
      if (isNaN(days) || days < 1 || days > 365) {
        return NextResponse.json({ success: false, message: "Trial extension must be between 1 and 365 days." }, { status: 400 });
      }

      let latestSub = await prisma.storeSubscription.findFirst({
        where: { storeId },
        orderBy: { id: "desc" },
      });

      const now = new Date();
      if (!latestSub) {
        let trialPlan = await prisma.subscriptionPlan.findUnique({ where: { code: "FREE_TRIAL" } });
        if (!trialPlan) {
          trialPlan = await prisma.subscriptionPlan.findFirst({ where: { isActive: true }, orderBy: { priceInr: "asc" } });
        }
        if (!trialPlan) {
          return NextResponse.json(
            { success: false, message: "No Subscription Plans exist yet. Seed plans first." },
            { status: 400 }
          );
        }
        const nextEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        latestSub = await prisma.storeSubscription.create({
          data: {
            storeId,
            planId: trialPlan.id,
            status: "trialing",
            billingMode: "manual_grant",
            currentPeriodStart: now,
            currentPeriodEnd: nextEnd,
            trialEndsAt: nextEnd,
            grantedByPlatformUserId: auth.session.platformUserId,
            notes: `Trial granted by ${auth.session.name}`,
          },
        });
      } else {
        const base = latestSub.currentPeriodEnd > now ? latestSub.currentPeriodEnd : now;
        const nextEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        latestSub = await prisma.storeSubscription.update({
          where: { id: latestSub.id },
          data: {
            status: "trialing",
            currentPeriodEnd: nextEnd,
            trialEndsAt: nextEnd,
          },
        });
      }

      await prisma.settings.update({
        where: { id: storeId },
        data: { storeStatus: "trialing", suspensionReason: null, suspendedAt: null },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "STORE_TRIAL_EXTENDED",
        entity: "store_subscriptions",
        entityId: latestSub.id,
        details: { days, newEnd: latestSub.currentPeriodEnd.toISOString() },
        ipAddress: ip,
      });

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({ success: true, subscription: latestSub });
    }

    if (action === "grant_plan") {
      const planId = parseInt(String(body.planId || ""), 10);
      const durationDays = parseInt(String(body.durationDays || "30"), 10);
      const notes = body.notes ? String(body.notes).trim() : `Manual plan grant by ${auth.session.name}`;

      if (!planId || isNaN(planId) || isNaN(durationDays) || durationDays < 1) {
        return NextResponse.json({ success: false, message: "Valid planId and durationDays are required." }, { status: 400 });
      }
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        return NextResponse.json({ success: false, message: "Selected plan not found." }, { status: 404 });
      }

      const now = new Date();
      const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const sub = await prisma.storeSubscription.create({
        data: {
          storeId,
          planId: plan.id,
          status: plan.code === "FREE_TRIAL" ? "trialing" : "active",
          billingMode: "manual_grant",
          currentPeriodStart: now,
          currentPeriodEnd: endDate,
          trialEndsAt: plan.code === "FREE_TRIAL" ? endDate : null,
          grantedByPlatformUserId: auth.session.platformUserId,
          notes,
        },
      });

      await prisma.settings.update({
        where: { id: storeId },
        data: {
          storeStatus: plan.code === "FREE_TRIAL" ? "trialing" : "active",
          suspensionReason: null,
          suspendedAt: null,
        },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "STORE_PLAN_GRANTED",
        entity: "store_subscriptions",
        entityId: sub.id,
        details: { planCode: plan.code, planName: plan.name, durationDays, notes },
        ipAddress: ip,
      });

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({ success: true, subscription: sub });
    }

    if (action === "set_overrides") {
      const latestSub = await prisma.storeSubscription.findFirst({
        where: { storeId },
        orderBy: { id: "desc" },
      });
      if (!latestSub) {
        return NextResponse.json(
          { success: false, message: "Store has no subscription record yet. Grant a plan first." },
          { status: 400 }
        );
      }

      const customLimitsJson = body.customLimits ? JSON.stringify(body.customLimits) : null;
      const customFeaturesJson = body.customFeatures ? JSON.stringify(body.customFeatures) : null;

      const updated = await prisma.storeSubscription.update({
        where: { id: latestSub.id },
        data: { customLimitsJson, customFeaturesJson },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "STORE_ENTITLEMENT_OVERRIDES_UPDATED",
        entity: "store_subscriptions",
        entityId: updated.id,
        details: { hasLimitOverrides: Boolean(customLimitsJson), hasFeatureOverrides: Boolean(customFeaturesJson) },
        ipAddress: ip,
      });

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({ success: true, subscription: updated });
    }

    if (action === "extend_grace") {
      const days = Math.min(90, Math.max(1, parseInt(String(body.days || "7"), 10) || 7));
      const latestSub = await prisma.storeSubscription.findFirst({
        where: { storeId },
        orderBy: { id: "desc" },
      });
      if (!latestSub) {
        return NextResponse.json(
          { success: false, message: "No subscription record found for this store." },
          { status: 400 }
        );
      }

      const now = new Date();
      const baseGrace =
        latestSub.graceEndsAt && latestSub.graceEndsAt > now ? latestSub.graceEndsAt : now;
      const nextGrace = new Date(baseGrace.getTime() + days * 24 * 60 * 60 * 1000);

      const updatedSub = await prisma.storeSubscription.update({
        where: { id: latestSub.id },
        data: { status: "grace_period", graceEndsAt: nextGrace },
      });
      await prisma.settings.update({
        where: { id: storeId },
        data: { storeStatus: "grace_period", suspensionReason: null, suspendedAt: null },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "STORE_GRACE_EXTENDED",
        entity: "store_subscriptions",
        entityId: updatedSub.id,
        details: { days, graceEndsAt: nextGrace.toISOString() },
        ipAddress: ip,
      });

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({ success: true, subscription: updatedSub });
    }

    if (action === "record_offline_payment") {
      const planId = parseInt(String(body.planId || ""), 10);
      const amountSubtotalRaw = Number(body.amountSubtotal ?? NaN);
      const durationDays = Math.max(1, parseInt(String(body.durationDays || "365"), 10) || 365);
      const paymentMethod = String(body.paymentMethod || "neft").toLowerCase();
      const referenceNo = body.referenceNo ? String(body.referenceNo).trim() : null;
      const activatePlan = body.activatePlan !== false;

      if (!planId || isNaN(planId)) {
        return NextResponse.json({ success: false, message: "Valid planId is required." }, { status: 400 });
      }
      const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!plan) {
        return NextResponse.json({ success: false, message: "Selected plan not found." }, { status: 404 });
      }

      const subtotalInr = Number.isFinite(amountSubtotalRaw) && amountSubtotalRaw >= 0
        ? amountSubtotalRaw
        : Number(plan.priceInr);
      const tax = calculateSaasTaxFromSubtotal(subtotalInr, 18);
      const now = new Date();

      const recorded = await runInTransaction(async (tx) => {
        let subscription = await tx.storeSubscription.findFirst({
          where: { storeId },
          orderBy: { id: "desc" },
        });

        if (activatePlan || !subscription) {
          const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
          subscription = await tx.storeSubscription.create({
            data: {
              storeId,
              planId: plan.id,
              status: "active",
              billingMode: "manual_grant",
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              grantedByPlatformUserId: auth.session!.platformUserId,
              notes: referenceNo
                ? `Offline ${paymentMethod.toUpperCase()} Ref: ${referenceNo}`
                : `Offline contract by ${auth.session!.name}`,
            },
          });
          await tx.settings.update({
            where: { id: storeId },
            data: { storeStatus: "active", suspensionReason: null, suspendedAt: null },
          });
        }

        const invoiceNo = await generateNextSubscriptionInvoiceNo(tx);
        const payment = await tx.subscriptionPayment.create({
          data: {
            subscriptionId: subscription.id,
            storeId,
            planId: plan.id,
            invoiceNo,
            amountSubtotal: tax.amountSubtotal,
            gstPercent: tax.gstPercent,
            gstAmount: tax.gstAmount,
            totalAmount: tax.totalAmount,
            currency: "INR",
            paymentType: "manual_offline",
            status: "captured",
            razorpayOrderId: referenceNo,
            paymentMethod,
            paidAt: now,
          },
        });

        return { subscription, payment };
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "OFFLINE_SUBSCRIPTION_PAYMENT_RECORDED",
        entity: "subscription_payments",
        entityId: recorded.payment.id,
        details: {
          planCode: plan.code,
          invoiceNo: recorded.payment.invoiceNo,
          paymentMethod,
          referenceNo,
          totalAmount: Number(recorded.payment.totalAmount),
        },
        ipAddress: ip,
      });

      invalidateStoreEntitlements(storeId);
      return NextResponse.json({
        success: true,
        payment: {
          ...recorded.payment,
          amountSubtotal: Number(recorded.payment.amountSubtotal),
          gstAmount: Number(recorded.payment.gstAmount),
          totalAmount: Number(recorded.payment.totalAmount),
        },
        invoiceNo: recorded.payment.invoiceNo,
      });
    }

    if (action === "mark_payment_refunded") {
      const paymentId = parseInt(String(body.paymentId || ""), 10);
      const refundReason = body.reason ? String(body.reason).trim() : "Marked refunded by Platform CEO";
      if (!paymentId || isNaN(paymentId)) {
        return NextResponse.json({ success: false, message: "Valid paymentId is required." }, { status: 400 });
      }
      const existingPay = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
      if (!existingPay || existingPay.storeId !== storeId) {
        return NextResponse.json({ success: false, message: "Payment record not found for store." }, { status: 404 });
      }
      const updatedPay = await prisma.subscriptionPayment.update({
        where: { id: paymentId },
        data: { status: "refunded", failureReason: refundReason },
      });

      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId,
        action: "SUBSCRIPTION_PAYMENT_REFUNDED",
        entity: "subscription_payments",
        entityId: paymentId,
        details: { invoiceNo: existingPay.invoiceNo, reason: refundReason },
        ipAddress: ip,
      });

      return NextResponse.json({ success: true, payment: updatedPay });
    }

    if (action === "toggle_branch_active") {
      const branchId = parseInt(String(body.branchId || ""), 10);
      const active = Boolean(body.active);
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch || branch.storeId !== storeId) {
        return NextResponse.json({ success: false, message: "Branch not found in this store." }, { status: 404 });
      }
      if (branch.isMain && !active) {
        return NextResponse.json({ success: false, message: "Primary MAIN branch cannot be deactivated." }, { status: 400 });
      }
      const updated = await prisma.branch.update({
        where: { id: branchId },
        data: { active },
      });
      await Promise.all([
        logPlatformAudit({
          platformUserId: auth.session.platformUserId,
          storeId,
          action: active ? "STORE_BRANCH_ACTIVATED" : "STORE_BRANCH_DEACTIVATED",
          entity: "branches",
          entityId: branchId,
          details: { branchCode: branch.code, branchName: branch.name },
          ipAddress: ip,
        }),
        logAudit({
          storeId,
          branchId,
          action: "BRANCH_UPDATED",
          entity: "branches",
          entityId: branchId,
          details: { active, byPlatformSupport: auth.session.name },
          ipAddress: ip,
        }),
      ]);
      return NextResponse.json({ success: true, branch: updated });
    }

    if (action === "toggle_user_active" || action === "reset_staff_password") {
      const userId = parseInt(String(body.userId || ""), 10);
      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target || target.storeId !== storeId) {
        return NextResponse.json({ success: false, message: "Staff user not found in this store." }, { status: 404 });
      }
      if (action === "toggle_user_active") {
        const active = Boolean(body.active);
        const updated = await prisma.user.update({ where: { id: userId }, data: { active } });
        await logPlatformAudit({
          platformUserId: auth.session.platformUserId,
          storeId,
          action: active ? "STORE_USER_ACTIVATED" : "STORE_USER_DEACTIVATED",
          entity: "users",
          entityId: userId,
          details: { username: target.username },
          ipAddress: ip,
        });
        return NextResponse.json({ success: true, userId: updated.id, active: updated.active });
      } else {
        const newPassword = String(body.newPassword || "");
        if (newPassword.length < 6) {
          return NextResponse.json({ success: false, message: "Password min 6 chars." }, { status: 400 });
        }
        const pwHash = await hashPassword(newPassword);
        await prisma.user.update({ where: { id: userId }, data: { password: pwHash } });
        await logPlatformAudit({
          platformUserId: auth.session.platformUserId,
          storeId,
          action: "STORE_USER_PASSWORD_RESET_BY_SUPPORT",
          entity: "users",
          entityId: userId,
          details: { username: target.username },
          ipAddress: ip,
        });
        return NextResponse.json({ success: true, message: `Password reset for ${target.username}` });
      }
    }

    return NextResponse.json({ success: false, message: "Unknown lifecycle action." }, { status: 400 });
  } catch (err: any) {
    console.error("[PATCH /api/super-admin/stores/[id] Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update store" },
      { status: 500 }
    );
  }
}
