import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { getExpiryStatus, ExpiryTier } from "@/lib/config";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 1.8: MULTI-BATCH TRACKING & EXPIRY MANAGEMENT ENGINE
 * 
 * Endpoints:
 * - GET: Fetch paginated batches with FEFO ordering, 4-tier expiry status, multi-branch scoping, and cost price RBAC.
 * - POST: Create new batch with case-insensitive duplicate prevention, falsy zero preservation, and date sanity validation.
 * - PUT: Partial/Full update of existing batch preserving metadata, with strict multi-tenant IDOR protection.
 * - DELETE: Safe batch deletion guarded against linked sales, returns, and stock adjustment records.
 */

// Helper to sanitize decimal or number to float
function parseDecimal(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  const num = typeof val === "number" ? val : parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET: Paginated Batches with FEFO & Expiry Classification (1.8.1 - 1.8.4)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const medicineIdParam = searchParams.get("medicineId");
  const branchParam = searchParams.get("branchId");
  const tierParam = searchParams.get("tier"); // "expired" | "critical_30" | "warning_90" | "safe" | "all"
  const stockParam = searchParams.get("stock"); // "in_stock" | "out_of_stock" | "all"
  const fefoMode = searchParams.get("fefo") === "true";
  const recommendFefo = searchParams.get("recommend") === "true"; // Returns single top FEFO batch for POS checkout

  // Permission Check: Can user view cost prices?
  const canViewCostPrice = auth.session.role === "admin" || (auth.session.permissions || []).includes("view_cost_price");

  // Multi-Tenant Store Scoping:
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
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAhead = new Date(todayMidnight.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAhead = new Date(todayMidnight.getTime() + 90 * 24 * 60 * 60 * 1000);

    // 1. Base Where Clause with strict Multi-Tenant store isolation
    const where: any = {
      branch: {
        ...(userStoreId ? { storeId: userStoreId } : {}),
      },
    };

    if (targetBranchId) {
      where.branchId = targetBranchId;
    }

    if (medicineIdParam) {
      const medId = parseInt(medicineIdParam, 10);
      if (!isNaN(medId) && medId > 0) {
        where.medicineId = medId;
      }
    }

    // Search: Batch No, Medicine Name, Generic Name, Company
    if (search) {
      where.OR = [
        { batchNo: { contains: search, mode: "insensitive" } },
        { medicine: { name: { contains: search, mode: "insensitive" } } },
        { medicine: { genericName: { contains: search, mode: "insensitive" } } },
        { medicine: { company: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Stock Filter
    if (stockParam === "in_stock") {
      where.quantity = { gt: 0 };
    } else if (stockParam === "out_of_stock") {
      where.quantity = { equals: 0 };
    } else if (stockParam === "low_stock") {
      where.quantity = { gt: 0, lte: 10 };
    }

    // Tier Filter at SQL level for high performance (1.8.3)
    if (tierParam === "expired") {
      where.expiryDate = { lte: todayMidnight };
    } else if (tierParam === "critical_30" || tierParam === "critical_30d") {
      where.expiryDate = { gt: todayMidnight, lte: thirtyDaysAhead };
    } else if (tierParam === "warning_90" || tierParam === "warning_90d") {
      where.expiryDate = { gt: thirtyDaysAhead, lte: ninetyDaysAhead };
    } else if (tierParam === "safe") {
      where.expiryDate = { gt: ninetyDaysAhead };
    }

    // 2. Recommend FEFO for POS Billing (1.8.2)
    // Returns the single earliest unexpired batch in stock
    if (recommendFefo && medicineIdParam) {
      const recommendedBatch = await prisma.batch.findFirst({
        where: {
          medicineId: parseInt(medicineIdParam, 10),
          quantity: { gt: 0 },
          expiryDate: { gt: todayMidnight }, // Expired batches locked from sale!
          ...(targetBranchId ? { branchId: targetBranchId } : {}),
          branch: {
            ...(userStoreId ? { storeId: userStoreId } : {}),
          },
        },
        include: {
          medicine: {
            select: { id: true, name: true, genericName: true, company: true, rackLocation: true, gstPercent: true },
          },
          branch: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: { expiryDate: "asc" }, // FEFO: Earliest expiry first
      });

      if (!recommendedBatch) {
        return NextResponse.json({
          success: true,
          data: null,
          message: "No unexpired active batch available for dispensing.",
        });
      }

      const expiryInfo = getExpiryStatus(recommendedBatch.expiryDate);
      return NextResponse.json({
        success: true,
        data: {
          id: recommendedBatch.id,
          batchNo: recommendedBatch.batchNo,
          mfgDate: recommendedBatch.mfgDate,
          expiryDate: recommendedBatch.expiryDate,
          quantity: recommendedBatch.quantity,
          mrp: Number(recommendedBatch.mrp),
          purchasePrice: canViewCostPrice ? Number(recommendedBatch.purchasePrice) : null,
          medicine: recommendedBatch.medicine,
          branch: recommendedBatch.branch,
          daysRemaining: expiryInfo.daysRemaining,
          tier: expiryInfo.tier,
          isExpired: expiryInfo.daysRemaining <= 0,
          locked: expiryInfo.daysRemaining <= 0,
        },
      });
    }

    // 3. Overall Tenant & Branch Expiry Summary Counters (1.8.3)
    const baseTenantWhere: any = {
      branch: {
        ...(userStoreId ? { storeId: userStoreId } : {}),
      },
      ...(targetBranchId ? { branchId: targetBranchId } : {}),
    };

    const [
      totalBatches,
      filteredCount,
      expiredBatches,
      criticalBatches,
      warningBatches,
      safeBatches,
      outOfStockCount,
      lowStockCount,
      allBatchesForUnits,
    ] = await Promise.all([
      prisma.batch.count({ where: baseTenantWhere }),
      prisma.batch.count({ where }),
      prisma.batch.count({
        where: {
          ...baseTenantWhere,
          expiryDate: { lte: todayMidnight },
        },
      }),
      prisma.batch.count({
        where: {
          ...baseTenantWhere,
          expiryDate: { gt: todayMidnight, lte: thirtyDaysAhead },
        },
      }),
      prisma.batch.count({
        where: {
          ...baseTenantWhere,
          expiryDate: { gt: thirtyDaysAhead, lte: ninetyDaysAhead },
        },
      }),
      prisma.batch.count({
        where: {
          ...baseTenantWhere,
          expiryDate: { gt: ninetyDaysAhead },
        },
      }),
      prisma.batch.count({
        where: {
          ...baseTenantWhere,
          quantity: { equals: 0 },
        },
      }),
      prisma.batch.count({
        where: {
          ...baseTenantWhere,
          quantity: { gt: 0, lte: 10 },
        },
      }),
      prisma.batch.findMany({
        where: baseTenantWhere,
        select: {
          quantity: true,
          purchasePrice: true,
          mrp: true,
          expiryDate: true,
        },
      }),
    ]);

    const totalUnits = allBatchesForUnits.reduce((acc, b) => acc + (b.quantity || 0), 0);
    const expiredUnits = allBatchesForUnits
      .filter((b) => new Date(b.expiryDate) <= todayMidnight)
      .reduce((acc, b) => acc + (b.quantity || 0), 0);

    // Calculate Estimated Financial Loss Value on Expired Batches
    const estimatedLossValue = allBatchesForUnits
      .filter((b) => new Date(b.expiryDate) <= todayMidnight)
      .reduce((acc, b) => {
        const unitVal = canViewCostPrice ? Number(b.purchasePrice) : Number(b.mrp);
        return acc + (b.quantity || 0) * (isNaN(unitVal) ? 0 : unitVal);
      }, 0);

    // 4. Fetch Paginated Records
    const skip = (page - 1) * limit;
    const batches = await prisma.batch.findMany({
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
            scheduleType: true,
            description: true,
          },
        },
        branch: {
          select: { id: true, code: true, name: true, active: true },
        },
        supplier: {
          select: { id: true, name: true, phone: true },
        },
      },
      orderBy: fefoMode
        ? [{ expiryDate: "asc" }, { quantity: "desc" }]
        : [{ updatedAt: "desc" }, { expiryDate: "asc" }],
      skip,
      take: limit,
    });

    // 5. Format & Enrich Output
    const formattedData = batches.map((b) => {
      const expiryInfo = getExpiryStatus(b.expiryDate);
      const isExpired = expiryInfo.daysRemaining <= 0;

      return {
        id: b.id,
        batchNo: b.batchNo,
        mfgDate: b.mfgDate ? b.mfgDate.toISOString().split("T")[0] : null,
        expiryDate: b.expiryDate.toISOString().split("T")[0],
        quantity: b.quantity,
        mrp: Number(b.mrp),
        purchasePrice: canViewCostPrice ? Number(b.purchasePrice) : null,
        supplierId: b.supplierId,
        branchId: b.branchId,
        medicine: b.medicine,
        branch: b.branch,
        supplier: b.supplier,
        tier: expiryInfo.tier,
        daysRemaining: expiryInfo.daysRemaining,
        expiryLabel: expiryInfo.label,
        isExpired,
        locked: isExpired, // Expired items locked from sales
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      };
    });

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
        totalBatches,
        totalUnits,
        expiredCount: expiredBatches,
        expiredUnits,
        criticalCount: criticalBatches,
        warningCount: warningBatches,
        safeCount: safeBatches,
        outOfStockCount,
        lowStockCount,
        estimatedLossValue: Number(estimatedLossValue.toFixed(2)),
      },
      canViewCostPrice,
    });
  } catch (error: any) {
    console.error("GET /api/admin/batches error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch batches" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Create New Batch with Boundaries & Anti-Duplicate Guards (1.8.1)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);
  const userStoreId = auth.session.storeId;

  try {
    const body = await req.json();
    const {
      medicineId,
      batchNo,
      expiryDate,
      mfgDate,
      quantity,
      purchasePrice,
      mrp,
      supplierId,
      branchId,
    } = body;

    // 1. Mandatory Fields Validation
    if (!medicineId || isNaN(parseInt(medicineId, 10))) {
      return NextResponse.json({ success: false, message: "Valid medicine ID is required." }, { status: 400 });
    }
    const cleanBatchNo = (batchNo || "").trim();
    if (!cleanBatchNo) {
      return NextResponse.json({ success: false, message: "Batch number is required." }, { status: 400 });
    }
    if (!expiryDate) {
      return NextResponse.json({ success: false, message: "Expiry date is required." }, { status: 400 });
    }

    const parsedExpiry = new Date(expiryDate);
    if (isNaN(parsedExpiry.getTime())) {
      return NextResponse.json({ success: false, message: "Invalid expiry date format." }, { status: 400 });
    }

    let parsedMfg: Date | null = null;
    if (mfgDate) {
      parsedMfg = new Date(mfgDate);
      if (isNaN(parsedMfg.getTime())) {
        return NextResponse.json({ success: false, message: "Invalid manufacturing date format." }, { status: 400 });
      }
      if (parsedMfg > parsedExpiry) {
        return NextResponse.json(
          { success: false, message: "Manufacturing date cannot be after the expiry date." },
          { status: 400 }
        );
      }
    }

    // 2. Truthy/Falsy Numbers Handling (0 is valid!)
    if (quantity === undefined || quantity === null || quantity === "" || isNaN(Number(quantity))) {
      return NextResponse.json({ success: false, message: "Valid quantity is required (>= 0)." }, { status: 400 });
    }
    const numQty = Number(quantity);
    if (numQty < 0 || !Number.isInteger(numQty)) {
      return NextResponse.json({ success: false, message: "Quantity must be a non-negative integer (>= 0)." }, { status: 400 });
    }
    const validQty = numQty;

    if (mrp === undefined || mrp === null || mrp === "" || isNaN(Number(mrp))) {
      return NextResponse.json({ success: false, message: "Valid MRP is required (>= 0)." }, { status: 400 });
    }
    const numMrp = Number(mrp);
    if (numMrp < 0) {
      return NextResponse.json({ success: false, message: "MRP cannot be negative." }, { status: 400 });
    }
    const validMrp = parseDecimal(mrp);

    let validPurchasePrice = 0;
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      const numPrice = Number(purchasePrice);
      if (isNaN(numPrice) || numPrice < 0) {
        return NextResponse.json({ success: false, message: "Cost price cannot be negative." }, { status: 400 });
      }
      validPurchasePrice = parseDecimal(purchasePrice);
    }

    // 3. Verify Medicine Exists
    const targetMedicine = await prisma.medicine.findUnique({
      where: { id: parseInt(medicineId, 10) },
      select: { id: true, name: true },
    });
    if (!targetMedicine) {
      return NextResponse.json({ success: false, message: "Medicine not found in catalog." }, { status: 404 });
    }

    // 4. Resolve Target Branch & Enforce Multi-Tenant Isolation
    let effectiveBranchId: number;
    if (branchId) {
      const parsedBranchId = parseInt(branchId, 10);
      const branchObj = await prisma.branch.findFirst({
        where: {
          id: parsedBranchId,
          ...(userStoreId ? { storeId: userStoreId } : {}),
        },
      });
      if (!branchObj) {
        return NextResponse.json(
          { success: false, message: "Branch not found or does not belong to your store." },
          { status: 404 }
        );
      }
      if (!canAccessBranch(auth.session, branchObj.id)) {
        return NextResponse.json(
          { success: false, message: "Forbidden: You are not authorized to create batches in this branch." },
          { status: 403 }
        );
      }
      effectiveBranchId = branchObj.id;
    } else if (auth.session.branchId) {
      effectiveBranchId = auth.session.branchId;
    } else {
      // Find main branch for store
      const mainBranch = await prisma.branch.findFirst({
        where: {
          isMain: true,
          ...(userStoreId ? { storeId: userStoreId } : {}),
        },
      });
      if (!mainBranch) {
        return NextResponse.json(
          { success: false, message: "No active store branch found to assign batch." },
          { status: 400 }
        );
      }
      effectiveBranchId = mainBranch.id;
    }

    // 5. Case-Insensitive Duplicate Check on [medicineId, batchNo, branchId]
    const existingBatch = await prisma.batch.findFirst({
      where: {
        medicineId: targetMedicine.id,
        batchNo: { equals: cleanBatchNo, mode: "insensitive" },
        branchId: effectiveBranchId,
      },
    });

    if (existingBatch) {
      return NextResponse.json(
        {
          success: false,
          message: `Batch "${cleanBatchNo}" already exists for ${targetMedicine.name} in this store branch.`,
        },
        { status: 409 }
      );
    }

    // 6. Validate Supplier if Provided
    let effectiveSupplierId: number | null = null;
    if (supplierId) {
      const parsedSup = parseInt(supplierId, 10);
      const supplierExists = await prisma.supplier.findUnique({ where: { id: parsedSup } });
      if (supplierExists) {
        effectiveSupplierId = supplierExists.id;
      }
    }

    // 7. Atomic DB Insertion
    const newBatch = await prisma.batch.create({
      data: {
        medicineId: targetMedicine.id,
        batchNo: cleanBatchNo,
        mfgDate: parsedMfg,
        expiryDate: parsedExpiry,
        quantity: validQty,
        purchasePrice: validPurchasePrice,
        mrp: validMrp,
        supplierId: effectiveSupplierId,
        branchId: effectiveBranchId,
      },
      include: {
        medicine: { select: { id: true, name: true, company: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    // 8. Audit Logging
    await logAudit({
      action: "BATCH_CREATED",
      entity: "Batch",
      entityId: newBatch.id,
      storeId: userStoreId,
      branchId: effectiveBranchId,
      userId: auth.session.userId,
      ipAddress: clientIp,
      details: {
        batchNo: newBatch.batchNo,
        medicineName: targetMedicine.name,
        quantity: validQty,
        mrp: validMrp,
        purchasePrice: validPurchasePrice,
        expiryDate: newBatch.expiryDate,
        branchId: effectiveBranchId,
      },
    });

    const expiryInfo = getExpiryStatus(newBatch.expiryDate);
    const canViewCostPrice =
      auth.session.role === "admin" || (auth.session.permissions || []).includes("view_cost_price");

    return NextResponse.json({
      success: true,
      message: `Batch "${cleanBatchNo}" created successfully for ${targetMedicine.name}.`,
      data: {
        ...newBatch,
        purchasePrice: canViewCostPrice ? Number(newBatch.purchasePrice) : null,
        tier: expiryInfo.tier,
        daysRemaining: expiryInfo.daysRemaining,
        isExpired: expiryInfo.daysRemaining <= 0,
      },
    });
  } catch (error: any) {
    console.error("POST /api/admin/batches error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to create batch record." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT: Update Batch with Partial Update Preservation & IDOR Guards (1.8.1)
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);
  const userStoreId = auth.session.storeId;

  try {
    const body = await req.json();
    const { id, batchNo, expiryDate, mfgDate, quantity, purchasePrice, mrp, supplierId, branchId } = body;

    const batchId = parseInt(id, 10);
    if (!batchId || isNaN(batchId)) {
      return NextResponse.json({ success: false, message: "Valid batch ID is required." }, { status: 400 });
    }

    // 1. Fetch Existing Batch with Multi-Tenant Ownership Guard (Zero IDOR)
    const existing = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        branch: { select: { id: true, storeId: true } },
        medicine: { select: { id: true, name: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Batch record not found." }, { status: 404 });
    }

    if (userStoreId && existing.branch?.storeId && existing.branch.storeId !== userStoreId) {
      return NextResponse.json(
        { success: false, message: "Security Violation: Access denied to other store tenants." },
        { status: 403 }
      );
    }

    if (!canAccessBranch(auth.session, existing.branchId)) {
      return NextResponse.json(
        { success: false, message: "Security Violation: You do not have access to this store branch." },
        { status: 403 }
      );
    }

    // 2. Partial Field Resolutions (Preserve existing if not provided!)
    const cleanBatchNo = batchNo !== undefined ? (batchNo || "").trim() : existing.batchNo;
    if (!cleanBatchNo) {
      return NextResponse.json({ success: false, message: "Batch number cannot be empty." }, { status: 400 });
    }

    let parsedExpiry = existing.expiryDate;
    if (expiryDate !== undefined) {
      parsedExpiry = new Date(expiryDate);
      if (isNaN(parsedExpiry.getTime())) {
        return NextResponse.json({ success: false, message: "Invalid expiry date format." }, { status: 400 });
      }
    }

    let parsedMfg = existing.mfgDate;
    if (mfgDate !== undefined) {
      if (mfgDate) {
        parsedMfg = new Date(mfgDate);
        if (isNaN(parsedMfg.getTime())) {
          return NextResponse.json({ success: false, message: "Invalid manufacturing date format." }, { status: 400 });
        }
      } else {
        parsedMfg = null;
      }
    }

    if (parsedMfg && parsedMfg > parsedExpiry) {
      return NextResponse.json(
        { success: false, message: "Manufacturing date cannot be after the expiry date." },
        { status: 400 }
      );
    }

    const canViewCostPrice =
      auth.session.role === "admin" || (auth.session.permissions || []).includes("view_cost_price");

    // Falsy-zero preservation for quantity, purchasePrice, and MRP with boundary checks
    let finalQty = existing.quantity;
    if (quantity !== undefined && quantity !== null && quantity !== "") {
      const q = Number(quantity);
      if (isNaN(q) || q < 0 || !Number.isInteger(q)) {
        return NextResponse.json(
          { success: false, message: "Quantity must be a valid non-negative integer (>= 0)." },
          { status: 400 }
        );
      }
      finalQty = q;
    }

    let finalMrp = Number(existing.mrp);
    if (mrp !== undefined && mrp !== null && mrp !== "") {
      const m = Number(mrp);
      if (isNaN(m) || m < 0) {
        return NextResponse.json(
          { success: false, message: "MRP must be a valid non-negative number (>= 0)." },
          { status: 400 }
        );
      }
      finalMrp = parseDecimal(m);
    }

    let finalPurchasePrice = Number(existing.purchasePrice);
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      if (!canViewCostPrice) {
        // Staff without view_cost_price cannot overwrite or zero-out purchasePrice!
        finalPurchasePrice = Number(existing.purchasePrice);
      } else {
        const p = Number(purchasePrice);
        if (isNaN(p) || p < 0) {
          return NextResponse.json(
            { success: false, message: "Cost price must be a valid non-negative number (>= 0)." },
            { status: 400 }
          );
        }
        finalPurchasePrice = parseDecimal(p);
      }
    }

    // Branch Reassignment Guard
    let targetBranchId = existing.branchId;
    if (branchId !== undefined && branchId !== null) {
      const bId = parseInt(branchId, 10);
      if (!isNaN(bId) && bId !== existing.branchId) {
        const branchCheck = await prisma.branch.findFirst({
          where: {
            id: bId,
            ...(userStoreId ? { storeId: userStoreId } : {}),
          },
        });
        if (!branchCheck) {
          return NextResponse.json({ success: false, message: "Selected branch does not exist." }, { status: 400 });
        }
        if (!canAccessBranch(auth.session, bId)) {
          return NextResponse.json({ success: false, message: "Forbidden: Cannot assign to this branch." }, { status: 403 });
        }
        targetBranchId = bId;
      }
    }

    // Duplicate Check on Update
    if (cleanBatchNo.toLowerCase() !== existing.batchNo.toLowerCase() || targetBranchId !== existing.branchId) {
      const duplicate = await prisma.batch.findFirst({
        where: {
          id: { not: batchId },
          medicineId: existing.medicineId,
          batchNo: { equals: cleanBatchNo, mode: "insensitive" },
          branchId: targetBranchId,
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            message: `Batch "${cleanBatchNo}" already exists for this medicine in target branch.`,
          },
          { status: 409 }
        );
      }
    }

    // 3. Execute DB Update
    const updated = await prisma.batch.update({
      where: { id: batchId },
      data: {
        batchNo: cleanBatchNo,
        mfgDate: parsedMfg,
        expiryDate: parsedExpiry,
        quantity: finalQty,
        purchasePrice: finalPurchasePrice,
        mrp: finalMrp,
        supplierId: supplierId !== undefined ? (supplierId ? parseInt(supplierId, 10) : null) : existing.supplierId,
        branchId: targetBranchId,
      },
      include: {
        medicine: { select: { id: true, name: true, company: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    // 4. Audit Logging
    await logAudit({
      action: "BATCH_EDIT",
      entity: "Batch",
      entityId: updated.id,
      storeId: userStoreId,
      branchId: updated.branchId,
      userId: auth.session.userId,
      ipAddress: clientIp,
      details: {
        batchNo: updated.batchNo,
        previousQty: existing.quantity,
        newQty: finalQty,
        previousMrp: Number(existing.mrp),
        newMrp: finalMrp,
        previousPurchasePrice: Number(existing.purchasePrice),
        newPurchasePrice: finalPurchasePrice,
      },
    });

    // 5. Stock Adjustment Audit Trail (if quantity was modified)
    if (finalQty !== existing.quantity) {
      const qtyDiff = finalQty - existing.quantity;
      await prisma.stockAdjustment.create({
        data: {
          batchId: updated.id,
          medicineId: updated.medicineId,
          branchId: updated.branchId,
          type: qtyDiff > 0 ? "add" : "remove",
          quantity: qtyDiff,
          reason: `Batch Details Edit: Stock modified from ${existing.quantity} to ${finalQty} units`,
          oldQty: existing.quantity,
          newQty: finalQty,
          userId: auth.session.userId,
        },
      });
    }

    const expiryInfo = getExpiryStatus(updated.expiryDate);

    return NextResponse.json({
      success: true,
      message: `Batch "${updated.batchNo}" updated successfully.`,
      data: {
        ...updated,
        purchasePrice: canViewCostPrice ? Number(updated.purchasePrice) : null,
        tier: expiryInfo.tier,
        daysRemaining: expiryInfo.daysRemaining,
        isExpired: expiryInfo.daysRemaining <= 0,
      },
    });
  } catch (error: any) {
    console.error("PUT /api/admin/batches error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update batch." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: Remove Batch with Sales History Safety Lock (1.8.1)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const batchId = parseInt(searchParams.get("id") || "", 10);
  const clientIp = getClientIp(req);
  const userStoreId = auth.session.storeId;

  if (!batchId || isNaN(batchId)) {
    return NextResponse.json({ success: false, message: "Valid batch ID is required." }, { status: 400 });
  }

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        branch: { select: { id: true, storeId: true } },
        _count: {
          select: {
            saleItems: true,
            returnItems: true,
            stockAdjustments: true,
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, message: "Batch not found." }, { status: 404 });
    }

    if (userStoreId && batch.branch?.storeId && batch.branch.storeId !== userStoreId) {
      return NextResponse.json(
        { success: false, message: "Security Violation: Access denied to other store tenants." },
        { status: 403 }
      );
    }

    if (!canAccessBranch(auth.session, batch.branchId)) {
      return NextResponse.json(
        { success: false, message: "Security Violation: You do not have access to this store branch." },
        { status: 403 }
      );
    }

    // Strict Safety Guard: Block deletion if batch is part of historical sales or adjustments
    if (batch._count.saleItems > 0 || batch._count.returnItems > 0 || batch._count.stockAdjustments > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete batch "${batch.batchNo}" because it has ${batch._count.saleItems} linked sale records and audit history. To zero out remaining stock, please perform a Stock Adjustment write-off instead.`,
        },
        { status: 400 }
      );
    }

    await prisma.batch.delete({
      where: { id: batchId },
    });

    await logAudit({
      action: "BATCH_DELETED",
      entity: "Batch",
      entityId: batchId,
      storeId: userStoreId,
      branchId: batch.branchId,
      userId: auth.session.userId,
      ipAddress: clientIp,
      details: {
        batchNo: batch.batchNo,
        medicineId: batch.medicineId,
        quantity: batch.quantity,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Batch "${batch.batchNo}" has been deleted.`,
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/batches error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to delete batch." },
      { status: 500 }
    );
  }
}
