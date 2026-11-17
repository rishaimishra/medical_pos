import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";

/**
 * GET /api/admin/returns/[id]
 * Fetches a single return record with full items and original invoice for Credit Note printing.
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

  if (!canAccessPage(auth.session, "/admin/returns")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to sales returns denied" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const returnId = parseInt(id, 10);
  const isNumeric = !isNaN(returnId);

  try {
    const returnRecord = await prisma.return.findFirst({
      where: isNumeric ? { id: returnId } : { returnNumber: { equals: id, mode: "insensitive" } },
      include: {
        sale: {
          include: {
            customer: true,
            branch: true,
          },
        },
        customer: true,
        branch: true,
        items: {
          include: {
            medicine: true,
            batch: true,
            saleItem: true,
          },
        },
      },
    });

    if (!returnRecord) {
      return NextResponse.json({ success: false, message: "Return record not found" }, { status: 404 });
    }

    if (returnRecord.branchId && !canAccessBranch(auth.session, returnRecord.branchId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Cannot access return from another branch" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      return: {
        ...returnRecord,
        refundAmount: Number(returnRecord.refundAmount),
        items: returnRecord.items.map((it) => ({
          ...it,
          price: Number(it.price),
        })),
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/returns/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch return details" },
      { status: 500 }
    );
  }
}
