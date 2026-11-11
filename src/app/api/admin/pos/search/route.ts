import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { getExpiryStatus } from "@/lib/config";
import { parsePackMetadata } from "@/app/api/admin/medicines/route";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const branchParam = searchParams.get("branchId");

  if (!q) {
    return NextResponse.json({ success: true, results: [] });
  }

  // Branch Access Isolation
  const requestedBranchId = branchParam && branchParam !== "all" ? parseInt(branchParam, 10) : null;
  const targetBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;

  if (targetBranchId && !canAccessBranch(auth.session, targetBranchId)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized branch access" },
      { status: 403 }
    );
  }

  try {
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Search medicines by brand name, generic composition, category, rack location, or batch number
    const medicines = await prisma.medicine.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { genericName: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { rackLocation: { contains: q, mode: "insensitive" } },
          {
            batches: {
              some: {
                batchNo: { contains: q, mode: "insensitive" },
                ...(targetBranchId ? { branchId: targetBranchId } : {}),
              },
            },
          },
        ],
      },
      include: {
        batches: {
          where: {
            ...(targetBranchId ? { branchId: targetBranchId } : {}),
            quantity: { gt: 0 },
            expiryDate: { gt: todayMidnight }, // Only unexpired batches with stock
          },
          orderBy: { expiryDate: "asc" }, // FEFO Priority (Earliest Expiry First)
        },
      },
      take: 20,
    });

    const results = medicines.map((med) => {
      const { meta } = parsePackMetadata(med.description);

      // Compute total branch stock across all active unexpired batches
      const totalBranchStock = med.batches.reduce((sum, b) => sum + b.quantity, 0);

      // Top FEFO batch recommendation (Earliest expiring batch)
      const recommended = med.batches.length > 0 ? med.batches[0] : null;
      let recommendedBatchInfo: any = null;

      if (recommended) {
        const expStatus = getExpiryStatus(recommended.expiryDate);
        recommendedBatchInfo = {
          id: recommended.id,
          batchNo: recommended.batchNo,
          expiryDate: recommended.expiryDate,
          mfgDate: recommended.mfgDate,
          quantity: recommended.quantity,
          mrp: Number(recommended.mrp),
          purchasePrice: Number(recommended.purchasePrice),
          daysRemaining: expStatus.daysRemaining,
          tier: expStatus.tier,
        };
      }

      // Display formatted rack/shelf location
      let rackShelfDisplay = med.rackLocation || "";
      if (!rackShelfDisplay && (meta.rackNo || meta.shelfNo)) {
        rackShelfDisplay = `Rack: ${meta.rackNo || "-"}${meta.shelfNo ? ` / Shelf: ${meta.shelfNo}` : ""}`;
      }

      return {
        id: med.id,
        name: med.name,
        genericName: med.genericName,
        company: med.company,
        category: med.category,
        hsnCode: med.hsnCode,
        gstPercent: Number(med.gstPercent || 12),
        scheduleType: med.scheduleType,
        rackLocation: rackShelfDisplay,
        totalBranchStock,
        availableBatchesCount: med.batches.length,
        recommendedBatch: recommendedBatchInfo,
        batches: med.batches.map((b) => {
          const expStatus = getExpiryStatus(b.expiryDate);
          return {
            id: b.id,
            batchNo: b.batchNo,
            expiryDate: b.expiryDate,
            mfgDate: b.mfgDate,
            quantity: b.quantity,
            mrp: Number(b.mrp),
            purchasePrice: Number(b.purchasePrice),
            daysRemaining: expStatus.daysRemaining,
            tier: expStatus.tier,
          };
        }),
      };
    });

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Search failed" },
      { status: 500 }
    );
  }
}
