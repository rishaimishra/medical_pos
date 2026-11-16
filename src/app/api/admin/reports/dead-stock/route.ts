import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.15.3: Dead Stock & Slow-Moving Inventory Identification API
 *
 * Scans active batch inventory with stock > 0 that has had NO sales in
 * 60, 90, 180, or 365+ days.
 *
 * Calculates:
 * - Blocked Capital Value (Stock Qty x Purchase Cost)
 * - Days Since Last Sale / Days Stagnant
 * - Expiry Risk Countdown (Highlighting capital at risk of expiring)
 * - Distributor Return / Clearance Recommendations
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const thresholdDays = Math.max(30, parseInt(searchParams.get("thresholdDays") || "90", 10)); // 60, 90, 180, 365
  const search = searchParams.get("search")?.trim().toLowerCase() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const skip = (page - 1) * limit;

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    // Cutoff date for sales threshold
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

    // 1. Fetch batches with remaining stock > 0
    const batches = await prisma.batch.findMany({
      where: {
        ...branchFilter,
        quantity: { gt: 0 },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            company: true,
            category: true,
            rackLocation: true,
            genericName: true,
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        saleItems: {
          select: {
            quantity: true,
            sale: { select: { saleDate: true } },
          },
          orderBy: { sale: { saleDate: "desc" } },
          take: 1, // Get the most recent sale
        },
      },
      orderBy: { expiryDate: "asc" },
    });

    const nowTime = Date.now();
    const deadBatches: any[] = [];

    let totalBlockedCapital = 0;
    let highExpiryRiskCount = 0;

    for (const batch of batches) {
      const latestSale = batch.saleItems[0];
      const lastSaleDate = latestSale ? new Date(latestSale.sale.saleDate) : null;

      // Check if stagnant: either never sold, or last sold before cutoffDate
      const isStagnant = !lastSaleDate || lastSaleDate < cutoffDate;

      if (!isStagnant) continue;

      // Search filter
      if (search) {
        const matches =
          batch.medicine.name.toLowerCase().includes(search) ||
          batch.medicine.company.toLowerCase().includes(search) ||
          batch.batchNo.toLowerCase().includes(search) ||
          (batch.medicine.genericName && batch.medicine.genericName.toLowerCase().includes(search)) ||
          (batch.medicine.rackLocation && batch.medicine.rackLocation.toLowerCase().includes(search));

        if (!matches) continue;
      }

      const daysSinceLastSale = lastSaleDate
        ? Math.floor((nowTime - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
        : Math.floor((nowTime - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24));

      const daysToExpiry = Math.floor((new Date(batch.expiryDate).getTime() - nowTime) / (1000 * 60 * 60 * 24));
      const purchasePrice = Number(batch.purchasePrice || Number(batch.mrp) * 0.7);
      const blockedCapital = Math.round(purchasePrice * batch.quantity * 100) / 100;

      totalBlockedCapital += blockedCapital;

      const isHighExpiryRisk = daysToExpiry <= 90;
      if (isHighExpiryRisk) highExpiryRiskCount++;

      let agingCategory = "Slow-Moving (60-90 Days)";
      if (daysSinceLastSale >= 180) {
        agingCategory = "Dead Stock (180+ Days)";
      } else if (daysSinceLastSale >= 90) {
        agingCategory = "Stagnant (90-180 Days)";
      }

      deadBatches.push({
        batchId: batch.id,
        batchNumber: batch.batchNo,
        medicineId: batch.medicine.id,
        name: batch.medicine.name,
        company: batch.medicine.company,
        category: batch.medicine.category,
        genericName: batch.medicine.genericName || "-",
        rackLocation: batch.medicine.rackLocation || "-",
        stockQuantity: batch.quantity,
        purchasePrice,
        mrp: Number(batch.mrp),
        blockedCapital,
        expiryDate: batch.expiryDate.toISOString(),
        daysToExpiry,
        isExpired: daysToExpiry <= 0,
        isHighExpiryRisk,
        lastSaleDate: lastSaleDate ? lastSaleDate.toISOString() : null,
        daysSinceLastSale,
        agingCategory,
        branch: {
          code: batch.branch?.code || "MAIN",
          name: batch.branch?.name || "Main Counter",
        },
      });
    }

    // Sort by blocked capital descending
    deadBatches.sort((a, b) => b.blockedCapital - a.blockedCapital);

    const totalCount = deadBatches.length;
    const paginatedRecords = deadBatches.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      thresholdDays,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalDeadBatches: totalCount,
        totalBlockedCapital: Math.round(totalBlockedCapital * 100) / 100,
        highExpiryRiskCount,
        thresholdDays,
      },
      records: paginatedRecords,
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/dead-stock error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to identify dead stock" },
      { status: 500 }
    );
  }
}
