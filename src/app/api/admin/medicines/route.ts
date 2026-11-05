import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";

interface PackMetadata {
  packUnit?: string;      // e.g. "Strip", "Box", "Bottle", "Vial", "Tube"
  looseUnit?: string;     // e.g. "Tablet", "Capsule", "ml", "gm", "Dose"
  unitsPerPack?: number;  // e.g. 10 tablets per strip
  minStockLevel?: number; // low-stock threshold
  notes?: string;
  rackNo?: string;
  shelfNo?: string;
  boxNo?: string;
}

/**
 * Helper to encode/parse packaging and locator metadata in description
 */
export function parsePackMetadata(description: string | null | undefined): { cleanDesc: string; meta: PackMetadata } {
  if (!description) {
    return {
      cleanDesc: "",
      meta: { packUnit: "Strip", looseUnit: "Tablet", unitsPerPack: 10, minStockLevel: 10 },
    };
  }

  try {
    const metaMatch = description.match(/<!--PACK_META:({.*?})-->/);
    if (metaMatch && metaMatch[1]) {
      const parsed = JSON.parse(metaMatch[1]);
      const clean = description.replace(/<!--PACK_META:({.*?})-->/, "").trim();
      return {
        cleanDesc: clean,
        meta: {
          packUnit: parsed.packUnit || "Strip",
          looseUnit: parsed.looseUnit || "Tablet",
          unitsPerPack: typeof parsed.unitsPerPack === "number" ? parsed.unitsPerPack : 10,
          minStockLevel: typeof parsed.minStockLevel === "number" ? parsed.minStockLevel : 10,
          notes: parsed.notes || "",
          rackNo: parsed.rackNo || "",
          shelfNo: parsed.shelfNo || "",
          boxNo: parsed.boxNo || "",
        },
      };
    }
  } catch (e) {
    // Fallback if parsing fails
  }

  return {
    cleanDesc: description,
    meta: { packUnit: "Strip", looseUnit: "Tablet", unitsPerPack: 10, minStockLevel: 10 },
  };
}

export function formatPackMetadata(cleanDesc: string, meta: PackMetadata): string {
  const metaStr = JSON.stringify(meta);
  const trimmed = cleanDesc.trim();
  return trimmed ? `${trimmed}\n<!--PACK_META:${metaStr}-->` : `<!--PACK_META:${metaStr}-->`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET: Paginated & Filtered Medicine Master Catalog (Screen 9 & Module 1.6/1.7)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const category = (searchParams.get("category") || "").trim();
  const scheduleType = (searchParams.get("scheduleType") || "").trim();
  const stockFilter = (searchParams.get("stock") || "").trim(); // "in_stock", "low_stock", "out_of_stock"
  const branchParam = searchParams.get("branchId");

  // Multi-Branch Isolation:
  // Staff accounts are strictly limited to their assigned store branch.
  // Admins can toggle between specific active branch or global view ("all").
  const effectiveBranchId = auth.session.branchId
    ? auth.session.branchId
    : branchParam && branchParam !== "all"
      ? parseInt(branchParam, 10)
      : null;

  try {
    // 1. Build SQL where clause
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { genericName: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
        { hsnCode: { contains: search, mode: "insensitive" } },
        { rackLocation: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category && category !== "all") {
      where.category = category;
    }

    if (scheduleType && scheduleType !== "all") {
      where.scheduleType = scheduleType;
    }

    // High-performance SQL-level inventory stock status filter (1.7.6)
    if (stockFilter === "in_stock") {
      where.batches = {
        some: {
          quantity: { gt: 0 },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        },
      };
    } else if (stockFilter === "out_of_stock") {
      where.batches = {
        none: {
          quantity: { gt: 0 },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        },
      };
    } else if (stockFilter === "low_stock") {
      where.batches = {
        some: {
          quantity: { gt: 0 },
          ...(effectiveBranchId ? { branchId: effectiveBranchId } : {}),
        },
      };
    }

    // 2. Fetch summary counts & categories in parallel
    const batchWhere: any = { quantity: { gt: 0 } };
    if (effectiveBranchId) {
      batchWhere.branchId = effectiveBranchId;
    }

    const [totalMeds, totalBatches, rxCount, categoriesList, activeBranchObj] = await Promise.all([
      prisma.medicine.count({ where }),
      prisma.batch.count({ where: batchWhere }),
      prisma.medicine.count({
        where: {
          scheduleType: { in: ["schedule_h", "schedule_h1", "narcotic"] },
        },
      }),
      prisma.category.findMany({ orderBy: { name: "asc" } }),
      effectiveBranchId
        ? prisma.branch.findUnique({
          where: { id: effectiveBranchId },
          select: { id: true, code: true, name: true, isMain: true },
        })
        : null,
    ]);

    // 3. Paginated medicine items with branch-specific batches
    const skip = (page - 1) * limit;
    const medicines = await prisma.medicine.findMany({
      where,
      include: {
        batches: {
          where: effectiveBranchId ? { branchId: effectiveBranchId } : {},
          select: {
            id: true,
            batchNo: true,
            quantity: true,
            expiryDate: true,
            mrp: true,
            purchasePrice: true,
            branchId: true,
            branch: {
              select: { id: true, code: true, name: true },
            },
          },
          orderBy: { expiryDate: "asc" }, // FEFO order
        },
      },
      orderBy: { name: "asc" },
      skip,
      take: limit,
    });

    // 4. Transform and calculate batch aggregation & packaging
    const now = new Date();
    const formattedMedicines = medicines.map((m) => {
      const { cleanDesc, meta } = parsePackMetadata(m.description);

      const totalQuantity = m.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
      const activeBatches = m.batches.filter((b) => b.quantity > 0);
      const unexpiredActiveBatches = activeBatches.filter((b) => new Date(b.expiryDate) > now);
      const validBatchesForPricing = unexpiredActiveBatches.length > 0 ? unexpiredActiveBatches : activeBatches;
      const nearestExpiry = activeBatches.length > 0 ? activeBatches[0].expiryDate : null;

      const mrpList = validBatchesForPricing.map((b) => Number(b.mrp)).filter((val) => !isNaN(val) && val > 0);
      const minMrp = mrpList.length > 0 ? Math.min(...mrpList) : null;
      const maxMrp = mrpList.length > 0 ? Math.max(...mrpList) : null;

      // Loose tablet price calculation (e.g. MRP / unitsPerPack)
      const unitsPerPack = meta.unitsPerPack || 10;
      const loosePrice = maxMrp ? +(maxMrp / unitsPerPack).toFixed(2) : null;

      // Regulatory Rx requirement
      const requiresPrescription = m.scheduleType === "schedule_h" || m.scheduleType === "schedule_h1" || m.scheduleType === "narcotic";

      return {
        id: m.id,
        name: m.name,
        genericName: m.genericName,
        company: m.company,
        category: m.category,
        customCategory: m.customCategory,
        hsnCode: m.hsnCode,
        gstPercent: Number(m.gstPercent),
        description: cleanDesc,
        rackLocation: m.rackLocation,
        scheduleType: m.scheduleType,
        requiresPrescription,
        packaging: {
          packUnit: meta.packUnit || "Strip",
          looseUnit: meta.looseUnit || "Tablet",
          unitsPerPack,
          minStockLevel: meta.minStockLevel !== undefined ? meta.minStockLevel : 10,
          loosePrice,
        },
        rackDetails: {
          rackNo: meta.rackNo || (m.rackLocation ? m.rackLocation.split(",")[0]?.trim() : ""),
          shelfNo: meta.shelfNo || "",
          boxNo: meta.boxNo || "",
        },
        stockSummary: {
          totalQuantity,
          batchCount: m.batches.length,
          activeBatchCount: activeBatches.length,
          nearestExpiry,
          minMrp,
          maxMrp,
          isLowStock: totalQuantity > 0 && totalQuantity <= (meta.minStockLevel !== undefined ? meta.minStockLevel : 10),
          isOutOfStock: totalQuantity <= 0,
        },
        batches: m.batches,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    });

    // Optional low-stock status threshold post-filter
    let results = formattedMedicines;
    if (stockFilter === "low_stock") {
      results = results.filter((r) => r.stockSummary.isLowStock);
    }

    return NextResponse.json({
      success: true,
      data: results,
      pagination: {
        page,
        limit,
        totalItems: totalMeds,
        totalPages: Math.ceil(totalMeds / limit) || 1,
      },
      stats: {
        totalMedicines: totalMeds,
        totalBatches,
        prescriptionCount: rxCount,
      },
      activeBranch: activeBranchObj,
      effectiveBranchId,
      categories: categoriesList,
    });
  } catch (err: any) {
    console.error("GET /api/admin/medicines error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to load medicine master catalog." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST: Create New Medicine Master Record (1.6.1 - 1.6.4 & 1.7.4)
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const {
      name,
      genericName,
      company,
      category,
      customCategory,
      hsnCode,
      gstPercent,
      description,
      rackLocation,
      scheduleType,
      packUnit,
      looseUnit,
      unitsPerPack,
      minStockLevel,
      rackNo,
      shelfNo,
      boxNo,
    } = body;

    // 1. Validation
    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, message: "Medicine name is required." }, { status: 400 });
    }
    if (!company || !company.trim()) {
      return NextResponse.json({ success: false, message: "Manufacturer / Company name is required." }, { status: 400 });
    }
    if (!category || !category.trim()) {
      return NextResponse.json({ success: false, message: "Dosage form / Category is required." }, { status: 400 });
    }

    const trimmedName = name.trim();
    const trimmedCompany = company.trim();

    // 2. Duplicate Detection: Check case-insensitive name match
    const existing = await prisma.medicine.findFirst({
      where: {
        name: { equals: trimmedName, mode: "insensitive" },
        company: { equals: trimmedCompany, mode: "insensitive" },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message: `Medicine "${trimmedName}" from "${trimmedCompany}" already exists in the catalog.`,
        },
        { status: 400 }
      );
    }

    // 3. Handle Custom "Other" Category (1.7.4)
    let finalCategory = category.trim();
    if (finalCategory === "Other" && customCategory && customCategory.trim()) {
      const customName = customCategory.trim();
      const existingCat = await prisma.category.findFirst({
        where: { name: { equals: customName, mode: "insensitive" } },
      });

      if (!existingCat) {
        await prisma.category.create({
          data: { name: customName, type: "custom" },
        });
      }
      finalCategory = customName;
    }

    // 4. Format packaging & rack metadata
    const parsedRatio = unitsPerPack !== undefined && unitsPerPack !== null && unitsPerPack !== "" ? parseInt(unitsPerPack, 10) : 10;
    const validUnitsPerPack = isNaN(parsedRatio) || parsedRatio <= 0 ? 10 : parsedRatio;

    const parsedMinStock = minStockLevel !== undefined && minStockLevel !== null && minStockLevel !== "" ? parseInt(minStockLevel, 10) : 10;
    const validMinStock = isNaN(parsedMinStock) || parsedMinStock < 0 ? 0 : parsedMinStock;

    // Compose formatted rack location string if not explicitly given
    let finalRackLocation = (rackLocation || "").trim();
    if (!finalRackLocation && (rackNo || shelfNo || boxNo)) {
      const parts: string[] = [];
      if (rackNo && rackNo.trim()) parts.push(`Rack: ${rackNo.trim().replace(/^Rack:\s*/i, "")}`);
      if (shelfNo && shelfNo.trim()) parts.push(`Shelf: ${shelfNo.trim().replace(/^Shelf:\s*/i, "")}`);
      if (boxNo && boxNo.trim()) parts.push(`Box: ${boxNo.trim().replace(/^Box:\s*/i, "")}`);
      finalRackLocation = parts.join(" • ");
    }

    const fullDescription = formatPackMetadata(description || "", {
      packUnit: packUnit || "Strip",
      looseUnit: looseUnit || "Tablet",
      unitsPerPack: validUnitsPerPack,
      minStockLevel: validMinStock,
      rackNo: rackNo ? rackNo.trim().replace(/^Rack:\s*/i, "") : "",
      shelfNo: shelfNo ? shelfNo.trim().replace(/^Shelf:\s*/i, "") : "",
      boxNo: boxNo ? boxNo.trim().replace(/^Box:\s*/i, "") : "",
    });

    const parsedGst = gstPercent !== undefined && gstPercent !== null && gstPercent !== "" ? parseFloat(gstPercent) : 12;
    const validGst = isNaN(parsedGst) || parsedGst < 0 ? 12 : parsedGst;

    // 5. Create Medicine in DB
    const newMedicine = await prisma.medicine.create({
      data: {
        name: trimmedName,
        genericName: genericName ? genericName.trim() : null,
        company: trimmedCompany,
        category: finalCategory,
        customCategory: finalCategory !== category ? finalCategory : null,
        hsnCode: hsnCode ? hsnCode.trim() : null,
        gstPercent: validGst,
        rackLocation: finalRackLocation || null,
        scheduleType: scheduleType || "normal",
        description: fullDescription,
      },
    });

    // 6. Audit Logging
    await logAudit({
      action: "MEDICINE_CREATED",
      entity: "Medicine",
      entityId: newMedicine.id,
      storeId: auth.session.storeId,
      branchId: auth.session.branchId,
      userId: auth.session.userId,
      ipAddress: clientIp,
      details: {
        name: newMedicine.name,
        company: newMedicine.company,
        category: newMedicine.category,
        scheduleType: newMedicine.scheduleType,
        unitsPerPack: validUnitsPerPack,
        rackLocation: finalRackLocation,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Medicine "${newMedicine.name}" has been successfully added to catalog.`,
      data: newMedicine,
    });
  } catch (err: any) {
    console.error("POST /api/admin/medicines error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to create medicine record." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT: Update Medicine Master Record (1.6.1 - 1.6.4)
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const {
      id,
      name,
      genericName,
      company,
      category,
      customCategory,
      hsnCode,
      gstPercent,
      description,
      rackLocation,
      scheduleType,
      packUnit,
      looseUnit,
      unitsPerPack,
      minStockLevel,
      rackNo,
      shelfNo,
      boxNo,
    } = body;

    const medicineId = parseInt(id, 10);
    if (!medicineId) {
      return NextResponse.json({ success: false, message: "Valid medicine ID is required." }, { status: 400 });
    }

    const targetMed = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!targetMed) {
      return NextResponse.json({ success: false, message: "Medicine record not found." }, { status: 404 });
    }

    const trimmedName = (name !== undefined ? name : targetMed.name).trim();
    const trimmedCompany = (company !== undefined ? company : targetMed.company).trim();

    // Duplicate Detection on PUT (Bug 12): check if another medicine already has this name & company
    if (trimmedName.toLowerCase() !== targetMed.name.toLowerCase() || trimmedCompany.toLowerCase() !== targetMed.company.toLowerCase()) {
      const duplicate = await prisma.medicine.findFirst({
        where: {
          id: { not: medicineId },
          name: { equals: trimmedName, mode: "insensitive" },
          company: { equals: trimmedCompany, mode: "insensitive" },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            message: `Another medicine named "${trimmedName}" from "${trimmedCompany}" already exists in the catalog.`,
          },
          { status: 400 }
        );
      }
    }

    // Handle Custom "Other" Category (1.7.4)
    let finalCategory = category !== undefined ? category.trim() : targetMed.category;
    let finalCustomCategory = targetMed.customCategory;

    if (category !== undefined) {
      if (finalCategory === "Other" && customCategory && customCategory.trim()) {
        const customName = customCategory.trim();
        const existingCat = await prisma.category.findFirst({
          where: { name: { equals: customName, mode: "insensitive" } },
        });

        if (!existingCat) {
          await prisma.category.create({
            data: { name: customName, type: "custom" },
          });
        }
        finalCategory = customName;
        finalCustomCategory = customName;
      } else {
        finalCustomCategory = null;
      }
    }

    // Preserve existing pack metadata and rack locator (Bugs 8 & 9)
    const { cleanDesc: existingCleanDesc, meta: existingMeta } = parsePackMetadata(targetMed.description);
    const finalCleanDesc = description !== undefined ? (description || "").trim() : existingCleanDesc;

    const finalPackUnit = packUnit !== undefined && packUnit !== "" ? packUnit : existingMeta.packUnit || "Strip";
    const finalLooseUnit = looseUnit !== undefined && looseUnit !== "" ? looseUnit : existingMeta.looseUnit || "Tablet";

    const parsedRatio = unitsPerPack !== undefined && unitsPerPack !== null && unitsPerPack !== "" ? parseInt(unitsPerPack, 10) : (existingMeta.unitsPerPack ?? 10);
    const validUnitsPerPack = typeof parsedRatio === "number" && !isNaN(parsedRatio) && parsedRatio > 0 ? parsedRatio : 10;

    const parsedMinStock = minStockLevel !== undefined && minStockLevel !== null && minStockLevel !== "" ? parseInt(minStockLevel, 10) : (existingMeta.minStockLevel ?? 10);
    const validMinStock = typeof parsedMinStock === "number" && !isNaN(parsedMinStock) && parsedMinStock >= 0 ? parsedMinStock : 0;

    const finalRackNo = rackNo !== undefined ? (rackNo ? rackNo.trim().replace(/^Rack:\s*/i, "") : "") : (existingMeta.rackNo || "");
    const finalShelfNo = shelfNo !== undefined ? (shelfNo ? shelfNo.trim().replace(/^Shelf:\s*/i, "") : "") : (existingMeta.shelfNo || "");
    const finalBoxNo = boxNo !== undefined ? (boxNo ? boxNo.trim().replace(/^Box:\s*/i, "") : "") : (existingMeta.boxNo || "");

    // Compose Rack Locator without redundant prefixes (Bug 9)
    let finalRackLocation = targetMed.rackLocation;
    if (rackLocation !== undefined) {
      finalRackLocation = rackLocation ? rackLocation.trim() : null;
    } else if (rackNo !== undefined || shelfNo !== undefined || boxNo !== undefined) {
      const parts: string[] = [];
      if (finalRackNo) parts.push(`Rack: ${finalRackNo}`);
      if (finalShelfNo) parts.push(`Shelf: ${finalShelfNo}`);
      if (finalBoxNo) parts.push(`Box: ${finalBoxNo}`);
      finalRackLocation = parts.length > 0 ? parts.join(" • ") : null;
    }

    const fullDescription = formatPackMetadata(finalCleanDesc, {
      packUnit: finalPackUnit,
      looseUnit: finalLooseUnit,
      unitsPerPack: validUnitsPerPack,
      minStockLevel: validMinStock,
      rackNo: finalRackNo,
      shelfNo: finalShelfNo,
      boxNo: finalBoxNo,
      notes: existingMeta.notes || "",
    });

    let validGst = Number(targetMed.gstPercent);
    if (gstPercent !== undefined && gstPercent !== null && gstPercent !== "") {
      const parsedGst = parseFloat(gstPercent);
      if (!isNaN(parsedGst) && parsedGst >= 0) {
        validGst = parsedGst;
      }
    }

    const updatedMedicine = await prisma.medicine.update({
      where: { id: medicineId },
      data: {
        name: trimmedName,
        genericName: genericName !== undefined ? (genericName ? genericName.trim() : null) : targetMed.genericName,
        company: trimmedCompany,
        category: finalCategory,
        customCategory: finalCustomCategory,
        hsnCode: hsnCode !== undefined ? (hsnCode ? hsnCode.trim() : null) : targetMed.hsnCode,
        gstPercent: validGst,
        rackLocation: finalRackLocation,
        scheduleType: scheduleType || targetMed.scheduleType,
        description: fullDescription,
      },
    });

    // Audit Logging
    await logAudit({
      action: "MEDICINE_UPDATED",
      entity: "Medicine",
      entityId: updatedMedicine.id,
      storeId: auth.session.storeId,
      branchId: auth.session.branchId,
      userId: auth.session.userId,
      ipAddress: clientIp,
      details: {
        name: updatedMedicine.name,
        company: updatedMedicine.company,
        category: updatedMedicine.category,
        scheduleType: updatedMedicine.scheduleType,
        rackLocation: finalRackLocation,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Medicine "${updatedMedicine.name}" has been updated.`,
      data: updatedMedicine,
    });
  } catch (err: any) {
    console.error("PUT /api/admin/medicines error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to update medicine." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE: Remove Medicine (1.7.5 Safety Rule: Blocked if batches/sales exist)
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const medicineId = parseInt(searchParams.get("id") || "", 10);
  const clientIp = getClientIp(req);

  if (!medicineId) {
    return NextResponse.json({ success: false, message: "Valid medicine ID is required." }, { status: 400 });
  }

  try {
    const med = await prisma.medicine.findUnique({
      where: { id: medicineId },
      include: {
        _count: {
          select: {
            batches: true,
            saleItems: true,
            poItems: true,
            returnItems: true,
            stockAdjustments: true,
          },
        },
      },
    });

    if (!med) {
      return NextResponse.json({ success: false, message: "Medicine not found." }, { status: 404 });
    }

    // Safety Rule 1.7.5: Block deletion if ANY batch exists
    if (med._count.batches > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete "${med.name}": ${med._count.batches} inventory batch record(s) exist for this medicine. Delete or clear the batches first.`,
        },
        { status: 400 }
      );
    }

    // Safety Rule: Block if historical sales, purchase orders, or stock adjustments exist
    if (
      med._count.saleItems > 0 ||
      med._count.returnItems > 0 ||
      med._count.poItems > 0 ||
      med._count.stockAdjustments > 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete "${med.name}": Linked transaction records exist (Purchases: ${med._count.poItems}, Stock Adjustments: ${med._count.stockAdjustments}, Sales: ${med._count.saleItems}, Returns: ${med._count.returnItems}).`,
        },
        { status: 400 }
      );
    }

    await prisma.medicine.delete({ where: { id: medicineId } });

    // Audit Logging
    await logAudit({
      action: "MEDICINE_DELETED",
      entity: "Medicine",
      entityId: medicineId,
      storeId: auth.session.storeId,
      branchId: auth.session.branchId,
      userId: auth.session.userId,
      ipAddress: clientIp,
      details: {
        name: med.name,
        company: med.company,
        category: med.category,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Medicine "${med.name}" has been permanently removed from the catalog.`,
    });
  } catch (err: any) {
    console.error("DELETE /api/admin/medicines error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to delete medicine." },
      { status: 500 }
    );
  }
}
