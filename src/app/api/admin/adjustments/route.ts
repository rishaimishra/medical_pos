import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 1.9: STOCK ADJUSTMENTS & PHYSICAL AUDIT RECONCILIATION
 * 
 * Endpoints:
 * - GET: Fetch paginated stock adjustments log with metrics, search, type/reason filters, and branch scoping.
 * - POST: Execute atomic stock adjustment (add, remove, inter-branch transfer) with strict boundary validation.
 */

export const STANDARDIZED_REASONS = [
  "Damaged in Transit",
  "Breakage/Spillage",
  "Expired Discard",
  "Supplier Return",
  "Physical Audit Variance",
  "Inter-Branch Stock Transfer",
  "Correction / Mistake",
  "Customer Return to Stock",
  "Other Reason",
] as const;

export type StandardAdjustmentReason = typeof STANDARDIZED_REASONS[number];

// ─────────────────────────────────────────────────────────────────────────────
// GET: Fetch Paginated Stock Adjustments Log & Metrics (1.9.2)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_stock_adjustments" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const typeParam = searchParams.get("type"); // "add" | "remove" | "transfer" | "sale" | "return" | "all"
  const branchParam = searchParams.get("branchId");
  const medicineIdParam = searchParams.get("medicineId");
  const batchIdParam = searchParams.get("batchId");
  const reasonParam = (searchParams.get("reason") || "").trim();
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  // RBAC Cost Price Visibility
  const canViewCostPrice =
    auth.session.role === "admin" || (auth.session.permissions || []).includes("view_cost_price");

  // Multi-Tenant Store & Branch Scoping
  const userStoreId = auth.session.storeId;
  const requestedBranchId =
    branchParam && branchParam !== "all" ? parseInt(branchParam, 10) : null;

  // Strict branch isolation: If client explicitly requests a branch they are not authorized for, return 403
  if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
    return NextResponse.json(
      { success: false, message: "Security Violation: Access denied to other store branches." },
      { status: 403 }
    );
  }

  // Branch-bound staff can only view their own branch; Super Admin can view requested branch or all
  const targetBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;

  try {
    // 1. Construct Where Clause with resilient store & branch scoping (including POS adjustments)
    const whereConditions: any[] = [];

    if (userStoreId) {
      whereConditions.push({
        OR: [
          { branch: { storeId: userStoreId } },
          { batch: { branch: { storeId: userStoreId } } },
        ],
      });
    }

    if (targetBranchId) {
      whereConditions.push({
        OR: [
          { branchId: targetBranchId },
          { batch: { branchId: targetBranchId } },
        ],
      });
    }

    if (medicineIdParam) {
      const medId = parseInt(medicineIdParam, 10);
      if (!isNaN(medId) && medId > 0) whereConditions.push({ medicineId: medId });
    }

    if (batchIdParam) {
      const bId = parseInt(batchIdParam, 10);
      if (!isNaN(bId) && bId > 0) whereConditions.push({ batchId: bId });
    }

    if (typeParam && typeParam !== "all") {
      whereConditions.push({ type: typeParam });
    }

    if (reasonParam && reasonParam !== "all") {
      whereConditions.push({ reason: { contains: reasonParam, mode: "insensitive" } });
    }

    // Date Range Filter
    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          dateFilter.gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          dateFilter.lte = end;
        }
      }
      whereConditions.push({ createdAt: dateFilter });
    }

    // Search Query (Medicine Name, Generic, Batch No, Reason, Username)
    if (search) {
      whereConditions.push({
        OR: [
          { batch: { batchNo: { contains: search, mode: "insensitive" } } },
          { medicine: { name: { contains: search, mode: "insensitive" } } },
          { medicine: { genericName: { contains: search, mode: "insensitive" } } },
          { reason: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { username: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // 2. Fetch Aggregations & Metrics
    const metricsConditions: any[] = [];
    if (userStoreId) {
      metricsConditions.push({
        OR: [
          { branch: { storeId: userStoreId } },
          { batch: { branch: { storeId: userStoreId } } },
        ],
      });
    }
    if (targetBranchId) {
      metricsConditions.push({
        OR: [
          { branchId: targetBranchId },
          { batch: { branchId: targetBranchId } },
        ],
      });
    }
    const baseWhereForMetrics = metricsConditions.length > 0 ? { AND: metricsConditions } : {};

    const [
      totalCount,
      filteredCount,
      allAdjustmentsForMetrics,
    ] = await Promise.all([
      prisma.stockAdjustment.count({ where: baseWhereForMetrics }),
      prisma.stockAdjustment.count({ where }),
      prisma.stockAdjustment.findMany({
        where: baseWhereForMetrics,
        select: {
          type: true,
          quantity: true,
          reason: true,
        },
      }),
    ]);

    let netUnitsAdded = 0;
    let netUnitsRemoved = 0;
    let transfersCount = 0;
    let writeOffUnits = 0;

    for (const adj of allAdjustmentsForMetrics) {
      if (adj.type === "add" || (adj.type === "transfer" && adj.quantity > 0 && targetBranchId)) {
        netUnitsAdded += Math.abs(adj.quantity);
      } else if (adj.type === "remove" || (adj.type === "transfer" && adj.quantity < 0 && targetBranchId)) {
        netUnitsRemoved += Math.abs(adj.quantity);
      }

      if (adj.type === "remove") {
        const lowerReason = (adj.reason || "").toLowerCase();
        if (
          lowerReason.includes("damage") ||
          lowerReason.includes("spill") ||
          lowerReason.includes("break") ||
          lowerReason.includes("expire") ||
          lowerReason.includes("discard")
        ) {
          writeOffUnits += Math.abs(adj.quantity);
        }
      }

      if (adj.type === "transfer") {
        if (targetBranchId) {
          transfersCount += 1;
        } else if (adj.quantity < 0) {
          transfersCount += 1;
        }
      }
    }

    // 3. Fetch Paginated Records
    const skip = (page - 1) * limit;
    const adjustments = await prisma.stockAdjustment.findMany({
      where,
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            company: true,
            category: true,
            rackLocation: true,
            gstPercent: true,
            description: true,
          },
        },
        batch: {
          select: {
            id: true,
            batchNo: true,
            expiryDate: true,
            mfgDate: true,
            quantity: true,
            mrp: true,
            purchasePrice: true,
          },
        },
        branch: {
          select: { id: true, code: true, name: true },
        },
        user: {
          select: { id: true, username: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    // 4. Format Output with RBAC Cost Price Redaction
    const formattedData = adjustments.map((adj) => ({
      id: adj.id,
      type: adj.type,
      quantity: adj.quantity,
      absoluteQuantity: Math.abs(adj.quantity),
      oldQty: adj.oldQty,
      newQty: adj.newQty,
      difference: adj.newQty - adj.oldQty,
      reason: adj.reason,
      createdAt: adj.createdAt.toISOString(),
      medicine: adj.medicine,
      branch: adj.branch,
      user: adj.user,
      batch: {
        id: adj.batch.id,
        batchNo: adj.batch.batchNo,
        expiryDate: adj.batch.expiryDate.toISOString().split("T")[0],
        mfgDate: adj.batch.mfgDate ? adj.batch.mfgDate.toISOString().split("T")[0] : null,
        currentStock: adj.batch.quantity,
        mrp: Number(adj.batch.mrp),
        purchasePrice: canViewCostPrice ? Number(adj.batch.purchasePrice) : null,
      },
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
      pagination: {
        page,
        limit,
        total: filteredCount,
        totalPages: Math.ceil(filteredCount / limit) || 1,
      },
      summary: {
        totalAdjustments: totalCount,
        netUnitsAdded,
        netUnitsRemoved,
        transfersCount,
        writeOffUnits,
      },
      canViewCostPrice,
    });
  } catch (error: any) {
    console.error("GET /api/admin/adjustments error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch stock adjustments." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Execute Atomic Stock Adjustment (1.9.1)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_stock_adjustments" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);
  const userStoreId = auth.session.storeId;
  const currentUserId = auth.session.userId;

  try {
    const body = await req.json();
    const { batchId, type, quantity, reason, notes, toBranchId } = body;

    // 1. Validation: Batch ID
    const parsedBatchId = parseInt(batchId, 10);
    if (!parsedBatchId || isNaN(parsedBatchId)) {
      return NextResponse.json(
        { success: false, message: "Valid batch ID is required." },
        { status: 400 }
      );
    }

    // 2. Validation: Adjustment Type
    if (!type || !["add", "remove", "transfer"].includes(type)) {
      return NextResponse.json(
        { success: false, message: "Valid adjustment type ('add', 'remove', or 'transfer') is required." },
        { status: 400 }
      );
    }

    // 3. Validation: Quantity (Must be integer > 0)
    const validQty = typeof quantity === "number" ? quantity : parseInt(quantity, 10);
    if (!validQty || isNaN(validQty) || validQty <= 0 || !Number.isInteger(validQty)) {
      return NextResponse.json(
        { success: false, message: "Adjustment quantity must be an integer greater than 0." },
        { status: 400 }
      );
    }

    // 4. Validation: Reason
    const cleanReason = (reason || "").trim();
    if (!cleanReason || cleanReason.length < 3) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid standardized reason for this stock adjustment." },
        { status: 400 }
      );
    }

    const cleanNotes = (notes || "").trim();
    const finalReason = cleanNotes
      ? `${cleanReason} • ${cleanNotes}`.slice(0, 250)
      : cleanReason.slice(0, 250);

    // 5. Fetch Target Batch & Validate Multi-Tenant Ownership
    const targetBatch = await prisma.batch.findUnique({
      where: { id: parsedBatchId },
      include: {
        branch: { select: { id: true, code: true, name: true, storeId: true } },
        medicine: { select: { id: true, name: true, genericName: true } },
      },
    });

    if (!targetBatch) {
      return NextResponse.json(
        { success: false, message: "Batch record not found." },
        { status: 404 }
      );
    }

    // Multi-tenant check
    if (userStoreId && targetBatch.branch?.storeId && targetBatch.branch.storeId !== userStoreId) {
      return NextResponse.json(
        { success: false, message: "Security Violation: Access denied to other store tenants." },
        { status: 403 }
      );
    }

    // Multi-branch permission check
    if (!canAccessBranch(auth.session, targetBatch.branchId)) {
      return NextResponse.json(
        { success: false, message: "Security Violation: You do not have access to this store branch." },
        { status: 403 }
      );
    }

    // 6. Action-Specific Boundary Guards
    if (type === "remove") {
      if (validQty > targetBatch.quantity) {
        return NextResponse.json(
          {
            success: false,
            message: `Cannot reduce stock below 0. Current stock for batch "${targetBatch.batchNo}" is ${targetBatch.quantity} units, attempted to remove ${validQty} units.`,
          },
          { status: 400 }
        );
      }
    }

    let destinationBranch: any = null;
    if (type === "transfer") {
      const parsedToBranchId = parseInt(toBranchId, 10);
      if (!parsedToBranchId || isNaN(parsedToBranchId)) {
        return NextResponse.json(
          { success: false, message: "Destination store branch ID is required for stock transfers." },
          { status: 400 }
        );
      }

      if (parsedToBranchId === targetBatch.branchId) {
        return NextResponse.json(
          { success: false, message: "Destination branch cannot be the same as the source branch." },
          { status: 400 }
        );
      }

      destinationBranch = await prisma.branch.findUnique({
        where: { id: parsedToBranchId },
        select: { id: true, code: true, name: true, storeId: true, active: true },
      });

      if (!destinationBranch) {
        return NextResponse.json(
          { success: false, message: "Destination branch not found." },
          { status: 404 }
        );
      }

      if (userStoreId && destinationBranch.storeId !== userStoreId) {
        return NextResponse.json(
          { success: false, message: "Security Violation: Cannot transfer stock across different store tenants." },
          { status: 403 }
        );
      }

      if (!destinationBranch.active) {
        return NextResponse.json(
          { success: false, message: `Destination branch [${destinationBranch.code}] is currently deactivated.` },
          { status: 400 }
        );
      }

      if (validQty > targetBatch.quantity) {
        return NextResponse.json(
          {
            success: false,
            message: `Cannot transfer more units than available stock. Current stock is ${targetBatch.quantity} units, attempted to transfer ${validQty} units.`,
          },
          { status: 400 }
        );
      }
    }

    // 7. Atomic ACID Database Transaction Execution
    const result = await prisma.$transaction(async (tx) => {
      // Re-fetch batch within transaction to avoid race conditions
      const currentBatch = await tx.batch.findUnique({
        where: { id: parsedBatchId },
      });

      if (!currentBatch) {
        throw new Error("Batch record was not found during transaction lock.");
      }

      const oldQty = currentBatch.quantity;

      // ──────────────────────────────────────────
      // TYPE: ADD STOCK (+)
      // ──────────────────────────────────────────
      if (type === "add") {
        const newQty = oldQty + validQty;

        const updatedBatch = await tx.batch.update({
          where: { id: currentBatch.id },
          data: { quantity: newQty },
        });

        const adjustment = await tx.stockAdjustment.create({
          data: {
            batchId: currentBatch.id,
            medicineId: currentBatch.medicineId,
            branchId: currentBatch.branchId,
            type: "add",
            quantity: validQty,
            reason: finalReason,
            oldQty,
            newQty,
            userId: currentUserId,
          },
        });

        return { updatedBatch, adjustments: [adjustment], newQty, oldQty };
      }

      // ──────────────────────────────────────────
      // TYPE: REMOVE STOCK (-)
      // ──────────────────────────────────────────
      if (type === "remove") {
        if (validQty > oldQty) {
          throw new Error(
            `Concurrent mutation conflict: Current stock is ${oldQty} units, attempted to remove ${validQty} units.`
          );
        }

        const newQty = oldQty - validQty;

        const updatedBatch = await tx.batch.update({
          where: { id: currentBatch.id },
          data: { quantity: newQty },
        });

        const adjustment = await tx.stockAdjustment.create({
          data: {
            batchId: currentBatch.id,
            medicineId: currentBatch.medicineId,
            branchId: currentBatch.branchId,
            type: "remove",
            quantity: -validQty,
            reason: finalReason,
            oldQty,
            newQty,
            userId: currentUserId,
          },
        });

        return { updatedBatch, adjustments: [adjustment], newQty, oldQty };
      }

      // ──────────────────────────────────────────
      // TYPE: INTER-BRANCH TRANSFER (⇄)
      // ──────────────────────────────────────────
      if (type === "transfer") {
        if (validQty > oldQty) {
          throw new Error(
            `Concurrent mutation conflict: Current stock is ${oldQty} units, attempted to transfer ${validQty} units.`
          );
        }

        const newQtySource = oldQty - validQty;

        // 1. Deduct from Source Batch
        const updatedSourceBatch = await tx.batch.update({
          where: { id: currentBatch.id },
          data: { quantity: newQtySource },
        });

        const sourceAdj = await tx.stockAdjustment.create({
          data: {
            batchId: currentBatch.id,
            medicineId: currentBatch.medicineId,
            branchId: currentBatch.branchId,
            type: "transfer",
            quantity: -validQty,
            reason: `Transfer to ${destinationBranch.name} [${destinationBranch.code}] • ${finalReason}`.slice(0, 250),
            oldQty,
            newQty: newQtySource,
            userId: currentUserId,
          },
        });

        // 2. Add to Destination Branch (Case-insensitive matching to prevent duplicate batches)
        const existingDestBatch = await tx.batch.findFirst({
          where: {
            medicineId: currentBatch.medicineId,
            batchNo: { equals: currentBatch.batchNo, mode: "insensitive" },
            branchId: destinationBranch.id,
          },
        });

        let updatedDestBatch: any;
        let destAdj: any;

        if (existingDestBatch) {
          const oldDestQty = existingDestBatch.quantity;
          const newDestQty = oldDestQty + validQty;

          updatedDestBatch = await tx.batch.update({
            where: { id: existingDestBatch.id },
            data: { quantity: newDestQty },
          });

          destAdj = await tx.stockAdjustment.create({
            data: {
              batchId: existingDestBatch.id,
              medicineId: existingDestBatch.medicineId,
              branchId: destinationBranch.id,
              type: "transfer",
              quantity: validQty,
              reason: `Transfer from ${targetBatch.branch?.name || "Source"} [${targetBatch.branch?.code || ""}] • ${finalReason}`.slice(0, 250),
              oldQty: oldDestQty,
              newQty: newDestQty,
              userId: currentUserId,
            },
          });
        } else {
          // Create new batch record in destination branch inheriting properties
          const newBatchInDest = await tx.batch.create({
            data: {
              medicineId: currentBatch.medicineId,
              batchNo: currentBatch.batchNo,
              mfgDate: currentBatch.mfgDate,
              expiryDate: currentBatch.expiryDate,
              mrp: currentBatch.mrp,
              purchasePrice: currentBatch.purchasePrice,
              supplierId: currentBatch.supplierId,
              branchId: destinationBranch.id,
              quantity: validQty,
            },
          });

          updatedDestBatch = newBatchInDest;

          destAdj = await tx.stockAdjustment.create({
            data: {
              batchId: newBatchInDest.id,
              medicineId: newBatchInDest.medicineId,
              branchId: destinationBranch.id,
              type: "transfer",
              quantity: validQty,
              reason: `Transfer from ${targetBatch.branch?.name || "Source"} [${targetBatch.branch?.code || ""}] • ${finalReason}`.slice(0, 250),
              oldQty: 0,
              newQty: validQty,
              userId: currentUserId,
            },
          });
        }

        return {
          updatedBatch: updatedSourceBatch,
          destinationBatch: updatedDestBatch,
          adjustments: [sourceAdj, destAdj],
          newQty: newQtySource,
          oldQty,
        };
      }

      throw new Error(`Unsupported adjustment type: ${type}`);
    });

    // 8. Audit Logging
    await logAudit({
      action: type === "transfer" ? "STOCK_TRANSFER" : "STOCK_ADJUSTMENT",
      entity: "StockAdjustment",
      entityId: result.adjustments[0].id,
      storeId: userStoreId,
      branchId: targetBatch.branchId,
      userId: currentUserId,
      ipAddress: clientIp,
      details: {
        type,
        medicineName: targetBatch.medicine.name,
        batchNo: targetBatch.batchNo,
        adjustedQuantity: validQty,
        oldQuantity: result.oldQty,
        newQuantity: result.newQty,
        reason: finalReason,
        ...(type === "transfer" ? { toBranchCode: destinationBranch.code } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message:
        type === "transfer"
          ? `Transferred ${validQty} units of batch "${targetBatch.batchNo}" to ${destinationBranch.name}.`
          : `Stock adjusted successfully. Batch "${targetBatch.batchNo}" updated from ${result.oldQty} to ${result.newQty} units.`,
      data: {
        batchId: result.updatedBatch.id,
        newQuantity: result.newQty,
        oldQuantity: result.oldQty,
        adjustedQuantity: validQty,
        type,
        adjustments: result.adjustments,
      },
    });
  } catch (error: any) {
    console.error("POST /api/admin/adjustments error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to process stock adjustment." },
      { status: 500 }
    );
  }
}

