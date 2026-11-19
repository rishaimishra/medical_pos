import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySupplierRequest } from "@/lib/auth";
import { requireSupplierPortalFeature } from "@/lib/entitlements";

/**
 * GET /api/supplier/batches
 * Returns active/recent inventory batches supplied by the logged-in supplier,
 * plus top supplied medicines summary for the Supplier Portal dashboard.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const gate = await requireSupplierPortalFeature(auth.session.supplierId, "supplierPortalAndGrn");
  if (!gate.allowed) return gate.response!;

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();

  try {
    const where: any = {
      supplierId: auth.session.supplierId,
    };
    if (search) {
      where.OR = [
        { batchNo: { contains: search, mode: "insensitive" } },
        { medicine: { name: { contains: search, mode: "insensitive" } } },
        { medicine: { genericName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const batches = await prisma.batch.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      include: {
        medicine: {
          select: { id: true, name: true, genericName: true, company: true, category: true, hsnCode: true },
        },
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    // Aggregate top supplied medicines by remaining stock & PO quantities
    const medAgg = new Map<
      number,
      { medicineId: number; name: string; company: string; totalUnits: number; batchesCount: number; stockValue: number }
    >();
    let totalStockUnits = 0;
    let totalStockValue = 0;

    for (const b of batches) {
      totalStockUnits += b.quantity;
      const val = Number(b.purchasePrice || 0) * b.quantity;
      totalStockValue += val;
      if (b.medicine) {
        const entry = medAgg.get(b.medicine.id) || {
          medicineId: b.medicine.id,
          name: b.medicine.name,
          company: b.medicine.company || "",
          totalUnits: 0,
          batchesCount: 0,
          stockValue: 0,
        };
        entry.totalUnits += b.quantity;
        entry.batchesCount += 1;
        entry.stockValue += val;
        medAgg.set(b.medicine.id, entry);
      }
    }

    const topSuppliedMedicines = Array.from(medAgg.values())
      .sort((a, b) => b.totalUnits - a.totalUnits || b.stockValue - a.stockValue)
      .slice(0, 8);

    return NextResponse.json({
      success: true,
      batches: batches.map((b) => ({
        id: b.id,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate.toISOString(),
        quantity: b.quantity,
        purchasePrice: Number(b.purchasePrice),
        mrp: Number(b.mrp),
        medicine: b.medicine,
        branch: b.branch,
        createdAt: b.createdAt.toISOString(),
      })),
      summary: {
        totalBatches: batches.length,
        totalStockUnits,
        totalStockValue: Number(totalStockValue.toFixed(2)),
        topSuppliedMedicines,
      },
    });
  } catch (error: any) {
    console.error("GET /api/supplier/batches error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch supplied batches" },
      { status: 500 }
    );
  }
}
