import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { batches: true, purchaseOrders: true },
        },
        purchaseOrders: {
          select: { total: true, status: true },
        },
        payments: {
          select: { amount: true },
        },
      },
    });

    const headers = [
      "ID",
      "Vendor Name",
      "Contact Person",
      "Phone",
      "Email",
      "Address",
      "GSTIN",
      "Drug License No",
      "Payment Terms (Days)",
      "Batches Count",
      "Total POs",
      "Total Purchased (INR)",
      "Total Paid (INR)",
      "Outstanding Balance (INR)",
      "Created Date",
    ];

    const rows = suppliers.map((sup) => {
      const totalPurchased = sup.purchaseOrders
        .filter((po) => po.status !== "cancelled" && po.status !== "draft")
        .reduce((sum, po) => sum + Number(po.total || 0), 0);
      const totalPaid = sup.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const balance = Math.max(0, totalPurchased - totalPaid);

      const escape = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      return [
        sup.id,
        escape(sup.name),
        escape(sup.contact || ""),
        escape(sup.phone),
        escape(sup.email || ""),
        escape(sup.address || ""),
        escape(sup.gstNo || ""),
        escape(sup.dlNo || ""),
        sup.paymentTerms,
        sup._count.batches,
        sup._count.purchaseOrders,
        totalPurchased.toFixed(2),
        totalPaid.toFixed(2),
        balance.toFixed(2),
        escape(sup.createdAt.toISOString().slice(0, 10)),
      ].join(",");
    });

    // UTF-8 BOM \uFEFF for Excel compatibility
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");

    const dateStr = new Date().toISOString().slice(0, 10);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="suppliers-directory-${dateStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/suppliers/export error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to export suppliers" }, { status: 500 });
  }
}

