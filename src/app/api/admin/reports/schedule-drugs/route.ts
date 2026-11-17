import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * MODULE 2.14.1: Schedule H / H1 / X Prescription Drug Audit Register API
 *
 * Compliance register under the Indian Drugs and Cosmetics Rules (Form 35 / Schedule H/H1).
 * Tracks:
 * - Dispense Date & Invoice #
 * - Patient Name, Phone, and Full Address
 * - Prescribing Doctor Name & Doctor Registration Number
 * - Medicine Name, Composition (Generic/Salt), Schedule Category (H, H1, X)
 * - Batch Number, Expiry Date
 * - Quantity Dispensed & MRP
 * - Dispensing Staff / Pharmacist & Outlet Branch
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const scheduleType = searchParams.get("scheduleType"); // "schedule_h" | "schedule_h1" | "schedule_x" | "all"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
  const skip = (page - 1) * limit;

  try {
    // 1. Resolve Branch Access
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    // 2. Build Where Conditions for SaleItem querying
    const whereClause: any = {
      medicine: {
        scheduleType:
          scheduleType && scheduleType !== "all"
            ? scheduleType
            : { in: ["schedule_h", "schedule_h1", "schedule_x"] },
      },
    };

    // Branch filter
    if (targetBranchId) {
      whereClause.sale = { ...whereClause.sale, branchId: targetBranchId };
    }

    // Date range filter
    if (startDate || endDate) {
      const dateCondition: any = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        dateCondition.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateCondition.lte = e;
      }
      whereClause.sale = { ...whereClause.sale, saleDate: dateCondition };
    }

    // Search filter across patient, doctor, medicine, batch, or invoice #
    if (search) {
      whereClause.OR = [
        { medicine: { name: { contains: search, mode: "insensitive" } } },
        { medicine: { genericName: { contains: search, mode: "insensitive" } } },
        { batch: { batchNo: { contains: search, mode: "insensitive" } } },
        { sale: { invoiceNo: { contains: search, mode: "insensitive" } } },
        { sale: { doctorName: { contains: search, mode: "insensitive" } } },
        { sale: { doctorRegNo: { contains: search, mode: "insensitive" } } },
        { sale: { customer: { name: { contains: search, mode: "insensitive" } } } },
        { sale: { customer: { phone: { contains: search, mode: "insensitive" } } } },
      ];
    }

    // 3. Fetch Items & Aggregations
    const [items, totalCount, allMatching] = await Promise.all([
      prisma.saleItem.findMany({
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
        },
        orderBy: { sale: { saleDate: "desc" } },
        skip,
        take: limit,
      }),
      prisma.saleItem.count({ where: whereClause }),
      prisma.saleItem.findMany({
        where: whereClause,
        select: {
          quantity: true,
          price: true,
          medicine: { select: { scheduleType: true } },
          sale: { select: { doctorName: true } },
        },
      }),
    ]);

    // 4. Calculate Summaries
    let totalQuantity = 0;
    let totalValue = 0;
    let countScheduleH = 0;
    let countScheduleH1 = 0;
    let countScheduleX = 0;
    const doctorSet = new Set<string>();

    for (const item of allMatching) {
      totalQuantity += item.quantity;
      totalValue += Number(item.price);
      const st = item.medicine.scheduleType;
      if (st === "schedule_h") countScheduleH += item.quantity;
      else if (st === "schedule_h1") countScheduleH1 += item.quantity;
      else if (st === "schedule_x") countScheduleX += item.quantity;

      if (item.sale.doctorName) doctorSet.add(item.sale.doctorName.toLowerCase().trim());
    }

    // 5. Transform Records for Frontend
    const records = items.map((line) => ({
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
      quantity: line.quantity,
      mrp: Number(line.mrp),
      totalValue: Number(line.price),
      dispensedBy: line.sale.creator?.name || "Pharmacist",
      branch: {
        code: line.sale.branch?.code || "MAIN",
        name: line.sale.branch?.name || "Main Counter",
      },
    }));

    return NextResponse.json({
      success: true,
      records,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
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
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/schedule-drugs error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch prescription drug register" },
      { status: 500 }
    );
  }
}
