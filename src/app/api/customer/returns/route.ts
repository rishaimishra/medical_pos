import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyCustomerRequest } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { requireStoreFeature } from "@/lib/entitlements";

/**
 * MODULE 2.19.2: Customer Return Request From Portal
 * - GET: Lists customer's return requests & statuses
 * - POST: Customer selects own invoice items and submits pending return request (requestedBy = "customer");
 *         notifies store by email; staff approves or rejects in /admin/returns.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];

  try {
    const returns = await prisma.return.findMany({
      where: { customerId: { in: linkedIds } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        sale: { select: { id: true, invoiceNo: true, saleDate: true, grandTotal: true } },
        items: {
          include: {
            medicine: { select: { id: true, name: true } },
            batch: { select: { batchNo: true } },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      returns: returns.map((r) => ({
        id: r.id,
        returnNumber: r.returnNumber,
        saleId: r.saleId,
        invoiceNo: r.sale.invoiceNo,
        reason: r.reason,
        refundAmount: Number(r.refundAmount),
        refundMethod: r.refundMethod,
        status: r.status,
        requestedBy: r.requestedBy,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() || null,
        items: r.items.map((it) => ({
          id: it.id,
          medicineName: it.medicine?.name || "Medicine",
          batchNo: it.batch?.batchNo || "-",
          quantity: it.quantity,
          price: Number(it.price),
          restockAction: it.restockAction,
        })),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/customer/returns error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load return requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const customerId = auth.session.customerId;
  const linkedIds = auth.session.linkedCustomerIds ?? [customerId];

  try {
    const body = await req.json();
    const saleId = parseInt(String(body.saleId || ""), 10);
    const reason = String(body.reason || "").trim();
    const rawRefundMethod = String(body.refundMethod || "store_credit").toLowerCase();
    const refundMethod = ["cash", "upi", "store_credit"].includes(rawRefundMethod)
      ? rawRefundMethod
      : "store_credit";

    const requestedItems: Array<{ saleItemId: number; quantity: number; restockAction?: string }> =
      Array.isArray(body.items) ? body.items : [];

    if (!saleId || isNaN(saleId)) {
      return NextResponse.json({ success: false, message: "Valid invoice (saleId) is required." }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ success: false, message: "Return reason is required." }, { status: 400 });
    }
    if (requestedItems.length === 0) {
      return NextResponse.json({ success: false, message: "Select at least one medicine item to return." }, { status: 400 });
    }

    for (const it of requestedItems) {
      const qtyNum = Number(it.quantity);
      if (!it.saleItemId || !Number.isFinite(qtyNum) || !Number.isInteger(qtyNum) || qtyNum <= 0) {
        return NextResponse.json(
          { success: false, message: "Invalid item ID or return quantity (must be a positive whole number)." },
          { status: 400 }
        );
      }
    }

    const result = await runInTransaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              medicine: { select: { name: true } },
              returnItems: {
                include: { returnReturn: { select: { status: true } } },
              },
            },
          },
          branch: { select: { id: true, name: true, storeId: true } },
        },
      });

      if (!sale || !sale.customerId || !linkedIds.includes(sale.customerId)) {
        return { errorStatus: 404, errorMessage: "Invoice not found for your account." };
      }

      const retFeature = await requireStoreFeature(
        sale.branch?.storeId ?? null,
        "patientPortalAndRxQueue",
        { forExternalPortal: true }
      );
      if (!retFeature.allowed) {
        const errBody = await retFeature.response!.json();
        return { errorStatus: 403, errorMessage: errBody.message };
      }

      const itemsSubtotal = sale.items.reduce((sum, si) => sum + Number(si.price), 0);
      const billPayableRatio =
        itemsSubtotal > 0 ? Math.max(0, Math.min(1, Number(sale.grandTotal) / itemsSubtotal)) : 1;

      const requestedQtyMap = new Map<number, number>();
      let totalRefundCalculated = 0;

      const validatedLines: Array<{
        saleItemId: number;
        medicineId: number;
        batchId: number;
        quantity: number;
        lineRefundPrice: number;
        restockAction: "restock" | "damaged_write_off";
      }> = [];

      for (const reqLine of requestedItems) {
        const saleItem = sale.items.find((si) => si.id === Number(reqLine.saleItemId));
        if (!saleItem) {
          throw new Error(`Item #${reqLine.saleItemId} does not belong to invoice ${sale.invoiceNo}`);
        }

        const alreadyReturned = saleItem.returnItems
          .filter((ri) => ri.returnReturn.status !== "rejected")
          .reduce((sum, ri) => sum + ri.quantity, 0);

        const prevReq = requestedQtyMap.get(saleItem.id) || 0;
        const cumulative = prevReq + Number(reqLine.quantity);
        const remaining = saleItem.quantity - alreadyReturned;

        if (cumulative > remaining) {
          throw new Error(
            `Cannot return ${cumulative} unit(s) of ${saleItem.medicine?.name || "item"}. Only ${Math.max(0, remaining)} remain returnable.`
          );
        }
        requestedQtyMap.set(saleItem.id, cumulative);

        const lineNet = Number(saleItem.price) * billPayableRatio;
        const itemRefund = Number(((lineNet * Number(reqLine.quantity)) / saleItem.quantity).toFixed(2));
        totalRefundCalculated += itemRefund;

        validatedLines.push({
          saleItemId: saleItem.id,
          medicineId: saleItem.medicineId,
          batchId: saleItem.batchId,
          quantity: Number(reqLine.quantity),
          lineRefundPrice: itemRefund,
          restockAction: reqLine.restockAction === "damaged_write_off" ? "damaged_write_off" : "restock",
        });
      }

      totalRefundCalculated = Math.min(Number(sale.grandTotal), Number(totalRefundCalculated.toFixed(2)));

      // Share advisory lock with admin/returns so RET-YYYY-XXXXX numbers never collide
      const year = new Date().getFullYear();
      const prefix = `RET-${year}-`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026002)`;
      const lastRet = await tx.return.findFirst({
        where: { returnNumber: { startsWith: prefix } },
        orderBy: { id: "desc" },
        select: { returnNumber: true },
      });
      let nextSeq = 1;
      if (lastRet?.returnNumber) {
        const parts = lastRet.returnNumber.split("-");
        const parsed = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      const returnNumber = `${prefix}${String(nextSeq).padStart(5, "0")}`;

      const createdReturn = await tx.return.create({
        data: {
          returnNumber,
          saleId: sale.id,
          customerId: sale.customerId ?? customerId,
          branchId: sale.branchId,
          reason,
          refundAmount: totalRefundCalculated,
          refundMethod,
          status: "pending",
          stockAdjusted: false,
          requestedBy: "customer",
        },
      });

      for (const line of validatedLines) {
        await tx.returnItem.create({
          data: {
            returnId: createdReturn.id,
            saleItemId: line.saleItemId,
            medicineId: line.medicineId,
            batchId: line.batchId,
            quantity: line.quantity,
            price: line.lineRefundPrice,
            restockAction: line.restockAction,
          },
        });
      }

      return { createdReturn, sale };
    });

    if ("errorStatus" in result && result.errorStatus) {
      return NextResponse.json(
        { success: false, message: result.errorMessage },
        { status: result.errorStatus }
      );
    }

    const { createdReturn, sale } = result as { createdReturn: any; sale: any };

    // Notify pharmacy store email best-effort
    const store = sale.branch?.storeId
      ? await prisma.settings.findUnique({ where: { id: sale.branch.storeId } })
      : await prisma.settings.findFirst({ orderBy: { id: "asc" } });

    if (store?.storeEmail) {
      sendEmail({
        to: store.storeEmail,
        subject: `[Customer Return Request] ${createdReturn.returnNumber} — Invoice ${sale.invoiceNo}`,
        html: `<p>Customer <strong>${escapeHtml(auth.session.name)}</strong> (${escapeHtml(auth.session.phone)}) requested a sales return.</p><p><strong>Return #:</strong> ${escapeHtml(createdReturn.returnNumber)}<br/><strong>Invoice:</strong> ${escapeHtml(sale.invoiceNo)}<br/><strong>Requested Refund:</strong> ₹${Number(createdReturn.refundAmount).toFixed(2)}<br/><strong>Reason:</strong> ${escapeHtml(reason)}</p><p>Please review and approve/reject inside Admin Returns.</p>`,
        text: `Customer Return Request ${createdReturn.returnNumber} for Invoice ${sale.invoiceNo} (₹${Number(createdReturn.refundAmount).toFixed(2)}). Reason: ${reason}`,
        storeId: store.id,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: `Return request ${createdReturn.returnNumber} submitted! Staff will review shortly.`,
        return: {
          id: createdReturn.id,
          returnNumber: createdReturn.returnNumber,
          saleId: createdReturn.saleId,
          refundAmount: Number(createdReturn.refundAmount),
          refundMethod: createdReturn.refundMethod,
          status: createdReturn.status,
          requestedBy: createdReturn.requestedBy,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/customer/returns error:", error);
    const isClientErr = error?.message?.includes("Cannot return") || error?.message?.includes("does not belong");
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to submit return request" },
      { status: isClientErr ? 400 : 500 }
    );
  }
}
