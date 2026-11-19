import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getBatchPurchaseCost } from "@/lib/reports";

/**
 * MODULE 3.3.3: Global Cross-Store Branches Explorer API (`/api/super-admin/branches`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const storeIdParam = searchParams.get("storeId");
  const typeParam = (searchParams.get("type") || "all").toLowerCase(); // all | main | sub
  const statusParam = (searchParams.get("status") || "all").toLowerCase(); // all | active | inactive
  const complianceParam = (searchParams.get("compliance") || "all").toLowerCase(); // all | complete | missing
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  try {
    const now = new Date();
    const thirtyDaysAgoUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29, 0, 0, 0)
    );

    const where: any = {};
    if (storeIdParam && storeIdParam !== "all") {
      const sId = parseInt(storeIdParam, 10);
      if (!isNaN(sId)) where.storeId = sId;
    }
    if (typeParam === "main") where.isMain = true;
    else if (typeParam === "sub") where.isMain = false;

    if (statusParam === "active") where.active = true;
    else if (statusParam === "inactive") where.active = false;

    const [branches, stores, staffCounts, batches, sales30d, closings] = await Promise.all([
      prisma.branch.findMany({
        where,
        orderBy: [{ storeId: "asc" }, { isMain: "desc" }, { id: "asc" }],
        include: {
          store: { select: { id: true, storeName: true, storeStatus: true, city: true, state: true, storeGst: true, storeDl: true } },
        },
      }),
      prisma.settings.findMany({
        orderBy: { id: "asc" },
        select: { id: true, storeName: true },
      }),
      prisma.user.groupBy({
        by: ["branchId"],
        where: { branchId: { not: null }, active: true },
        _count: { _all: true },
      }),
      prisma.batch.findMany({
        where: { branchId: { not: null } },
        select: { branchId: true, quantity: true, purchasePrice: true, mrp: true },
      }),
      prisma.sale.groupBy({
        by: ["branchId"],
        where: { branchId: { not: null }, saleDate: { gte: thirtyDaysAgoUtc } },
        _sum: { grandTotal: true },
        _count: { _all: true },
      }),
      prisma.cashDrawerClosing.findMany({
        where: { branchId: { not: null } },
        orderBy: { shiftEnd: "desc" },
        take: 200,
        select: { branchId: true, shiftEnd: true, status: true, closingNumber: true },
      }),
    ]);

    const staffMap = new Map<number, number>();
    staffCounts.forEach((s) => {
      if (s.branchId) staffMap.set(s.branchId, s._count._all);
    });

    const batchSkuMap = new Map<number, number>();
    const stockValMap = new Map<number, number>();
    batches.forEach((b) => {
      if (!b.branchId) return;
      if (b.quantity > 0) {
        batchSkuMap.set(b.branchId, (batchSkuMap.get(b.branchId) || 0) + 1);
      }
      const val = getBatchPurchaseCost(b, b.mrp) * Math.max(0, b.quantity);
      stockValMap.set(b.branchId, (stockValMap.get(b.branchId) || 0) + val);
    });

    const salesMap = new Map<number, { revenue: number; count: number }>();
    sales30d.forEach((s) => {
      if (s.branchId) {
        salesMap.set(s.branchId, {
          revenue: Math.round(Number(s._sum.grandTotal || 0) * 100) / 100,
          count: s._count._all,
        });
      }
    });

    const lastCloseMap = new Map<number, { shiftEnd: string; status: string; closingNumber: string }>();
    closings.forEach((c) => {
      if (c.branchId && !lastCloseMap.has(c.branchId)) {
        lastCloseMap.set(c.branchId, {
          shiftEnd: c.shiftEnd.toISOString(),
          status: c.status,
          closingNumber: c.closingNumber,
        });
      }
    });

    const rows = branches
      .map((b) => {
        const effGst = b.gstNo || b.store?.storeGst || null;
        const effDl = b.dlNo || b.store?.storeDl || null;
        const complianceComplete = Boolean(effGst && effDl);
        return {
          id: b.id,
          storeId: b.storeId,
          storeName: b.store?.storeName || `Store #${b.storeId}`,
          storeStatus: b.store?.storeStatus || "active",
          code: b.code,
          name: b.name,
          address: b.address,
          phone: b.phone,
          email: b.email,
          gstNo: b.gstNo,
          dlNo: b.dlNo,
          effectiveGst: effGst,
          effectiveDl: effDl,
          complianceComplete,
          city: b.store?.city || null,
          state: b.store?.state || null,
          isMain: b.isMain,
          active: b.active,
          staffCount: staffMap.get(b.id) || 0,
          batchSkuCount: batchSkuMap.get(b.id) || 0,
          stockValue: Math.round((stockValMap.get(b.id) || 0) * 100) / 100,
          sales30d: salesMap.get(b.id)?.revenue || 0,
          invoices30d: salesMap.get(b.id)?.count || 0,
          lastClosing: lastCloseMap.get(b.id) || null,
        };
      })
      .filter((r) => {
        if (complianceParam === "complete" && !r.complianceComplete) return false;
        if (complianceParam === "missing" && r.complianceComplete) return false;
        if (search) {
          const hay = [r.name, r.code, r.storeName, r.gstNo, r.dlNo, r.city, r.state]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      });

    return NextResponse.json({
      success: true,
      branches: rows,
      stores,
      summary: {
        total: rows.length,
        activeCount: rows.filter((r) => r.active).length,
        missingComplianceCount: rows.filter((r) => !r.complianceComplete).length,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/branches Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load branches explorer" },
      { status: 500 }
    );
  }
}
