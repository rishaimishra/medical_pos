import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";

/**
 * GET /api/admin/sales/[id]
 * Fetches a single sale by ID with its items, returns, customer, and branch.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const saleId = parseInt(id, 10);
  if (isNaN(saleId)) {
    return NextResponse.json({ success: false, message: "Invalid sale ID" }, { status: 400 });
  }

  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        branch: true,
        creator: { select: { id: true, name: true, username: true } },
        discount: true,
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        returns: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json({ success: false, message: "Sale not found" }, { status: 404 });
    }

    if (sale.branchId && !canAccessBranch(auth.session, sale.branchId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Cannot access sale from another branch" },
        { status: 403 }
      );
    }

    let parsedSplits = null;
    if (sale.splitDetails) {
      try {
        parsedSplits = JSON.parse(sale.splitDetails);
      } catch {
        parsedSplits = null;
      }
    }

    return NextResponse.json({
      success: true,
      sale: {
        ...sale,
        totalAmount: Number(sale.totalAmount),
        discountAmount: Number(sale.discountAmount),
        gstAmount: Number(sale.gstAmount),
        grandTotal: Number(sale.grandTotal),
        splitPayments: parsedSplits,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/sales/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch sale details" },
      { status: 500 }
    );
  }
}
