import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { sendSupplierPoEmail } from "@/lib/email";
import crypto from "crypto";

/**
 * MODULE 1.11.3: GOODS RECEIPT NOTE (GRN) & INWARD STOCK INGESTION
 * 
 * Inwards physical goods against a Purchase Order into branch inventory.
 * Merges with existing batches or seeds new batch records, updates POItem.receivedQty,
 * records bonus/scheme quantities, writes immutable stock_adjustments, and updates PO status.
 */

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to inward stock" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const poId = parseInt(body.poId, 10);
    const invoiceNo = (body.invoiceNo || "").trim() || null;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!poId || isNaN(poId)) {
      return NextResponse.json({ success: false, message: "Purchase Order ID is required" }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: "No items provided for stock inwarding" }, { status: 400 });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: {
        items: { include: { medicine: true } },
        supplier: true,
        branch: true,
      },
    });

    if (!po) {
      return NextResponse.json({ success: false, message: "Purchase Order not found" }, { status: 404 });
    }

    if (po.status === "cancelled") {
      return NextResponse.json({ success: false, message: "Cannot receive goods for a cancelled Purchase Order" }, { status: 400 });
    }

    const branchId = po.branchId || body.branchId || auth.session.branchId || null;

    // Validate inward lines
    const validLines: any[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const poItemId = parseInt(it.poItemId, 10);
      const receivedQty = parseInt(it.receivedQty, 10) || 0;
      const bonusQty = parseInt(it.bonusQty, 10) || 0;

      // Skip lines with zero inward
      if (receivedQty <= 0 && bonusQty <= 0) continue;

      const poItem = po.items.find((p) => p.id === poItemId);
      if (!poItem) {
        return NextResponse.json({ success: false, message: `Item #${i + 1}: Line item ID ${poItemId} does not belong to this PO` }, { status: 400 });
      }

      let batchNo = (it.batchNo || "").trim();
      if (!batchNo) {
        const datePrefix = new Date().toISOString().slice(2, 10).replace(/-/g, "");
        batchNo = `B-${datePrefix}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      }

      if (!it.expiryDate) {
        return NextResponse.json({ success: false, message: `Item '${poItem.medicine.name}': Expiry date is mandatory for stock inwarding` }, { status: 400 });
      }

      const expiryDate = new Date(it.expiryDate);
      if (isNaN(expiryDate.getTime())) {
        return NextResponse.json({ success: false, message: `Item '${poItem.medicine.name}': Invalid expiry date format` }, { status: 400 });
      }

      const mfgDate = it.mfgDate ? new Date(it.mfgDate) : null;
      if (mfgDate && !isNaN(mfgDate.getTime()) && mfgDate > expiryDate) {
        return NextResponse.json({ success: false, message: `Item '${poItem.medicine.name}': Mfg date cannot be later than expiry date` }, { status: 400 });
      }

      const purchasePrice = parseFloat(it.purchasePrice) || Number(poItem.price);
      const mrp = parseFloat(it.mrp) || Number(poItem.mrp);
      const tradeDiscount = Math.max(0, Math.min(100, parseFloat(it.tradeDiscount) || 0));
      const effectiveUnitCost = tradeDiscount > 0 ? purchasePrice * (1 - tradeDiscount / 100) : purchasePrice;

      if (mrp <= 0) {
        return NextResponse.json({ success: false, message: `Item '${poItem.medicine.name}': MRP must be greater than zero` }, { status: 400 });
      }

      // Over-inwarding protection: prevent accidental order of more than 3x remaining quantity
      const maxAllowed = Math.max(poItem.quantity * 3, 50);
      if (receivedQty > maxAllowed) {
        return NextResponse.json({ success: false, message: `Item '${poItem.medicine.name}': Received quantity (${receivedQty}) exceeds maximum allowable threshold (${maxAllowed})` }, { status: 400 });
      }

      validLines.push({
        poItemId,
        medicineId: poItem.medicineId,
        medicineName: poItem.medicine.name,
        receivedQty,
        bonusQty,
        totalDelta: receivedQty + bonusQty,
        batchNo,
        expiryDate,
        mfgDate,
        purchasePrice,
        tradeDiscount,
        effectiveUnitCost,
        mrp,
      });
    }

    if (validLines.length === 0) {
      return NextResponse.json({ success: false, message: "No items with positive received quantity to inward" }, { status: 400 });
    }

    const currentUserId = auth.session.userId;

    // Execute atomic GRN Inward transaction
    const grnResult = await runInTransaction(async (tx) => {
      const inwardedBatches: any[] = [];

      for (const line of validLines) {
        // 1. Check if matching batch already exists in this branch:
        //    Composite Unique: uk_medicine_batch_branch [medicineId, batchNo, branchId]
        const existingBatch = await tx.batch.findFirst({
          where: {
            medicineId: line.medicineId,
            batchNo: line.batchNo,
            branchId: branchId,
          },
        });

        let targetBatchId: number;
        let oldQty = 0;
        let newQty = 0;

        if (existingBatch) {
          oldQty = existingBatch.quantity;
          newQty = oldQty + line.totalDelta;
          targetBatchId = existingBatch.id;

          // Compute weighted average cost upon batch merge safely clamping non-negative old stock
          const validOldQty = Math.max(0, oldQty);
          const oldStockVal = validOldQty * Number(existingBatch.purchasePrice || 0);
          const inwardStockVal = line.totalDelta * line.effectiveUnitCost;
          const weightedCost = (validOldQty + line.totalDelta) > 0
            ? Math.round(((oldStockVal + inwardStockVal) / (validOldQty + line.totalDelta)) * 100) / 100
            : line.effectiveUnitCost;

          await tx.batch.update({
            where: { id: existingBatch.id },
            data: {
              quantity: newQty,
              purchasePrice: weightedCost,
              mrp: line.mrp,
              expiryDate: line.expiryDate,
              mfgDate: line.mfgDate || existingBatch.mfgDate,
              supplierId: po.supplierId,
            },
          });
        } else {
          oldQty = 0;
          newQty = line.totalDelta;

          const createdBatch = await tx.batch.create({
            data: {
              medicineId: line.medicineId,
              batchNo: line.batchNo,
              branchId: branchId,
              supplierId: po.supplierId,
              mfgDate: line.mfgDate,
              expiryDate: line.expiryDate,
              quantity: newQty,
              purchasePrice: line.effectiveUnitCost,
              mrp: line.mrp,
            },
          });
          targetBatchId = createdBatch.id;
        }

        // 2. Update POItem tracking
        const currentPOItem = await tx.pOItem.findUnique({ where: { id: line.poItemId } });
        const updatedReceivedQty = (currentPOItem?.receivedQty || 0) + line.receivedQty;
        const updatedBonusQty = (currentPOItem?.bonusQty || 0) + line.bonusQty;

        await tx.pOItem.update({
          where: { id: line.poItemId },
          data: {
            receivedQty: updatedReceivedQty,
            bonusQty: updatedBonusQty,
            batchNo: line.batchNo,
            expiryDate: line.expiryDate,
          },
        });

        // 3. Write immutable stock_adjustments entry
        await tx.stockAdjustment.create({
          data: {
            batchId: targetBatchId,
            medicineId: line.medicineId,
            branchId: branchId,
            type: "add",
            quantity: line.totalDelta,
            reason: `GRN: ${po.poNumber}${invoiceNo ? ` (Inv: ${invoiceNo})` : ""}`,
            oldQty,
            newQty,
            userId: currentUserId,
          },
        });

        inwardedBatches.push({
          batchId: targetBatchId,
          medicineName: line.medicineName,
          batchNo: line.batchNo,
          receivedQty: line.receivedQty,
          bonusQty: line.bonusQty,
          totalAdded: line.totalDelta,
          oldStock: oldQty,
          newStock: newQty,
        });
      }

      // 4. Determine overall PO completion status
      const allPOItems = await tx.pOItem.findMany({ where: { poId } });
      const allFullyReceived = allPOItems.every((item) => item.receivedQty >= item.quantity);

      const nextStatus = allFullyReceived ? "received" : "shipped";
      const poUpdateData: any = {
        status: nextStatus,
        invoiceNo: invoiceNo || po.invoiceNo,
      };

      if (allFullyReceived && !po.receivedAt) {
        poUpdateData.receivedAt = new Date();
      }

      // Sync PO total with actual received items value upon full receipt
      if (allFullyReceived) {
        const actualInwardTotal = allPOItems.reduce((sum, item) => sum + (item.receivedQty * Number(item.price)), 0);
        poUpdateData.total = Math.round(actualInwardTotal * 100) / 100;
      }

      const updatedPO = await tx.purchaseOrder.update({
        where: { id: poId },
        data: poUpdateData,
        include: { supplier: true, branch: true, items: { include: { medicine: true } } },
      });

      return {
        updatedPO,
        inwardedBatches,
        allFullyReceived,
      };
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: branchId || auth.session.branchId,
      action: "GRN_INWARD_COMPLETED",
      entity: "purchase_order",
      entityId: po.id,
      details: {
        poNumber: po.poNumber,
        invoiceNo,
        itemsInwarded: validLines.length,
        isFullyReceived: grnResult.allFullyReceived,
        supplierName: po.supplier.name,
      },
      ipAddress: getClientIp(req),
    });

    // MODULE 1.12.5: Notify supplier on PO receive
    if (po.supplier?.email) {
      sendSupplierPoEmail({
        type: "received",
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        supplierEmail: po.supplier.email,
        totalAmount: Number(grnResult.updatedPO.total),
        itemsCount: validLines.length,
        branchName: po.branch?.name,
        notes: invoiceNo ? `Inwarded with Invoice: ${invoiceNo}` : undefined,
      }).catch((err) => console.error("Supplier PO received email error:", err));
    }

    return NextResponse.json({
      success: true,
      message: grnResult.allFullyReceived
        ? `GRN approved: Purchase Order ${po.poNumber} is now fully received and inventory updated.`
        : `GRN recorded: Partial delivery for ${po.poNumber} ingested into stock.`,
      purchaseOrder: grnResult.updatedPO,
      inwardedBatches: grnResult.inwardedBatches,
    });
  } catch (error: any) {
    console.error("POST /api/admin/grn error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to inward stock" }, { status: 500 });
  }
}
