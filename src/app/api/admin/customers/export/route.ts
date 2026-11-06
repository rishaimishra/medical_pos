import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

/**
 * MODULE 1.13.1: CUSTOMER DIRECTORY EXCEL CSV EXPORT
 * 
 * Exports customer records with UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    let customers: any[] = [];
    try {
      customers = await prisma.customer.findMany({
        orderBy: { id: "asc" },
        include: {
          sales: {
            select: { grandTotal: true, paymentMethod: true },
          },
          payments: {
            select: { amount: true },
          },
        },
      });
    } catch (err: any) {
      if (err?.code === "P1017" || err?.message?.includes("closed the connection")) {
        await prisma.$connect().catch(() => {});
        customers = await prisma.customer.findMany({
          orderBy: { id: "asc" },
          include: {
            sales: {
              select: { grandTotal: true, paymentMethod: true },
            },
            payments: {
              select: { amount: true },
            },
          },
        });
      } else {
        throw err;
      }
    }

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Customer ID",
      "Full Name",
      "Mobile Phone",
      "Email Address",
      "Gender",
      "Date of Birth",
      "Address",
      "Chronic Patient?",
      "Chronic Conditions",
      "Refill Cycle (Days)",
      "Next Refill Date",
      "Credit Limit (INR)",
      "Total Purchased (INR)",
      "Outstanding Balance (INR)",
      "Status",
      "Created Date",
    ];

    const rows: string[] = [headers.join(",")];

    for (const c of customers) {
      const totalPurchased = c.sales.reduce((sum: number, s: any) => sum + Number(s.grandTotal), 0);
      const totalCreditSales = c.sales
        .filter((s: any) => s.paymentMethod === "credit")
        .reduce((sum: number, s: any) => sum + Number(s.grandTotal), 0);
      const totalPaid = c.payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const outstandingDue = Math.max(0, Math.round((totalCreditSales - totalPaid) * 100) / 100);

      const row = [
        c.id,
        escapeCsv(c.name),
        escapeCsv(c.phone),
        escapeCsv(c.email || ""),
        escapeCsv(c.gender || "Not Specified"),
        escapeCsv(c.dob ? new Date(c.dob).toISOString().slice(0, 10) : ""),
        escapeCsv(c.address || ""),
        escapeCsv(c.isChronic ? "YES" : "NO"),
        escapeCsv(c.chronicDiseases || ""),
        c.refillDays || "",
        escapeCsv(c.nextRefillDate ? new Date(c.nextRefillDate).toISOString().slice(0, 10) : ""),
        Number(c.creditLimit).toFixed(2),
        totalPurchased.toFixed(2),
        outstandingDue.toFixed(2),
        escapeCsv(c.active ? "Active" : "Inactive"),
        escapeCsv(new Date(c.createdAt).toISOString().slice(0, 10)),
      ];
      rows.push(row.join(","));
    }

    const csvContent = "\uFEFF" + rows.join("\r\n");
    const filename = `customers-directory-${new Date().toISOString().slice(0, 10)}.csv`;

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "CUSTOMERS_EXPORTED_CSV",
      entity: "customer",
      details: { rowCount: customers.length, filename },
      ipAddress: getClientIp(req),
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/customers/export error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to export customers" }, { status: 500 });
  }
}
