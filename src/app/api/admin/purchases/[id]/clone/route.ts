import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { sendSupplierPoEmail } from "@/lib/email";

/**
 * MODULE 1.11.2 / 1.12.3: REORDER PO CLONING
 * 
 * 1-click cloning of an existing Purchase Order into a new pending PO.
 */

export async function POST(
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
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid PO ID" }, { status: 400 });
  }

  try {
    const sourcePO = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: true,
        supplier: true,
      },
    });

    if (!sourcePO) {
      return NextResponse.json({ success: false, message: "Source Purchase Order not found" }, { status: 404 });
    }

    if (sourcePO.items.length === 0) {
      return NextResponse.json({ success: false, message: "Cannot clone an empty Purchase Order" }, { status: 400 });
    }

    const currentUserId = auth.session.userId;

    const newPO = await runInTransaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const poPrefix = `PO-${currentYear}-`;

      let cloned: any = null;
      let attempts = 0;

      while (!cloned && attempts < 5) {
        attempts++;
        const lastPO = await tx.purchaseOrder.findFirst({
          where: { poNumber: { startsWith: poPrefix } },
          orderBy: { id: "desc" },
          select: { poNumber: true },
        });

        let nextSeq = 1;
        if (lastPO?.poNumber) {
          const parts = lastPO.poNumber.split("-");
          const lastNum = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastNum)) nextSeq = lastNum + (attempts === 1 ? 1 : attempts);
        }
        const poNumber = `${poPrefix}${String(nextSeq).padStart(5, "0")}`;

        const reorderTotal = sourcePO.items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0);

        try {
          cloned = await tx.purchaseOrder.create({
            data: {
              poNumber,
              supplierId: sourcePO.supplierId,
              branchId: sourcePO.branchId,
              poDate: new Date(),
              status: "pending",
              total: Math.round(reorderTotal * 100) / 100,
              notes: `Reorder cloned from ${sourcePO.poNumber}`,
              createdBy: currentUserId,
              items: {
                create: sourcePO.items.map((it) => ({
                  medicineId: it.medicineId,
                  quantity: it.quantity,
                  price: it.price,
                  mrp: it.mrp,
                  receivedQty: 0,
                })),
              },
            },
            include: {
              supplier: true,
              branch: true,
              items: { include: { medicine: true } },
            },
          });
        } catch (err: any) {
          if (err?.code === "P2002" && attempts < 5) {
            continue;
          }
          throw err;
        }
      }

      return cloned;
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: newPO.branchId || auth.session.branchId,
      action: "PO_REORDER_CLONED",
      entity: "purchase_order",
      entityId: newPO.id,
      details: {
        clonedFrom: sourcePO.poNumber,
        newPoNumber: newPO.poNumber,
        supplierName: sourcePO.supplier.name,
      },
      ipAddress: getClientIp(req),
    });

    // MODULE 1.12.5: Notify supplier on PO clone creation
    if (sourcePO.supplier?.email) {
      sendSupplierPoEmail({
        type: "created",
        poNumber: newPO.poNumber,
        supplierName: sourcePO.supplier.name,
        supplierEmail: sourcePO.supplier.email,
        totalAmount: Number(newPO.total),
        itemsCount: sourcePO.items.length,
        branchName: newPO.branch?.name,
        notes: newPO.notes || undefined,
      }).catch((err) => console.error("Supplier PO clone email error:", err));
    }

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${newPO.poNumber} cloned successfully from ${sourcePO.poNumber}`,
      purchaseOrder: newPO,
    });
  } catch (error: any) {
    console.error("POST /api/admin/purchases/[id]/clone error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to clone PO" }, { status: 500 });
  }
}
