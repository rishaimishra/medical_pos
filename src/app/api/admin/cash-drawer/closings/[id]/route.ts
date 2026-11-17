import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

/**
 * GET /api/admin/cash-drawer/closings/[id]
 * Fetches a single Z-Report shift closure by ID.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const closingId = parseInt(id, 10);
  if (isNaN(closingId)) {
    return NextResponse.json({ success: false, message: "Invalid closing ID" }, { status: 400 });
  }

  try {
    const closing = await prisma.cashDrawerClosing.findUnique({
      where: { id: closingId },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
            address: true,
            phone: true,
            gstNo: true,
            dlNo: true,
          },
        },
        user: { select: { id: true, name: true, role: true, username: true } },
        store: { select: { storeName: true, storeAddress: true, storePhone: true, storeGst: true, storeDl: true } },
      },
    });

    if (!closing) {
      return NextResponse.json({ success: false, message: "Z-Report closing not found" }, { status: 404 });
    }

    if (closing.branchId && !canAccessBranch(auth.session, closing.branchId)) {
      return NextResponse.json({ success: false, message: "Forbidden: No branch access" }, { status: 403 });
    }

    let parsedDenominations: any = {};
    try {
      parsedDenominations = JSON.parse(closing.denominations);
    } catch {
      parsedDenominations = {};
    }

    return NextResponse.json({
      success: true,
      closing: {
        ...closing,
        denominations: parsedDenominations,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/cash-drawer/closings/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch Z-Report" },
      { status: 500 }
    );
  }
}
