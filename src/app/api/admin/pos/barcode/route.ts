import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.3.1: Hardware Barcode Scanner Lookup Endpoint
 * Quickly resolves a scanned physical barcode string (Batch No, Medicine HSN, or Item Code)
 * into a dispensable, in-stock, unexpired medicine batch prioritizing FEFO.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const rawCode = (searchParams.get("code") || "").trim();
  const branchParam = searchParams.get("branchId");

  if (!rawCode) {
    return NextResponse.json(
      { success: false, error: "Barcode string parameter 'code' is required" },
      { status: 400 }
    );
  }

  const requestedBranchId = branchParam ? parseInt(branchParam, 10) : null;
  if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
    return NextResponse.json(
      { success: false, error: "Forbidden: No access to requested branch" },
      { status: 403 }
    );
  }

  const effectiveBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    // 1. Try matching directly by Batch Number first
    const batchMatch = await prisma.batch.findFirst({
      where: {
        batchNo: { equals: rawCode, mode: "insensitive" },
        expiryDate: { gt: todayMidnight },
        ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
      },
      include: { medicine: true },
      orderBy: { expiryDate: "asc" },
    });

    if (batchMatch) {
      if (batchMatch.quantity <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Batch ${batchMatch.batchNo} (${batchMatch.medicine.name}) is currently out of stock (0 available)`,
            medicineName: batchMatch.medicine.name,
            batchNo: batchMatch.batchNo,
            availableStock: 0,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        matchType: "batch",
        medicine: {
          id: batchMatch.medicine.id,
          name: batchMatch.medicine.name,
          genericName: batchMatch.medicine.genericName,
          rackLocation: batchMatch.medicine.rackLocation,
          gstPercent: Number(batchMatch.medicine.gstPercent || 12),
          scheduleType: batchMatch.medicine.scheduleType,
        },
        batch: {
          id: batchMatch.id,
          batchNo: batchMatch.batchNo,
          expiryDate: batchMatch.expiryDate.toISOString(),
          quantity: batchMatch.quantity,
          mrp: Number(batchMatch.mrp),
          purchasePrice: Number(batchMatch.purchasePrice),
        },
        availableStock: batchMatch.quantity,
      });
    }

    // 2. Try matching by Medicine HSN Code, or Name exactly
    const medicineMatch = await prisma.medicine.findFirst({
      where: {
        OR: [
          { hsnCode: { equals: rawCode, mode: "insensitive" } },
          { name: { equals: rawCode, mode: "insensitive" } },
        ],
      },
      include: {
        batches: {
          where: {
            expiryDate: { gt: todayMidnight },
            quantity: { gt: 0 },
            ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
          },
          orderBy: { expiryDate: "asc" },
        },
      },
    });

    if (medicineMatch) {
      const topBatch = medicineMatch.batches[0];
      if (!topBatch) {
        return NextResponse.json(
          {
            success: false,
            error: `Medicine '${medicineMatch.name}' was found, but has no active unexpired stock in this branch`,
            medicineName: medicineMatch.name,
            availableStock: 0,
          },
          { status: 400 }
        );
      }

      const totalStock = medicineMatch.batches.reduce((sum, b) => sum + b.quantity, 0);

      return NextResponse.json({
        success: true,
        matchType: "medicine",
        medicine: {
          id: medicineMatch.id,
          name: medicineMatch.name,
          genericName: medicineMatch.genericName,
          rackLocation: medicineMatch.rackLocation,
          gstPercent: Number(medicineMatch.gstPercent || 12),
          scheduleType: medicineMatch.scheduleType,
        },
        batch: {
          id: topBatch.id,
          batchNo: topBatch.batchNo,
          expiryDate: topBatch.expiryDate.toISOString(),
          quantity: topBatch.quantity,
          mrp: Number(topBatch.mrp),
          purchasePrice: Number(topBatch.purchasePrice),
        },
        availableStock: totalStock,
        batchStock: topBatch.quantity,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `No unexpired medicine or batch found matching barcode: "${rawCode}"`,
      },
      { status: 404 }
    );
  } catch (error: unknown) {
    console.error("Barcode lookup failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to resolve barcode" },
      { status: 500 }
    );
  }
}
