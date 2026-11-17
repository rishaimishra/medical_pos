import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { buildCsvContent } from "@/lib/csv";

/**
 * GET /api/admin/sales/export
 * Exports filtered sales records to CSV with UTF-8 BOM.
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
      { success: false, message: "Forbidden: Access to sales export denied" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const paymentMethod = (searchParams.get("paymentMethod") || "all").toLowerCase();
  const branchParam = searchParams.get("branchId");
  const cashierParam = searchParams.get("cashierId");
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");

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

    if (effectiveBranchId) {
      where.branchId = effectiveBranchId;
    } else if (auth.session.storeId) {
      where.branch = { storeId: auth.session.storeId };
    }

    if (paymentMethod && paymentMethod !== "all") {
      where.paymentMethod = paymentMethod;
    }

    if (cashierParam && cashierParam !== "all") {
      const cashierId = parseInt(cashierParam, 10);
      if (!isNaN(cashierId)) {
        where.createdBy = cashierId;
      }
    }

    if (startDateStr || endDateStr) {
      where.saleDate = {};
      if (startDateStr) where.saleDate.gte = new Date(`${startDateStr}T00:00:00.000Z`);
      if (endDateStr) {
        where.saleDate.lte = new Date(`${endDateStr}T23:59:59.999Z`);
      }
    }

    if (search) {
      where.OR = [
        { invoiceNo: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
        { doctorName: { contains: search, mode: "insensitive" } },
      ];
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        branch: true,
        creator: true,
        items: true,
      },
    });

    const headers = [
      "Invoice No",
      "Date",
      "Time",
      "Branch",
      "Customer Name",
      "Customer Phone",
      "Items Count",
      "Payment Mode",
      "Gross Total (INR)",
      "Discount (INR)",
      "GST (INR)",
      "Net Amount (INR)",
      "Doctor Name",
      "Cashier",
    ];

    const rows = sales.map((s) => {
      const d = new Date(s.createdAt);
      const dateStr = d.toLocaleDateString("en-IN");
      const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
      const itemsCount = s.items.reduce((sum, it) => sum + it.quantity, 0);

      return [
        s.invoiceNo,
        dateStr,
        timeStr,
        s.branch?.code || "MAIN",
        s.customer?.name || "Walk-in Customer",
        s.customer?.phone || "-",
        itemsCount,
        s.paymentMethod.toUpperCase(),
        Number(s.totalAmount).toFixed(2),
        Number(s.discountAmount).toFixed(2),
        Number(s.gstAmount).toFixed(2),
        Number(s.grandTotal).toFixed(2),
        s.doctorName || "-",
        s.creator?.name || s.creator?.username || "-",
      ];
    });

    const csvContent = buildCsvContent(headers, rows);
    const filename = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/sales/export error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to export sales CSV" },
      { status: 500 }
    );
  }
}
