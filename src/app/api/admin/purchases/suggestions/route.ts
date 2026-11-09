import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { APP_CONFIG } from "@/lib/config";

/**
 * MODULE 1.11.1: SMART AUTO-PO SUGGESTION ENGINE
 * 
 * Inspects branch inventory levels, detects low-stock / out-of-stock medicines,
 * and compiles intelligent purchase recommendations grouped by preferred supplier.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const branchId = branchIdParam && branchIdParam !== "all"
    ? parseInt(branchIdParam, 10)
    : (auth.session.branchId || undefined);

  try {
    // 1. Fetch store threshold
    const settings = await prisma.settings.findFirst({
      select: { lowQty: true },
    });
    const lowStockThreshold = settings?.lowQty ?? APP_CONFIG.lowQtyThreshold;

    // 2. Fetch pending on-order quantities (pending, confirmed, shipped) to prevent duplicate ordering
    const pendingPOItems = await prisma.pOItem.findMany({
      where: {
        purchaseOrder: {
          status: { in: ["pending", "confirmed", "shipped"] },
          branchId: branchId ? branchId : undefined,
        },
      },
      select: {
        medicineId: true,
        quantity: true,
        receivedQty: true,
      },
    });

    const onOrderMap: Record<number, number> = {};
    for (const poi of pendingPOItems) {
      const remaining = Math.max(0, poi.quantity - poi.receivedQty);
      onOrderMap[poi.medicineId] = (onOrderMap[poi.medicineId] || 0) + remaining;
    }

    // 3. Compute 30-day sales velocity per medicine
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSales = await prisma.saleItem.groupBy({
      by: ["medicineId"],
      where: {
        sale: {
          saleDate: { gte: thirtyDaysAgo },
          branchId: branchId ? branchId : undefined,
        },
      },
      _sum: { quantity: true },
    });

    const salesVelocityMap: Record<number, number> = {};
    for (const rs of recentSales) {
      salesVelocityMap[rs.medicineId] = rs._sum?.quantity ?? 0;
    }

    // 4. Fetch all medicines with their batches for this branch
    const medicines = await prisma.medicine.findMany({
      orderBy: { name: "asc" },
      include: {
        batches: {
          where: branchId ? { branchId } : undefined,
          orderBy: { id: "desc" },
          include: {
            supplier: {
              select: { id: true, name: true, phone: true, email: true },
            },
          },
        },
      },
    });

    const suggestions: any[] = [];
    const groupedBySupplier: Record<string, {
      supplier: { id: number; name: string; phone: string; email?: string | null };
      items: any[];
      estimatedTotal: number;
    }> = {};

    // Also fetch a fallback default supplier if an item has no previous batches
    const defaultSupplier = await prisma.supplier.findFirst({
      orderBy: { id: "asc" },
      select: { id: true, name: true, phone: true, email: true },
    });

    for (const med of medicines) {
      // Sum unexpired and positive stock across batches
      const now = new Date();
      const currentStock = med.batches
        .filter((b) => new Date(b.expiryDate) > now)
        .reduce((sum, b) => sum + b.quantity, 0);

      const onOrderQty = onOrderMap[med.id] || 0;
      const past30DaysSales = salesVelocityMap[med.id] || 0;
      const dailyVelocity = Math.round((past30DaysSales / 30) * 10) / 10; // units/day

      // Effective available inventory
      const effectiveStock = currentStock + onOrderQty;

      // Trigger reorder if current inventory is at/below threshold and incoming orders do not exceed safety buffer
      if (currentStock <= lowStockThreshold && effectiveStock <= Math.max(lowStockThreshold * 2, dailyVelocity * 14)) {
        // Preferred supplier from most recent batch
        const lastBatch = med.batches[0];
        const supplier = lastBatch?.supplier || defaultSupplier;

        const purchasePrice = lastBatch ? Number(lastBatch.purchasePrice) : 0;
        const mrp = lastBatch ? Number(lastBatch.mrp) : 0;

        // Recommended quantity calculated from 30-day velocity demand and safety thresholds
        const velocityDemand = Math.ceil(dailyVelocity * 30);
        const targetStock = Math.max(50, lowStockThreshold * 4, velocityDemand);
        const suggestedQuantity = Math.max(10, targetStock - effectiveStock);
        const lineTotal = purchasePrice * suggestedQuantity;

        const urgency = currentStock === 0
          ? "out_of_stock"
          : currentStock <= Math.floor(lowStockThreshold / 2)
          ? "critical_low"
          : "low_stock";

        const itemSuggestion = {
          medicineId: med.id,
          medicineName: med.name,
          genericName: med.genericName,
          company: med.company,
          category: med.category,
          rackLocation: med.rackLocation,
          currentStock,
          onOrderQty,
          past30DaysSales,
          dailyVelocity,
          threshold: lowStockThreshold,
          suggestedQuantity,
          purchasePrice,
          mrp,
          lineTotal: Math.round(lineTotal * 100) / 100,
          urgency,
          preferredSupplier: supplier,
        };

        suggestions.push(itemSuggestion);

        const supKey = supplier ? String(supplier.id) : "unassigned";
        if (!groupedBySupplier[supKey]) {
          groupedBySupplier[supKey] = {
            supplier: supplier || { id: 0, name: "General / Unassigned Distributor", phone: "N/A" },
            items: [],
            estimatedTotal: 0,
          };
        }
        groupedBySupplier[supKey].items.push(itemSuggestion);
        groupedBySupplier[supKey].estimatedTotal += lineTotal;
      }
    }

    return NextResponse.json({
      success: true,
      threshold: lowStockThreshold,
      totalSuggestions: suggestions.length,
      suggestions,
      groupedBySupplier: Object.values(groupedBySupplier).map((g) => ({
        ...g,
        estimatedTotal: Math.round(g.estimatedTotal * 100) / 100,
      })),
    });
  } catch (error: any) {
    console.error("GET /api/admin/purchases/suggestions error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to generate PO suggestions" }, { status: 500 });
  }
}
