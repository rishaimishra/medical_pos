import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      customerId,
      paymentMethod = "cash",
      items,
      discountAmount = 0,
      doctorName,
      doctorRegNo,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Cart items are required for checkout" },
        { status: 400 }
      );
    }

    // Generate formatted invoice number DRX-YYYY-00001
    const currentYear = new Date().getFullYear();
    const invoicePrefix = `DRX-${currentYear}-`;
    const lastSale = await prisma.sale.findFirst({
      where: { invoiceNo: { startsWith: invoicePrefix } },
      orderBy: { id: "desc" },
    });

    let nextNumber = 1;
    if (lastSale?.invoiceNo) {
      const parts = lastSale.invoiceNo.split("-");
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) nextNumber = lastSeq + 1;
    }
    const invoiceNo = `${invoicePrefix}${String(nextNumber).padStart(5, "0")}`;

    // Execute atomic checkout transaction
    const saleResult = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let totalGst = 0;

      // 1. Re-validate each item and prepare line items
      const preparedLines = [];

      for (const item of items) {
        const batch = await tx.batch.findUnique({
          where: { id: item.batchId },
          include: { medicine: true },
        });

        if (!batch) {
          throw new Error(`Batch ID ${item.batchId} not found`);
        }

        if (new Date(batch.expiryDate) < new Date()) {
          throw new Error(
            `Safety Violation: Cannot sell expired drug batch ${batch.batchNo}`
          );
        }

        if (batch.quantity < item.quantity) {
          throw new Error(
            `Insufficient stock for ${batch.medicine.name} (Batch: ${batch.batchNo}). Available: ${batch.quantity}, Requested: ${item.quantity}`
          );
        }

        const gstPercent = Number(batch.medicine.gstPercent || 12);
        const unitMrp = Number(batch.mrp);
        const lineTotal = unitMrp * item.quantity;
        const taxableBase = lineTotal / (1 + gstPercent / 100);
        const gstAmount = lineTotal - taxableBase;

        subtotal += lineTotal;
        totalGst += gstAmount;

        // Deduct batch quantity
        const oldQty = batch.quantity;
        const newQty = oldQty - item.quantity;

        await tx.batch.update({
          where: { id: batch.id },
          data: { quantity: newQty },
        });

        // Write immutable stock_adjustments entry
        await tx.stockAdjustment.create({
          data: {
            batchId: batch.id,
            medicineId: batch.medicineId,
            branchId: batch.branchId || null,
            type: "sale",
            quantity: -item.quantity,
            reason: `Sale: ${invoiceNo}`,
            oldQty,
            newQty,
          },
        });

        preparedLines.push({
          medicineId: batch.medicineId,
          batchId: batch.id,
          quantity: item.quantity,
          mrp: unitMrp,
          taxableBase,
          gstPercent,
          gstAmount,
          price: lineTotal,
        });
      }

      const grandTotal = Math.max(0, subtotal - Number(discountAmount));

      // 2. Create Sale header & line items
      const newSale = await tx.sale.create({
        data: {
          invoiceNo,
          customerId: customerId ? parseInt(customerId, 10) : null,
          totalAmount: subtotal,
          gstAmount: totalGst,
          discountAmount,
          grandTotal,
          paymentMethod,
          doctorName,
          doctorRegNo,
          items: {
            create: preparedLines,
          },
        },
        include: {
          items: true,
        },
      });

      // 3. Write customer_purchase_log if registered customer
      if (customerId) {
        await tx.customerPurchaseLog.create({
          data: {
            customerId: parseInt(customerId, 10),
            saleId: newSale.id,
            amount: grandTotal,
            date: new Date(),
          },
        });
      }

      return newSale;
    });

    return NextResponse.json({
      success: true,
      sale: saleResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Transaction failed and rolled back" },
      { status: 400 }
    );
  }
}

