import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifySupplierRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { sendSupplierPoEmail } from "@/lib/email";

/**
 * MODULE 1.12.2: SUPPLIER PRICE UPDATE & PO VIEW
 * 
 * - Supplier may update item prices (sets status to 'price_updated').
 * - Only admin can confirm (which locks prices). If already confirmed/shipped/received/cancelled,
 *   price modifications are strictly forbidden.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid PO ID" }, { status: 400 });
  }

  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        branch: { select: { id: true, code: true, name: true, phone: true, address: true } },
        items: {
          include: {
            medicine: {
              select: { id: true, name: true, genericName: true, company: true, hsnCode: true, gstPercent: true },
            },
          },
        },
      },
    });

    if (!po || po.supplierId !== auth.session.supplierId || po.status === "draft") {
      return NextResponse.json({ success: false, message: "Purchase Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, purchaseOrder: po });
  } catch (error: any) {
    console.error("GET /api/supplier/orders/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch order" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid PO ID" }, { status: 400 });
  }

  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: true,
        supplier: true,
        branch: true,
      },
    });

    if (!po || po.supplierId !== auth.session.supplierId || po.status === "draft") {
      return NextResponse.json({ success: false, message: "Purchase Order not found" }, { status: 404 });
    }

    // Module 1.12.2: Price Locking Enforcement
    // If PO is confirmed, shipped, received, or cancelled, prices are locked!
    if (po.status === "confirmed") {
      return NextResponse.json(
        {
          success: false,
          message: "Cannot modify prices: This Purchase Order has already been confirmed by pharmacy admin and prices are locked.",
        },
        { status: 400 }
      );
    }

    if (po.status === "shipped" || po.status === "received" || po.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot modify prices for order with status '${po.status}'.`,
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const itemPrices: Array<{ itemId: number; price: number; mrp?: number }> = Array.isArray(body.items) ? body.items : [];

    if (itemPrices.length === 0) {
      return NextResponse.json({ success: false, message: "No price updates submitted" }, { status: 400 });
    }

    // Validate prices
    for (const entry of itemPrices) {
      const itemId = parseInt(String(entry.itemId), 10);
      const price = parseFloat(String(entry.price));
      if (!itemId || isNaN(itemId)) {
        return NextResponse.json({ success: false, message: "Invalid line item ID in price update" }, { status: 400 });
      }
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ success: false, message: `Invalid unit price for item ID ${itemId}` }, { status: 400 });
      }
      const existingLine = po.items.find((it) => it.id === itemId);
      if (!existingLine) {
        return NextResponse.json({ success: false, message: `Item ID ${itemId} does not belong to this PO` }, { status: 400 });
      }
      const effectiveMrp = entry.mrp !== undefined && !isNaN(parseFloat(String(entry.mrp)))
        ? parseFloat(String(entry.mrp))
        : Number(existingLine.mrp);
      if (effectiveMrp < price) {
        return NextResponse.json(
          {
            success: false,
            message: `Item ID ${itemId}: MRP (₹${effectiveMrp.toFixed(2)}) cannot be less than purchase price (₹${price.toFixed(2)})`,
          },
          { status: 400 }
        );
      }
    }

    // Execute atomic price update in transaction
    const updatedPO = await runInTransaction(async (tx) => {
      let recalculatedTotal = 0;

      for (const line of po.items) {
        const updateEntry = itemPrices.find((it) => parseInt(String(it.itemId), 10) === line.id);
        const effectivePrice = updateEntry ? parseFloat(String(updateEntry.price)) : Number(line.price);
        const effectiveMrp = updateEntry?.mrp ? parseFloat(String(updateEntry.mrp)) : Number(line.mrp);

        if (updateEntry) {
          await tx.pOItem.update({
            where: { id: line.id },
            data: { price: effectivePrice, mrp: effectiveMrp },
          });
        }

        recalculatedTotal += effectivePrice * line.quantity;
      }

      // Update PO status to 'price_updated'
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: "price_updated",
          total: recalculatedTotal,
        },
        include: {
          supplier: true,
          branch: true,
          items: { include: { medicine: true } },
        },
      });

      return updated;
    });

    await logAudit({
      userId: null,
      branchId: updatedPO.branchId,
      action: "SUPPLIER_PRICE_UPDATED",
      entity: "purchase_order",
      entityId: id,
      details: {
        poNumber: updatedPO.poNumber,
        supplierName: updatedPO.supplier.name,
        newTotal: updatedPO.total,
        status: "price_updated",
      },
      ipAddress: getClientIp(req),
    });

    // Notify supplier of logged update
    if (updatedPO.supplier.email) {
      sendSupplierPoEmail({
        type: "price_updated",
        poNumber: updatedPO.poNumber,
        supplierName: updatedPO.supplier.name,
        supplierEmail: updatedPO.supplier.email,
        totalAmount: Number(updatedPO.total),
        itemsCount: updatedPO.items.length,
        branchName: updatedPO.branch?.name,
      }).catch((err) => console.error("Supplier price updated email error:", err));
    }

    return NextResponse.json({
      success: true,
      message: `Prices successfully updated for PO ${updatedPO.poNumber}. Status set to 'price_updated' awaiting pharmacy admin confirmation.`,
      purchaseOrder: updatedPO,
    });
  } catch (error: any) {
    console.error("PUT /api/supplier/orders/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update prices" }, { status: 500 });
  }
}
