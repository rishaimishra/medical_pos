import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest, SessionPayload } from "@/lib/auth";
import { canAccessBranch, canAccessPage, hasPermission } from "@/lib/rbac";

export interface ReportAuthContext {
  authorized: boolean;
  response?: NextResponse;
  session?: SessionPayload;
  storeId?: number | null;
  branchId?: number | null;
}

export async function authorizeReportRequest(
  req: NextRequest,
  branchIdParam?: string | null
): Promise<ReportAuthContext> {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return {
      authorized: false,
      response: NextResponse.json({ success: false, message: auth.message || "Unauthorized" }, { status: auth.status }),
    };
  }

  if (!canAccessPage(auth.session, "/admin/reports") && !hasPermission(auth.session, "view_profit_reports")) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, message: "Forbidden: 'view_profit_reports' permission required" },
        { status: 403 }
      ),
    };
  }

  const storeId = auth.session.storeId ?? null;
  let targetBranchId: number | null = auth.session.branchId ?? null;

  if (branchIdParam && branchIdParam !== "all") {
    const bId = parseInt(branchIdParam, 10);
    if (isNaN(bId)) {
      return {
        authorized: false,
        response: NextResponse.json({ success: false, message: "Invalid branchId" }, { status: 400 }),
      };
    }
    if (auth.session.branchId && auth.session.branchId !== bId) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, message: "Forbidden: Unauthorized branch access" },
          { status: 403 }
        ),
      };
    }
    if (!canAccessBranch(auth.session, bId)) {
      return {
        authorized: false,
        response: NextResponse.json(
          { success: false, message: "Forbidden: Unauthorized branch access" },
          { status: 403 }
        ),
      };
    }
    if (storeId) {
      const br = await prisma.branch.findUnique({ where: { id: bId }, select: { storeId: true } });
      if (!br || (br.storeId && br.storeId !== storeId)) {
        return {
          authorized: false,
          response: NextResponse.json(
            { success: false, message: "Forbidden: Branch belongs to another store" },
            { status: 403 }
          ),
        };
      }
    }
    targetBranchId = bId;
  }

  return {
    authorized: true,
    session: auth.session,
    storeId,
    branchId: targetBranchId,
  };
}

export function getBatchPurchaseCost(batch: { purchasePrice?: any; mrp?: any } | null | undefined, fallbackMrp: any): number {
  if (batch && batch.purchasePrice !== null && batch.purchasePrice !== undefined) {
    return Number(batch.purchasePrice);
  }
  return Number(fallbackMrp || 0) * 0.7;
}

export async function queryScheduleDrugs(options: {
  storeId?: number | null;
  branchId?: number | null;
  scheduleType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  search?: string | null;
  page?: number;
  limit?: number;
}) {
  const {
    storeId,
    branchId,
    scheduleType,
    startDate,
    endDate,
    search = "",
    page = 1,
    limit = 50,
  } = options;

  const saleFilter: any = {};
  if (branchId) {
    saleFilter.branchId = branchId;
  } else if (storeId) {
    saleFilter.branch = { storeId };
  }

  if (startDate || endDate) {
    const dateCondition: any = {};
    if (startDate) {
      dateCondition.gte = new Date(`${startDate}T00:00:00.000Z`);
    }
    if (endDate) {
      dateCondition.lte = new Date(`${endDate}T23:59:59.999Z`);
    }
    saleFilter.saleDate = dateCondition;
  }

  const whereClause: any = {
    medicine: {
      scheduleType:
        scheduleType && scheduleType !== "all"
          ? scheduleType
          : { in: ["schedule_h", "schedule_h1", "schedule_x"] },
    },
    ...(Object.keys(saleFilter).length > 0 ? { sale: saleFilter } : {}),
  };

  const trimmedSearch = (search || "").trim();
  if (trimmedSearch) {
    whereClause.OR = [
      { medicine: { name: { contains: trimmedSearch, mode: "insensitive" } } },
      { medicine: { genericName: { contains: trimmedSearch, mode: "insensitive" } } },
      { batch: { batchNo: { contains: trimmedSearch, mode: "insensitive" } } },
      { sale: { invoiceNo: { contains: trimmedSearch, mode: "insensitive" } } },
      { sale: { doctorName: { contains: trimmedSearch, mode: "insensitive" } } },
      { sale: { doctorRegNo: { contains: trimmedSearch, mode: "insensitive" } } },
      { sale: { customer: { name: { contains: trimmedSearch, mode: "insensitive" } } } },
      { sale: { customer: { phone: { contains: trimmedSearch, mode: "insensitive" } } } },
    ];
  }

  const allItems = await prisma.saleItem.findMany({
    where: whereClause,
    include: {
      medicine: {
        select: {
          id: true,
          name: true,
          genericName: true,
          company: true,
          scheduleType: true,
          hsnCode: true,
        },
      },
      batch: {
        select: {
          id: true,
          batchNo: true,
          expiryDate: true,
          mrp: true,
        },
      },
      sale: {
        select: {
          id: true,
          invoiceNo: true,
          saleDate: true,
          doctorName: true,
          doctorRegNo: true,
          paymentMethod: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              address: true,
            },
          },
          creator: { select: { id: true, name: true, role: true } },
          branch: { select: { id: true, code: true, name: true, phone: true } },
        },
      },
      returnItems: {
        select: {
          quantity: true,
          returnReturn: { select: { status: true } },
        },
      },
    },
    orderBy: { sale: { saleDate: "desc" } },
  });

  let totalQuantity = 0;
  let totalValue = 0;
  let countScheduleH = 0;
  let countScheduleH1 = 0;
  let countScheduleX = 0;
  const doctorSet = new Set<string>();
  const allRecords: any[] = [];

  for (const line of allItems) {
    const returnedQty = line.returnItems
      .filter((ri) => ri.returnReturn.status === "processed")
      .reduce((sum, ri) => sum + ri.quantity, 0);
    const netQty = Math.max(0, line.quantity - returnedQty);
    if (netQty <= 0) continue;

    const netValue =
      line.quantity > 0
        ? Math.round(((Number(line.price) * netQty) / line.quantity) * 100) / 100
        : 0;

    totalQuantity += netQty;
    totalValue += netValue;
    const st = line.medicine.scheduleType;
    if (st === "schedule_h") countScheduleH += netQty;
    else if (st === "schedule_h1") countScheduleH1 += netQty;
    else if (st === "schedule_x") countScheduleX += netQty;

    if (line.sale.doctorName) doctorSet.add(line.sale.doctorName.toLowerCase().trim());

    allRecords.push({
      id: line.id,
      date: line.sale.saleDate.toISOString(),
      invoiceNo: line.sale.invoiceNo,
      patient: {
        name: line.sale.customer?.name || "Walk-in Patient",
        phone: line.sale.customer?.phone || "-",
        address: line.sale.customer?.address || "Local / Counter Dispensed",
      },
      doctor: {
        name: line.sale.doctorName || "Prescription On File",
        regNo: line.sale.doctorRegNo || "Verified",
      },
      medicine: {
        name: line.medicine.name,
        genericName: line.medicine.genericName || "-",
        company: line.medicine.company,
        scheduleType: line.medicine.scheduleType,
        hsnCode: line.medicine.hsnCode || "-",
      },
      batch: {
        batchNumber: line.batch.batchNo,
        expiryDate: line.batch.expiryDate.toISOString(),
      },
      quantity: netQty,
      returnedQty,
      mrp: Number(line.mrp),
      totalValue: netValue,
      dispensedBy: line.sale.creator?.name || "Pharmacist",
      branch: {
        code: line.sale.branch?.code || "MAIN",
        name: line.sale.branch?.name || "Main Counter",
      },
    });
  }

  const totalCount = allRecords.length;
  const skip = (page - 1) * limit;
  const paginatedRecords = allRecords.slice(skip, skip + limit);

  return {
    records: paginatedRecords,
    allRecords,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    },
    summary: {
      totalRecords: totalCount,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      countScheduleH,
      countScheduleH1,
      countScheduleX,
      uniqueDoctorsCount: doctorSet.size,
    },
  };
}

export async function queryGstReport(options: {
  storeId?: number | null;
  branchId?: number | null;
  month?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const { storeId, branchId, month, startDate, endDate } = options;

  let dateFilter: any = {};
  if (month) {
    const [y, m] = month.split("-").map((v) => parseInt(v, 10));
    const s = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
    const e = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    dateFilter = { gte: s, lte: e };
  } else if (startDate || endDate) {
    dateFilter = {};
    if (startDate) dateFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) dateFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
  }

  const branchScope = branchId
    ? { branchId }
    : storeId
    ? { branch: { storeId } }
    : {};

  const hasDate = Boolean(dateFilter.gte || dateFilter.lte);

  const [saleItems, purchaseOrders] = await Promise.all([
    prisma.saleItem.findMany({
      where: {
        sale: {
          ...branchScope,
          ...(hasDate ? { saleDate: dateFilter } : {}),
        },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            hsnCode: true,
            gstPercent: true,
          },
        },
        returnItems: {
          select: {
            quantity: true,
            returnReturn: { select: { status: true } },
          },
        },
      },
    }),

    // Only POs with physically received stock (never unreceived 'confirmed' quotes)
    prisma.purchaseOrder.findMany({
      where: {
        ...branchScope,
        status: { in: ["received", "partially_received", "completed", "shipped"] },
        ...(hasDate ? { poDate: dateFilter } : {}),
      },
      include: {
        items: {
          include: {
            medicine: { select: { name: true, hsnCode: true, gstPercent: true } },
          },
        },
      },
    }),
  ]);

  const hsnMap: Record<
    string,
    {
      hsnCode: string;
      description: string;
      uqc: string;
      totalQty: number;
      totalValue: number;
      taxableValue: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      totalTax: number;
    }
  > = {};

  const rateSlabMap: Record<
    number,
    {
      rate: number;
      taxableValue: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      totalTax: number;
      totalValue: number;
    }
  > = {
    0: { rate: 0, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
    5: { rate: 5, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
    12: { rate: 12, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
    18: { rate: 18, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
    28: { rate: 28, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
  };

  let totalOutwardTurnover = 0;
  let totalOutwardTaxable = 0;
  let totalOutwardCgst = 0;
  let totalOutwardSgst = 0;
  let totalOutwardIgst = 0;
  let totalOutwardGst = 0;
  let totalNetItemsSold = 0;

  for (const item of saleItems) {
    const returnedQty = item.returnItems
      .filter((ri) => ri.returnReturn.status === "processed")
      .reduce((sum, ri) => sum + ri.quantity, 0);
    const netQty = Math.max(0, item.quantity - returnedQty);
    if (netQty <= 0) continue;

    totalNetItemsSold++;
    const netRatio = item.quantity > 0 ? netQty / item.quantity : 0;

    const hsn = item.medicine.hsnCode || "30049099";
    const gstRate = Number(item.gstPercent || item.medicine.gstPercent || 12);
    const taxable = Math.round(Number(item.taxableBase) * netRatio * 100) / 100;
    const tax = Math.round(Number(item.gstAmount) * netRatio * 100) / 100;
    // Use post-discount taxable + tax so totalValue reconciles cleanly with net invoice value
    const lineVal = Math.round((taxable + tax) * 100) / 100;
    const halfTax = Math.round((tax / 2) * 100) / 100;
    const remainderTax = Math.max(0, Math.round((tax - halfTax) * 100) / 100);

    if (!hsnMap[hsn]) {
      hsnMap[hsn] = {
        hsnCode: hsn,
        description: item.medicine.genericName || item.medicine.name,
        uqc: "NOS",
        totalQty: 0,
        totalValue: 0,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
      };
    }

    hsnMap[hsn].totalQty += netQty;
    hsnMap[hsn].totalValue = Math.round((hsnMap[hsn].totalValue + lineVal) * 100) / 100;
    hsnMap[hsn].taxableValue = Math.round((hsnMap[hsn].taxableValue + taxable) * 100) / 100;
    hsnMap[hsn].cgstAmount = Math.round((hsnMap[hsn].cgstAmount + halfTax) * 100) / 100;
    hsnMap[hsn].sgstAmount = Math.round((hsnMap[hsn].sgstAmount + remainderTax) * 100) / 100;
    hsnMap[hsn].totalTax = Math.round((hsnMap[hsn].totalTax + tax) * 100) / 100;

    const slabKey = Math.round(gstRate);
    if (!rateSlabMap[slabKey]) {
      rateSlabMap[slabKey] = {
        rate: slabKey,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
        totalValue: 0,
      };
    }
    rateSlabMap[slabKey].taxableValue = Math.round((rateSlabMap[slabKey].taxableValue + taxable) * 100) / 100;
    rateSlabMap[slabKey].cgstAmount = Math.round((rateSlabMap[slabKey].cgstAmount + halfTax) * 100) / 100;
    rateSlabMap[slabKey].sgstAmount = Math.round((rateSlabMap[slabKey].sgstAmount + remainderTax) * 100) / 100;
    rateSlabMap[slabKey].totalTax = Math.round((rateSlabMap[slabKey].totalTax + tax) * 100) / 100;
    rateSlabMap[slabKey].totalValue = Math.round((rateSlabMap[slabKey].totalValue + lineVal) * 100) / 100;

    totalOutwardTurnover += lineVal;
    totalOutwardTaxable += taxable;
    totalOutwardCgst += halfTax;
    totalOutwardSgst += remainderTax;
    totalOutwardGst += tax;
  }

  let totalInwardTaxable = 0;
  let totalInwardCgst = 0;
  let totalInwardSgst = 0;
  let totalInwardGst = 0;
  let totalInwardGross = 0;
  let verifiedPOCount = 0;

  for (const po of purchaseOrders) {
    let poHasReceivedItems = false;
    for (const item of po.items) {
      // Partial receipts ('shipped' / 'partially_received') use actual receivedQty; fully 'received'/'completed' fallback to quantity if legacy row had receivedQty=0
      const effectiveQty =
        item.receivedQty > 0
          ? item.receivedQty
          : po.status === "received" || po.status === "completed"
          ? item.quantity
          : 0;
      if (effectiveQty <= 0) continue;

      poHasReceivedItems = true;
      const itemTotal = Number(item.price) * effectiveQty;
      const rate = Number(item.medicine.gstPercent || 12);
      const divisor = 1 + rate / 100;
      const taxable = Math.round((itemTotal / divisor) * 100) / 100;
      const gst = Math.round((itemTotal - taxable) * 100) / 100;
      const halfGst = Math.round((gst / 2) * 100) / 100;

      totalInwardGross += itemTotal;
      totalInwardTaxable += taxable;
      totalInwardCgst += halfGst;
      totalInwardSgst += Math.round((gst - halfGst) * 100) / 100;
      totalInwardGst += gst;
    }
    if (poHasReceivedItems) verifiedPOCount++;
  }

  const netCgstPayable = Math.round((totalOutwardCgst - totalInwardCgst) * 100) / 100;
  const netSgstPayable = Math.round((totalOutwardSgst - totalInwardSgst) * 100) / 100;
  const netTotalGstPayable = Math.round((netCgstPayable + netSgstPayable) * 100) / 100;

  return {
    period: {
      month: month || null,
      startDate: startDate || null,
      endDate: endDate || null,
      branchId: branchId ?? null,
    },
    gstr1: {
      summary: {
        totalTurnover: Math.round(totalOutwardTurnover * 100) / 100,
        totalTaxableValue: Math.round(totalOutwardTaxable * 100) / 100,
        totalCgst: Math.round(totalOutwardCgst * 100) / 100,
        totalSgst: Math.round(totalOutwardSgst * 100) / 100,
        totalIgst: Math.round(totalOutwardIgst * 100) / 100,
        totalGst: Math.round(totalOutwardGst * 100) / 100,
        totalItemsSold: totalNetItemsSold,
      },
      hsnBreakdown: Object.values(hsnMap).sort((a, b) => b.totalValue - a.totalValue),
      rateSlabs: Object.values(rateSlabMap).filter((s) => s.totalValue > 0 || s.rate === 12),
    },
    gstr3b: {
      outwardTaxableSupplies: {
        taxableValue: Math.round(totalOutwardTaxable * 100) / 100,
        cgst: Math.round(totalOutwardCgst * 100) / 100,
        sgst: Math.round(totalOutwardSgst * 100) / 100,
        igst: Math.round(totalOutwardIgst * 100) / 100,
        totalLiability: Math.round(totalOutwardGst * 100) / 100,
      },
      eligibleITC: {
        inwardGross: Math.round(totalInwardGross * 100) / 100,
        taxableValue: Math.round(totalInwardTaxable * 100) / 100,
        cgst: Math.round(totalInwardCgst * 100) / 100,
        sgst: Math.round(totalInwardSgst * 100) / 100,
        igst: 0,
        totalCredit: Math.round(totalInwardGst * 100) / 100,
        verifiedPOCount,
      },
      netTaxPayable: {
        netCgst: netCgstPayable,
        netSgst: netSgstPayable,
        netIgst: 0,
        totalPayable: netTotalGstPayable,
        status: netTotalGstPayable > 0 ? "tax_payable" : "itc_carry_forward",
      },
    },
  };
}

export async function queryDeadStock(options: {
  storeId?: number | null;
  branchId?: number | null;
  thresholdDays?: number;
  search?: string | null;
  page?: number;
  limit?: number;
}) {
  const {
    storeId,
    branchId,
    thresholdDays = 90,
    search = "",
    page = 1,
    limit = 50,
  } = options;

  const branchScope = branchId
    ? { branchId }
    : storeId
    ? { branch: { storeId } }
    : {};

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

  const batches = await prisma.batch.findMany({
    where: {
      ...branchScope,
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
          returnItems: {
            select: {
              quantity: true,
              returnReturn: { select: { status: true } },
            },
          },
        },
        orderBy: { sale: { saleDate: "desc" } },
        take: 25,
      },
    },
    orderBy: { expiryDate: "asc" },
  });

  const nowTime = Date.now();
  const deadBatches: any[] = [];
  let totalBlockedCapital = 0;
  let highExpiryRiskCount = 0;
  const normalizedSearch = (search || "").trim().toLowerCase();

  for (const batch of batches) {
    // Ignore sales that were completely returned & processed
    const latestValidSale = batch.saleItems.find((si) => {
      const returnedQty = si.returnItems
        .filter((ri) => ri.returnReturn.status === "processed")
        .reduce((sum, ri) => sum + ri.quantity, 0);
      return si.quantity - returnedQty > 0;
    });

    const lastSaleDate = latestValidSale ? new Date(latestValidSale.sale.saleDate) : null;
    const isStagnant = !lastSaleDate || lastSaleDate < cutoffDate;
    if (!isStagnant) continue;

    if (normalizedSearch) {
      const matches =
        batch.medicine.name.toLowerCase().includes(normalizedSearch) ||
        batch.medicine.company.toLowerCase().includes(normalizedSearch) ||
        batch.batchNo.toLowerCase().includes(normalizedSearch) ||
        (batch.medicine.genericName && batch.medicine.genericName.toLowerCase().includes(normalizedSearch)) ||
        (batch.medicine.rackLocation && batch.medicine.rackLocation.toLowerCase().includes(normalizedSearch));
      if (!matches) continue;
    }

    const daysSinceLastSale = lastSaleDate
      ? Math.floor((nowTime - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24))
      : Math.floor((nowTime - new Date(batch.createdAt).getTime()) / (1000 * 60 * 60 * 24));

    const daysToExpiry = Math.floor((new Date(batch.expiryDate).getTime() - nowTime) / (1000 * 60 * 60 * 24));
    const purchasePrice = getBatchPurchaseCost(batch, batch.mrp);
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

  deadBatches.sort((a, b) => b.blockedCapital - a.blockedCapital);

  const totalCount = deadBatches.length;
  const skip = (page - 1) * limit;
  const paginatedRecords = deadBatches.slice(skip, skip + limit);

  return {
    thresholdDays,
    allRecords: deadBatches,
    records: paginatedRecords,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    },
    summary: {
      totalDeadBatches: totalCount,
      totalBlockedCapital: Math.round(totalBlockedCapital * 100) / 100,
      highExpiryRiskCount,
      thresholdDays,
    },
  };
}
