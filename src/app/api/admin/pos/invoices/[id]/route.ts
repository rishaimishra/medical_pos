import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";

/**
 * MODULE 2.7 & 2.8: INVOICE DETAILS & PRINT SPEC API
 * 
 * GET /api/admin/pos/invoices/[id]
 * Supports lookup by numeric ID (e.g., 101) or by Invoice Number (e.g., INV-2026-00001).
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

  if (!canAccessPage(auth.session, "/admin/pos")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to POS invoices denied" },
      { status: 403 }
    );
  }

  const { id } = await params;
  if (!id || id.trim() === "") {
    return NextResponse.json(
      { success: false, message: "Invoice ID or number is required" },
      { status: 400 }
    );
  }

  try {
    const isNumericId = /^\d+$/.test(id);
    const sale = await prisma.sale.findFirst({
      where: isNumericId
        ? { id: parseInt(id, 10) }
        : { invoiceNo: { equals: id, mode: "insensitive" } },
      include: {
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                genericName: true,
                company: true,
                hsnCode: true,
                category: true,
              },
            },
            batch: {
              select: {
                id: true,
                batchNo: true,
                expiryDate: true,
                mrp: true,
                purchasePrice: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            phone: true,
            gstNo: true,
            dlNo: true,
            storeId: true,
          },
        },
        creator: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        discount: {
          select: {
            id: true,
            name: true,
            type: true,
            value: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { success: false, message: `Invoice '${id}' not found` },
        { status: 404 }
      );
    }

    // Branch Isolation Check
    if (sale.branchId && !canAccessBranch(auth.session, sale.branchId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Cannot access invoice from another branch" },
        { status: 403 }
      );
    }

    // Parse split payments if recorded
    let parsedSplits = null;
    if (sale.splitDetails) {
      try {
        parsedSplits = JSON.parse(sale.splitDetails);
      } catch {
        parsedSplits = null;
      }
    }

    // Fetch fallback store settings if branch doesn't have all details
    const storeSettings = sale.branch?.storeId
      ? await prisma.settings.findUnique({ where: { id: sale.branch.storeId } }).catch(() => null)
      : await prisma.settings.findFirst({ orderBy: { id: "asc" } }).catch(() => null);

    return NextResponse.json({
      success: true,
      sale: {
        ...sale,
        splitPayments: parsedSplits,
        store: {
          name: sale.branch?.name || storeSettings?.storeName || "DRxStore Pharmacy",
          address: sale.branch?.address || storeSettings?.storeAddress || "",
          phone: sale.branch?.phone || storeSettings?.storePhone || "",
          gstNo: sale.branch?.gstNo || storeSettings?.storeGst || "",
          dlNo: sale.branch?.dlNo || storeSettings?.storeDl || "",
          email: storeSettings?.storeEmail || "",
          currency: storeSettings?.currency || "₹",
        },
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/pos/invoices/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to fetch invoice" },
      { status: 500 }
    );
  }
}
