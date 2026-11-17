import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";

/**
 * MODULE 2.9: SALES HISTORY & SEARCH API
 *
 * GET /api/admin/sales
 * Filter past sales by Date Range, Branch, Invoice Number, Customer, Payment Mode, or Cashier.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json(
      { success: false, message: auth.message || "Unauthorized" },
      { status: auth.status }
    );
  }

  if (!canAccessPage(auth.session, "/admin/sales")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to sales history denied" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const paymentMethod = (searchParams.get("paymentMethod") || "all").toLowerCase();
  const branchParam = searchParams.get("branchId");
  const cashierParam = searchParams.get("cashierId");
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");

  // Multi-branch Isolation
  const effectiveBranchId = auth.session.branchId
    ? auth.session.branchId
    : branchParam && branchParam !== "all"
    ? parseInt(branchParam, 10)
    : null;

  if (effectiveBranchId && !canAccessBranch(auth.session, effectiveBranchId)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Unauthorized branch access" },
      { status: 403 }
    );
  }

  try {
    const where: any = {};

    // Branch filter
    if (effectiveBranchId) {
      where.branchId = effectiveBranchId;
    } else if (auth.session.storeId) {
      where.branch = { storeId: auth.session.storeId };
    }

    // Payment Method filter
    if (paymentMethod && paymentMethod !== "all") {
      where.paymentMethod = paymentMethod;
    }

    // Cashier filter
    if (cashierParam && cashierParam !== "all") {
      const cashierId = parseInt(cashierParam, 10);
      if (!isNaN(cashierId)) {
        where.createdBy = cashierId;
      }
    }

    // Date Range filter (inclusive on @db.Date)
    if (startDateStr || endDateStr) {
      where.saleDate = {};
      if (startDateStr) {
        where.saleDate.gte = new Date(`${startDateStr}T00:00:00.000Z`);
      }
      if (endDateStr) {
        where.saleDate.lte = new Date(`${endDateStr}T23:59:59.999Z`);
      }
    }

    // Search filter across Invoice No, Customer Name/Phone, Doctor Name
    if (search) {
      where.OR = [
        { invoiceNo: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
        { doctorName: { contains: search, mode: "insensitive" } },
      ];
    }

    // Parallel queries: Total Count, Summary Aggregation, Paginated Sales List, and Store Settings fallback
    const [totalCount, salesList, allMatchingSales, storeSettings] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true, address: true },
          },
          branch: {
            select: { id: true, name: true, code: true, phone: true, email: true, address: true, gstNo: true, dlNo: true },
          },
          creator: {
            select: { id: true, name: true, username: true },
          },
          items: {
            include: {
              medicine: {
                select: { id: true, name: true, genericName: true, company: true, hsnCode: true, gstPercent: true },
              },
              batch: {
                select: { id: true, batchNo: true, expiryDate: true },
              },
            },
          },
          returns: {
            select: { id: true, returnNumber: true, refundAmount: true, status: true },
          },
        },
      }),
      // Aggregate totals for KPI summary cards
      prisma.sale.findMany({
        where,
        select: {
          totalAmount: true,
          discountAmount: true,
          gstAmount: true,
          grandTotal: true,
        },
      }),
      auth.session.storeId
        ? prisma.settings.findUnique({ where: { id: auth.session.storeId } }).catch(() => null)
        : prisma.settings.findFirst({ orderBy: { id: "asc" } }).catch(() => null),
    ]);

    const summary = allMatchingSales.reduce(
      (acc, s) => {
        acc.totalGross += Number(s.totalAmount || 0);
        acc.totalDiscount += Number(s.discountAmount || 0);
        acc.totalGst += Number(s.gstAmount || 0);
        acc.netSales += Number(s.grandTotal || 0);
        return acc;
      },
      { totalGross: 0, totalDiscount: 0, totalGst: 0, netSales: 0 }
    );

    // Format sales for response (includes complete reprint metadata for ThermalReceipt & A4TaxInvoice)
    const formattedSales = salesList.map((sale) => {
      let splits: any = null;
      if (sale.splitDetails) {
        try {
          splits = JSON.parse(sale.splitDetails);
        } catch {
          splits = null;
        }
      }

      return {
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        saleDate: sale.saleDate,
        createdAt: sale.createdAt,
        totalAmount: Number(sale.totalAmount),
        discountAmount: Number(sale.discountAmount),
        gstAmount: Number(sale.gstAmount),
        grandTotal: Number(sale.grandTotal),
        creditAmount: Number(sale.creditAmount || 0),
        paymentMethod: sale.paymentMethod,
        splitDetails: splits,
        splitPayments: splits,
        cashTendered: splits?.cashTendered ?? undefined,
        changeDue: splits?.changeDue ?? undefined,
        upiRef: sale.upiRef,
        cardLast4: sale.cardLast4,
        chequeNo: sale.chequeNo,
        chequeBank: sale.chequeBank,
        doctorName: sale.doctorName,
        doctorRegNo: sale.doctorRegNo,
        customer: sale.customer,
        branch: sale.branch,
        store: {
          name: sale.branch?.name || storeSettings?.storeName || "DRxStore Pharmacy",
          address: sale.branch?.address || storeSettings?.storeAddress || "",
          phone: sale.branch?.phone || storeSettings?.storePhone || "",
          gstNo: sale.branch?.gstNo || storeSettings?.storeGst || "",
          dlNo: sale.branch?.dlNo || storeSettings?.storeDl || "",
          email: sale.branch?.email || storeSettings?.storeEmail || "",
          currency: storeSettings?.currency || "₹",
        },
        cashier: sale.creator,
        itemsCount: sale.items.reduce((sum, it) => sum + it.quantity, 0),
        items: sale.items.map((it) => ({
          id: it.id,
          name: it.medicine.name,
          medicineName: it.medicine.name,
          genericName: it.medicine.genericName,
          company: it.medicine.company,
          hsnCode: it.medicine.hsnCode,
          gstPercent: Number(it.gstPercent),
          taxableBase: Number(it.taxableBase),
          gstAmount: Number(it.gstAmount),
          batchNo: it.batch.batchNo,
          expiryDate: it.batch.expiryDate,
          quantity: it.quantity,
          mrp: Number(it.mrp),
          price: Number(it.price),
        })),
        returnsCount: sale.returns.length,
        hasReturns: sale.returns.length > 0,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedSales,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      summary: {
        totalInvoices: totalCount,
        totalGross: Number(summary.totalGross.toFixed(2)),
        totalDiscount: Number(summary.totalDiscount.toFixed(2)),
        totalGst: Number(summary.totalGst.toFixed(2)),
        netSales: Number(summary.netSales.toFixed(2)),
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/sales error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load sales history" },
      { status: 500 }
    );
  }
}
