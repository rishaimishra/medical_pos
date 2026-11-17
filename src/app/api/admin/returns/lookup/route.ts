import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";

/**
 * MODULE 2.10.1: INVOICE-LINKED RETURNS LOOKUP
 *
 * GET /api/admin/returns/lookup?invoiceNo=...
 * Looks up original sale by invoice number or barcode and computes returnable quantities
 * with discount-proportional refund valuation (Module 2.11.2 & 2.11.3).
 */
export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const invoiceNo = (searchParams.get("invoiceNo") || "").trim();

  if (!invoiceNo) {
    return NextResponse.json(
      { success: false, message: "Invoice number or barcode is required" },
      { status: 400 }
    );
  }

  try {
    const sale = await prisma.sale.findFirst({
      where: {
        invoiceNo: { equals: invoiceNo, mode: "insensitive" },
      },
      include: {
        customer: true,
        branch: true,
        creator: { select: { id: true, name: true, username: true } },
        items: {
          include: {
            medicine: {
              select: { id: true, name: true, genericName: true, company: true, hsnCode: true },
            },
            batch: {
              select: { id: true, batchNo: true, expiryDate: true, quantity: true, mrp: true },
            },
            returnItems: {
              select: {
                id: true,
                quantity: true,
                restockAction: true,
                returnReturn: {
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json(
        { success: false, message: `No invoice found matching '${invoiceNo}'` },
        { status: 404 }
      );
    }

    // Branch isolation check
    if (sale.branchId && !canAccessBranch(auth.session, sale.branchId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Cannot process returns for another branch" },
        { status: 403 }
      );
    }

    // Module 2.11.3: Discount-Proportional Refund Ratio
    // If a discount was applied to the bill, refund per item must be discounted proportionally.
    const saleTotal = Number(sale.totalAmount);
    const saleDiscount = Number(sale.discountAmount);
    const discountRatio = saleTotal > 0 ? saleDiscount / saleTotal : 0;

    // Process each line item and enforce Module 2.11.2 (Already-Returned Guard)
    const returnableItems = sale.items.map((it) => {
      // Sum all returned quantities for this sale item that were not rejected
      const alreadyReturned = it.returnItems
        .filter((ri) => ri.returnReturn.status !== "rejected")
        .reduce((sum, ri) => sum + ri.quantity, 0);

      const remainingReturnable = Math.max(0, it.quantity - alreadyReturned);

      // Line unit net price (price per unit after proportional discount)
      const lineTotalGross = Number(it.price);
      const unitGrossPrice = it.quantity > 0 ? lineTotalGross / it.quantity : 0;
      const unitRefundPrice = Number((unitGrossPrice * (1 - discountRatio)).toFixed(2));

      return {
        saleItemId: it.id,
        medicineId: it.medicine.id,
        medicineName: it.medicine.name,
        genericName: it.medicine.genericName,
        company: it.medicine.company,
        hsnCode: it.medicine.hsnCode,
        batchId: it.batch.id,
        batchNo: it.batch.batchNo,
        expiryDate: it.batch.expiryDate,
        currentStockInBatch: it.batch.quantity,
        purchasedQty: it.quantity,
        alreadyReturnedQty: alreadyReturned,
        remainingReturnableQty: remainingReturnable,
        isFullyReturned: remainingReturnable <= 0,
        mrp: Number(it.mrp),
        unitGrossPrice,
        unitRefundPrice,
        discountRatioApplied: Number((discountRatio * 100).toFixed(2)),
      };
    });

    const isFullyReturnedSale = returnableItems.every((it) => it.isFullyReturned);

    return NextResponse.json({
      success: true,
      sale: {
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        saleDate: sale.saleDate,
        createdAt: sale.createdAt,
        totalAmount: Number(sale.totalAmount),
        discountAmount: Number(sale.discountAmount),
        grandTotal: Number(sale.grandTotal),
        paymentMethod: sale.paymentMethod,
        discountRatio: Number((discountRatio * 100).toFixed(2)),
        customer: sale.customer,
        branch: sale.branch,
        cashier: sale.creator,
        isFullyReturned: isFullyReturnedSale,
        items: returnableItems,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/returns/lookup error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to lookup invoice for return" },
      { status: 500 }
    );
  }
}
