import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { sendSupplierPoEmail } from "@/lib/email";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
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
        branch: true,
        creator: {
          select: { id: true, name: true, username: true, role: true },
        },
        items: {
          include: {
            medicine: {
              select: {
                id: true,
                name: true,
                genericName: true,
                company: true,
                category: true,
                hsnCode: true,
                gstPercent: true,
                rackLocation: true,
              },
            },
          },
        },
      },
    });

    if (!po) {
      return NextResponse.json({ success: false, message: "Purchase Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, purchaseOrder: po });
  } catch (error: any) {
    console.error("GET /api/admin/purchases/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch PO" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    auth.session.role !== "pharmacist" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid PO ID" }, { status: 400 });
  }

  try {
    let existing: any = null;
    try {
      existing = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });
    } catch (err: any) {
      if (err?.code === "P1017" || err?.message?.includes("closed the connection")) {
        await prisma.$connect().catch(() => {});
        existing = await prisma.purchaseOrder.findUnique({
          where: { id },
          include: { items: true },
        });
      } else {
        throw err;
      }
    }

    if (!existing) {
      return NextResponse.json({ success: false, message: "Purchase Order not found" }, { status: 404 });
    }

    const body = await req.json();
    const action = body.action; // "update_status" | "edit_items" | "general"

    if (action === "update_status" || body.status) {
      const newStatus = (body.status || "").toLowerCase();
      const validStatuses = ["draft", "pending", "price_updated", "confirmed", "shipped", "received", "cancelled"];

      if (!validStatuses.includes(newStatus)) {
        return NextResponse.json({ success: false, message: `Invalid status: ${newStatus}` }, { status: 400 });
      }

      // State Transition Rules:
      // 1. Once received, cannot cancel or revert
      if (existing.status === "received" && newStatus !== "received") {
        return NextResponse.json({ success: false, message: "Cannot modify status of a received Purchase Order" }, { status: 400 });
      }

      // 2. Setting status directly to 'received' without GRN is forbidden
      if (newStatus === "received" && existing.status !== "received") {
        return NextResponse.json(
          {
            success: false,
            message: "Cannot manually mark Purchase Order as received without physical stock inwarding. Please use the GRN Inwarding Desk (/admin/grn).",
          },
          { status: 400 }
        );
      }

      // 3. Cancel is only allowed from pending, price_updated, confirmed, or draft
      if (newStatus === "cancelled" && existing.status !== "pending" && existing.status !== "price_updated" && existing.status !== "confirmed" && existing.status !== "draft") {
        return NextResponse.json({ success: false, message: `Cannot cancel a PO that is currently '${existing.status}'` }, { status: 400 });
      }

      // 4. Admin-only confirmation lock (Module 1.12.2)
      if (newStatus === "confirmed" && auth.session.role !== "admin" && !hasPermission(auth.session, "manage_purchases")) {
        return NextResponse.json({ success: false, message: "Forbidden: Only administrator can confirm Purchase Orders and lock prices" }, { status: 403 });
      }

      const updateData: any = { status: newStatus };
      if (newStatus === "confirmed" && !existing.confirmedAt) updateData.confirmedAt = new Date();
      if (newStatus === "shipped" && !existing.shippedAt) updateData.shippedAt = new Date();
      if (newStatus === "received" && !existing.receivedAt) updateData.receivedAt = new Date();

      const updated = await prisma.purchaseOrder.update({
        where: { id },
        data: updateData,
        include: { supplier: true, branch: true, items: { include: { medicine: true } } },
      });

      await logAudit({
        userId: auth.session.userId,
        branchId: updated.branchId || auth.session.branchId,
        action: newStatus === "cancelled" ? "PO_CANCELLED" : "PO_STATUS_CHANGED",
        entity: "purchase_order",
        entityId: id,
        details: { oldStatus: existing.status, newStatus, poNumber: updated.poNumber },
        ipAddress: getClientIp(req),
      });

      // MODULE 1.12.5: Notify supplier on confirm or cancel
      if ((newStatus === "confirmed" || newStatus === "cancelled") && updated.supplier?.email) {
        sendSupplierPoEmail({
          type: newStatus === "confirmed" ? "confirmed" : "cancelled",
          poNumber: updated.poNumber,
          supplierName: updated.supplier.name,
          supplierEmail: updated.supplier.email,
          totalAmount: Number(updated.total),
          itemsCount: updated.items.length,
          branchName: updated.branch?.name,
          notes: updated.notes || undefined,
        }).catch((err) => console.error("Supplier PO status email notification error:", err));
      }

      return NextResponse.json({
        success: true,
        message: `Purchase Order ${updated.poNumber} status updated to '${newStatus}'`,
        purchaseOrder: updated,
      });
    }

    // Editing items or notes
    if (existing.status === "confirmed" || existing.status === "received" || existing.status === "cancelled" || existing.status === "shipped") {
      return NextResponse.json({ success: false, message: `Cannot edit items of a ${existing.status} PO. Prices and lines are locked.` }, { status: 400 });
    }

    const hasReceivedItems = existing.items.some((it: any) => it.receivedQty > 0);
    if (hasReceivedItems && body.items) {
      return NextResponse.json({ success: false, message: "Cannot modify line items of a PO that has already been partially inwarded" }, { status: 400 });
    }

    const notes = body.notes !== undefined ? ((body.notes || "").trim() || null) : existing.notes;
    const items = Array.isArray(body.items) ? body.items : null;

    if (items) {
      // Re-validate and recalculate total
      let newTotal = 0;
      const updatedLines: any[] = [];

      for (const it of items) {
        const qty = parseInt(it.quantity, 10);
        const price = parseFloat(it.price);
        const mrp = parseFloat(it.mrp);
        const medId = parseInt(it.medicineId, 10);

        if (isNaN(qty) || qty <= 0 || isNaN(price) || price < 0 || isNaN(mrp) || mrp < 0 || !medId) {
          return NextResponse.json({ success: false, message: "Invalid item values in PO" }, { status: 400 });
        }
        newTotal += price * qty;
        updatedLines.push({
          id: it.id ? parseInt(it.id, 10) : undefined,
          medicineId: medId,
          quantity: qty,
          price,
          mrp,
        });
      }

      await runInTransaction(async (tx) => {
        // Delete old items and insert new ones
        await tx.pOItem.deleteMany({ where: { poId: id } });
        await tx.pOItem.createMany({
          data: updatedLines.map((l) => ({
            poId: id,
            medicineId: l.medicineId,
            quantity: l.quantity,
            price: l.price,
            mrp: l.mrp,
          })),
        });
        await tx.purchaseOrder.update({
          where: { id },
          data: { total: newTotal, notes },
        });
      });
    } else {
      await prisma.purchaseOrder.update({
        where: { id },
        data: { notes },
      });
    }

    const reloaded = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { supplier: true, branch: true, items: { include: { medicine: true } } },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: reloaded?.branchId || auth.session.branchId,
      action: "PO_UPDATED",
      entity: "purchase_order",
      entityId: id,
      details: { poNumber: reloaded?.poNumber, total: reloaded?.total },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${reloaded?.poNumber} updated successfully`,
      purchaseOrder: reloaded,
    });
  } catch (error: any) {
    console.error("PUT /api/admin/purchases/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update PO" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (auth.session.role !== "admin" && !hasPermission(auth.session, "manage_purchases")) {
    return NextResponse.json({ success: false, message: "Forbidden: Admin privileges required" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid PO ID" }, { status: 400 });
  }

  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!po) {
      return NextResponse.json({ success: false, message: "Purchase Order not found" }, { status: 404 });
    }

    // Safety delete guard: Cannot delete if already confirmed, shipped, or received, or has received items
    const hasReceipts = po.items.some((i) => i.receivedQty > 0);
    if (po.status === "received" || po.status === "shipped" || hasReceipts) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete Purchase Order ${po.poNumber} because items have already been shipped or inwarded. You may cancel it if unreceived.`,
        },
        { status: 400 }
      );
    }

    await prisma.purchaseOrder.delete({ where: { id } });

    await logAudit({
      userId: auth.session.userId,
      branchId: po.branchId || auth.session.branchId,
      action: "PO_DELETED",
      entity: "purchase_order",
      entityId: id,
      details: { poNumber: po.poNumber },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${po.poNumber} deleted successfully`,
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/purchases/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete PO" }, { status: 500 });
  }
}
