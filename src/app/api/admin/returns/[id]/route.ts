import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

/**
 * GET /api/admin/returns/[id]
 * Fetches a single return record with full items and original invoice for Credit Note printing.
 *
 * PATCH /api/admin/returns/[id]
 * Transitions a 'pending' return to 'processed' (executing stock restock/write-off + store_credit ledger)
 * or 'rejected' (Module 2.11.1).
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

    if (auth.session.storeId && returnRecord.branch?.storeId && returnRecord.branch.storeId !== auth.session.storeId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Cannot access return from another store" },
        { status: 403 }
      );
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
        refundMethod: returnRecord.refundMethod || "cash",
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

export async function PATCH(
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
  if (isNaN(returnId)) {
    return NextResponse.json({ success: false, message: "Invalid return ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const targetStatus = String(body.status || "").toLowerCase();
    if (!["processed", "rejected"].includes(targetStatus)) {
      return NextResponse.json(
        { success: false, message: "Status transition must be 'processed' or 'rejected'" },
        { status: 400 }
      );
    }

    const updatedReturn = await runInTransaction(async (tx) => {
      const existing = await tx.return.findUnique({
        where: { id: returnId },
        include: {
          branch: { select: { id: true, storeId: true } },
          sale: { select: { id: true, invoiceNo: true, customerId: true } },
          items: {
            include: {
              saleItem: {
                include: {
                  returnItems: {
                    where: { returnId: { not: returnId } },
                    select: {
                      quantity: true,
                      returnReturn: { select: { status: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!existing) {
        throw new Error("Return record not found");
      }

      if (auth.session!.storeId && existing.branch?.storeId && existing.branch.storeId !== auth.session!.storeId) {
        throw new Error("Forbidden: Cannot update return from another store");
      }

      if (existing.branchId && !canAccessBranch(auth.session, existing.branchId)) {
        throw new Error("Forbidden: Cannot update return from another branch");
      }

      if (existing.status !== "pending") {
        throw new Error(`Return ${existing.returnNumber} is already '${existing.status}' and cannot be modified`);
      }

      if (targetStatus === "rejected") {
        return await tx.return.update({
          where: { id: returnId },
          data: {
            status: "rejected",
            processedAt: new Date(),
            stockAdjusted: false,
          },
        });
      }

      // Transition pending -> processed
      for (const item of existing.items) {
        if (!item.medicineId || !item.batchId) continue;

        const otherReturned = item.saleItem.returnItems
          .filter((ri) => ri.returnReturn.status !== "rejected")
          .reduce((sum, ri) => sum + ri.quantity, 0);

        if (otherReturned + item.quantity > item.saleItem.quantity) {
          throw new Error(
            `Cannot approve return: Item ${item.saleItemId} only has ${Math.max(
              0,
              item.saleItem.quantity - otherReturned
            )} units remaining returnable`
          );
        }

        const freshBatch = await tx.batch.findUnique({
          where: { id: item.batchId },
          select: { quantity: true },
        });
        const oldQty = freshBatch?.quantity ?? 0;

        if (item.restockAction === "restock") {
          await tx.batch.update({
            where: { id: item.batchId },
            data: { quantity: { increment: item.quantity } },
          });

          await tx.stockAdjustment.create({
            data: {
              batchId: item.batchId,
              medicineId: item.medicineId,
              branchId: existing.branchId,
              type: "return",
              quantity: item.quantity,
              reason: `Sales Return ${existing.returnNumber} Restocked`,
              oldQty,
              newQty: oldQty + item.quantity,
              userId: auth.session!.userId,
            },
          });
        } else {
          await tx.stockAdjustment.create({
            data: {
              batchId: item.batchId,
              medicineId: item.medicineId,
              branchId: existing.branchId,
              type: "remove",
              quantity: item.quantity,
              reason: `Sales Return ${existing.returnNumber} Damaged/Expired Write-Off`,
              oldQty,
              newQty: oldQty,
              userId: auth.session!.userId,
            },
          });
        }
      }

      const refundAmt = Number(existing.refundAmount);
      if (existing.refundMethod === "store_credit" && existing.customerId && refundAmt > 0) {
        await tx.customerPayment.create({
          data: {
            customerId: existing.customerId,
            saleId: existing.saleId,
            amount: refundAmt,
            paymentMethod: "store_credit",
            referenceNo: existing.returnNumber,
            notes: `Sales Return Store Credit (${existing.returnNumber} vs ${existing.sale.invoiceNo})`,
            branchId: existing.branchId,
            createdBy: auth.session!.userId,
          },
        });
      }

      return await tx.return.update({
        where: { id: returnId },
        data: {
          status: "processed",
          stockAdjusted: true,
          processedAt: new Date(),
        },
      });
    });

    await logAudit({
      storeId: auth.session.storeId,
      action: targetStatus === "processed" ? "RETURN_APPROVED" : "RETURN_REJECTED",
      entity: "Return",
      entityId: updatedReturn.id,
      userId: auth.session.userId,
      branchId: updatedReturn.branchId || undefined,
      details: {
        returnNumber: updatedReturn.returnNumber,
        status: targetStatus,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Return ${updatedReturn.returnNumber} marked as ${targetStatus}.`,
      return: {
        ...updatedReturn,
        refundAmount: Number(updatedReturn.refundAmount),
      },
    });
  } catch (error: any) {
    console.error("PATCH /api/admin/returns/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update return status" },
      { status: 400 }
    );
  }
}
