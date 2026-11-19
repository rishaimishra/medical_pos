import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { requireStoreFeature } from "@/lib/entitlements";

/**
 * MODULE 2.10 & 2.11: SALES RETURNS, RESTOCKING & REFUND ENGINE
 *
 * GET /api/admin/returns - Lists past returns with filters
 * POST /api/admin/returns - Atomically processes a return with already-returned guard & restock/write-off
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
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const status = (searchParams.get("status") || "all").toLowerCase();
  const branchParam = searchParams.get("branchId");
  const startDateStr = searchParams.get("startDate");
  const endDateStr = searchParams.get("endDate");

  const effectiveBranchId = auth.session.branchId
    ? auth.session.branchId
    : branchParam && branchParam !== "all"
      ? parseInt(branchParam, 10)
      : null;

  if (effectiveBranchId && !canAccessBranch(auth.session, effectiveBranchId)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Unauthorized branch access" },
      { status: 403 }
    );
  }

  try {
    const where: any = {};

    if (effectiveBranchId) {
      where.branchId = effectiveBranchId;
    } else if (auth.session.storeId) {
      where.branch = { storeId: auth.session.storeId };
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (startDateStr || endDateStr) {
      where.createdAt = {};
      if (startDateStr) where.createdAt.gte = new Date(startDateStr);
      if (endDateStr) {
        const endD = new Date(endDateStr);
        endD.setHours(23, 59, 59, 999);
        where.createdAt.lte = endD;
      }
    }

    if (search) {
      where.OR = [
        { returnNumber: { contains: search, mode: "insensitive" } },
        { sale: { invoiceNo: { contains: search, mode: "insensitive" } } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search, mode: "insensitive" } } },
        { reason: { contains: search, mode: "insensitive" } },
      ];
    }

    const [totalCount, returnsList, allReturns] = await Promise.all([
      prisma.return.count({ where }),
      prisma.return.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          sale: {
            select: { id: true, invoiceNo: true, saleDate: true, grandTotal: true },
          },
          customer: {
            select: { id: true, name: true, phone: true },
          },
          branch: {
            select: { id: true, name: true, code: true },
          },
          items: {
            include: {
              medicine: { select: { id: true, name: true, genericName: true } },
              batch: { select: { id: true, batchNo: true } },
            },
          },
        },
      }),
      prisma.return.findMany({
        where,
        select: { refundAmount: true },
      }),
    ]);

    const totalRefunded = allReturns.reduce((sum, r) => sum + Number(r.refundAmount || 0), 0);

    const formattedReturns = returnsList.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber,
      invoiceNo: r.sale.invoiceNo,
      saleId: r.sale.id,
      refundAmount: Number(r.refundAmount),
      refundMethod: r.refundMethod || "cash",
      reason: r.reason,
      status: r.status,
      stockAdjusted: r.stockAdjusted,
      requestedBy: r.requestedBy,
      createdAt: r.createdAt,
      processedAt: r.processedAt,
      customer: r.customer,
      branch: r.branch,
      itemsCount: r.items.reduce((sum, it) => sum + it.quantity, 0),
      items: r.items.map((it) => ({
        id: it.id,
        medicineName: it.medicine?.name || "Medicine",
        genericName: it.medicine?.genericName || "",
        batchNo: it.batch?.batchNo || "-",
        quantity: it.quantity,
        refundPrice: Number(it.price),
        restockAction: it.restockAction,
      })),
    }));

    return NextResponse.json({
      success: true,
      data: formattedReturns,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
      summary: {
        totalReturns: totalCount,
        totalRefundAmount: Number(totalRefunded.toFixed(2)),
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/returns error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load returns list" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json(
      { success: false, message: auth.message || "Unauthorized" },
      { status: auth.status }
    );
  }

  if (!canAccessPage(auth.session, "/admin/returns")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to process sales returns denied" },
      { status: 403 }
    );
  }

  const currentUserId = auth.session.userId;
  const currentStoreId = auth.session.storeId;
  const currentBranchId = auth.session.branchId;

  const retGate = await requireStoreFeature(currentStoreId, "salesAndReturnsCore");
  if (!retGate.allowed) return retGate.response!;

  try {
    const body = await req.json();
    const saleId = parseInt(body.saleId, 10);
    const reason = String(body.reason || "").trim() || "Customer returned medicine";
    const refundMethod = (body.refundMethod || "cash").toLowerCase(); // cash, store_credit, upi
    const requestedStatus = String(body.status || "processed").toLowerCase() === "pending" ? "pending" : "processed";
    const rawItems: Array<{
      saleItemId: number;
      quantity: number;
      restockAction?: "restock" | "damaged_write_off";
    }> = Array.isArray(body.items) ? body.items : [];

    if (!["cash", "upi", "store_credit"].includes(refundMethod)) {
      return NextResponse.json(
        { success: false, message: `Unsupported refund method: '${refundMethod}'` },
        { status: 400 }
      );
    }

    if (!saleId || isNaN(saleId)) {
      return NextResponse.json({ success: false, message: "Valid Sale ID is required" }, { status: 400 });
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { success: false, message: "Please select at least one item to return" },
        { status: 400 }
      );
    }

    // Filter valid positive integer quantity items and merge identical (saleItemId, restockAction) rows
    const mergedByKey = new Map<
      string,
      { saleItemId: number; quantity: number; restockAction: "restock" | "damaged_write_off" }
    >();
    for (const raw of rawItems) {
      const qty = Number(raw.quantity);
      const sItemId = parseInt(String(raw.saleItemId), 10);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isInteger(qty) || !sItemId || isNaN(sItemId)) {
        return NextResponse.json(
          { success: false, message: "Invalid saleItemId or fractional return quantity" },
          { status: 400 }
        );
      }
      const action: "restock" | "damaged_write_off" =
        raw.restockAction === "damaged_write_off" ? "damaged_write_off" : "restock";
      const key = `${sItemId}|${action}`;
      const existing = mergedByKey.get(key);
      if (existing) {
        existing.quantity += qty;
      } else {
        mergedByKey.set(key, { saleItemId: sItemId, quantity: qty, restockAction: action });
      }
    }

    const returnItemsToProcess = Array.from(mergedByKey.values());
    if (returnItemsToProcess.length === 0) {
      return NextResponse.json(
        { success: false, message: "Return quantity must be greater than zero" },
        { status: 400 }
      );
    }

    // Atomic Database Transaction with advisory lock & store isolation
    const result = await runInTransaction(async (tx) => {
      // 1. Fetch Sale with items and existing returns
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              batch: { select: { id: true, quantity: true } },
              returnItems: {
                select: {
                  quantity: true,
                  returnReturn: { select: { status: true } },
                },
              },
            },
          },
          customer: true,
          branch: { select: { id: true, storeId: true, code: true, name: true } },
        },
      });

      if (!sale) {
        throw new Error("Sale invoice not found");
      }

      // Multi-Tenant & Branch isolation check
      if (currentStoreId && sale.branch?.storeId && sale.branch.storeId !== currentStoreId) {
        throw new Error("Forbidden: Cannot process returns for another store");
      }
      if (sale.branchId && !canAccessBranch(auth.session, sale.branchId)) {
        throw new Error("Forbidden: Cannot process returns for another branch");
      }

      if (refundMethod === "store_credit" && !sale.customerId) {
        throw new Error("Registered customer account is required for Store Credit / Baki Khata refund");
      }

      // 2. Validate Module 2.11.2 (Already-Returned Guard aggregating duplicate saleItemIds) & compute bill-discount proportion
      const itemsSubtotal = sale.items.reduce((sum, si) => sum + Number(si.price), 0);
      const billPayableRatio =
        itemsSubtotal > 0 ? Math.max(0, Math.min(1, Number(sale.grandTotal) / itemsSubtotal)) : 1;

      const requestedQtyPerSaleItem = new Map<number, number>();
      let totalRefundCalculated = 0;
      const validatedReturnItems: Array<{
        saleItemId: number;
        medicineId: number;
        batchId: number;
        quantity: number;
        lineRefundPrice: number;
        restockAction: "restock" | "damaged_write_off";
      }> = [];

      for (const reqItem of returnItemsToProcess) {
        const saleItem = sale.items.find((si) => si.id === reqItem.saleItemId);
        if (!saleItem) {
          throw new Error(`Sale item ID ${reqItem.saleItemId} does not belong to invoice ${sale.invoiceNo}`);
        }

        const alreadyReturned = saleItem.returnItems
          .filter((ri) => ri.returnReturn.status !== "rejected")
          .reduce((sum, ri) => sum + ri.quantity, 0);

        const prevRequested = requestedQtyPerSaleItem.get(saleItem.id) || 0;
        const cumulativeRequested = prevRequested + reqItem.quantity;
        const remainingReturnable = saleItem.quantity - alreadyReturned;

        if (cumulativeRequested > remainingReturnable) {
          throw new Error(
            `Cannot return ${cumulativeRequested} units for item ID ${saleItem.id}. Only ${Math.max(0, remainingReturnable)} units remain returnable (Purchased: ${saleItem.quantity}, Already Returned: ${alreadyReturned}).`
          );
        }
        requestedQtyPerSaleItem.set(saleItem.id, cumulativeRequested);

        // Module 2.11.3: Discount-Proportional Refund (based on net line price after item discount, scaled by bill payable ratio)
        const lineNetAfterAllDiscounts = Number(saleItem.price) * billPayableRatio;
        const itemRefundTotal = Number(
          ((lineNetAfterAllDiscounts * reqItem.quantity) / saleItem.quantity).toFixed(2)
        );

        totalRefundCalculated += itemRefundTotal;

        validatedReturnItems.push({
          saleItemId: saleItem.id,
          medicineId: saleItem.medicineId,
          batchId: saleItem.batchId,
          quantity: reqItem.quantity,
          lineRefundPrice: itemRefundTotal,
          restockAction: reqItem.restockAction,
        });
      }

      totalRefundCalculated = Math.min(Number(sale.grandTotal), Number(totalRefundCalculated.toFixed(2)));

      // 3. Concurrency-safe sequential Return Number (RET-YYYY-XXXXX)
      const year = new Date().getFullYear();
      const retPrefix = `RET-${year}-`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026002)`;
      const lastRet = await tx.return.findFirst({
        where: { returnNumber: { startsWith: retPrefix } },
        orderBy: { id: "desc" },
        select: { returnNumber: true },
      });
      let nextRetSeq = 1;
      if (lastRet?.returnNumber) {
        const parts = lastRet.returnNumber.split("-");
        const parsed = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(parsed)) nextRetSeq = parsed + 1;
      }
      const returnNumber = `${retPrefix}${String(nextRetSeq).padStart(5, "0")}`;

      // 4. Create Return Master Record
      const newReturn = await tx.return.create({
        data: {
          returnNumber,
          saleId: sale.id,
          customerId: sale.customerId,
          branchId: sale.branchId,
          reason,
          refundAmount: totalRefundCalculated,
          refundMethod,
          status: requestedStatus,
          stockAdjusted: requestedStatus === "processed",
          requestedBy: "staff",
          createdBy: currentUserId,
          processedAt: requestedStatus === "processed" ? new Date() : null,
        },
      });

      // 5. Create Return Line Items & Apply Restock vs Discard Workflow if immediately processed
      for (const item of validatedReturnItems) {
        await tx.returnItem.create({
          data: {
            returnId: newReturn.id,
            saleItemId: item.saleItemId,
            medicineId: item.medicineId,
            batchId: item.batchId,
            quantity: item.quantity,
            price: item.lineRefundPrice,
            restockAction: item.restockAction,
          },
        });

        if (requestedStatus === "processed") {
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
                branchId: sale.branchId,
                type: "return",
                quantity: item.quantity,
                reason: `Sales Return ${returnNumber} Restocked`,
                oldQty,
                newQty: oldQty + item.quantity,
                userId: currentUserId,
              },
            });
          } else {
            await tx.stockAdjustment.create({
              data: {
                batchId: item.batchId,
                medicineId: item.medicineId,
                branchId: sale.branchId,
                type: "remove",
                quantity: item.quantity,
                reason: `Sales Return ${returnNumber} Damaged/Expired Write-Off`,
                oldQty,
                newQty: oldQty,
                userId: currentUserId,
              },
            });
          }
        }
      }

      // 6. If refund goes to Store Credit / Baki Khata and return is processed, credit customer ledger
      if (requestedStatus === "processed" && refundMethod === "store_credit" && sale.customerId && totalRefundCalculated > 0) {
        await tx.customerPayment.create({
          data: {
            customerId: sale.customerId,
            saleId: sale.id,
            amount: totalRefundCalculated,
            paymentMethod: "store_credit",
            referenceNo: returnNumber,
            notes: `Sales Return Store Credit (${returnNumber} vs ${sale.invoiceNo})`,
            branchId: sale.branchId,
            createdBy: currentUserId,
          },
        });
      }

      return {
        returnRecord: newReturn,
        totalRefundAmount: totalRefundCalculated,
        refundMethod,
        itemsCount: validatedReturnItems.length,
      };
    });

    // 7. Audit Log
    await logAudit({
      storeId: currentStoreId,
      action: requestedStatus === "processed" ? "RETURN_PROCESSED" : "RETURN_REQUESTED",
      entity: "Return",
      entityId: result.returnRecord.id,
      userId: currentUserId,
      branchId: currentBranchId || undefined,
      details: {
        returnNumber: result.returnRecord.returnNumber,
        saleId,
        status: requestedStatus,
        refundAmount: result.totalRefundAmount,
        refundMethod: result.refundMethod,
        itemsCount: result.itemsCount,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        requestedStatus === "processed"
          ? `Return ${result.returnRecord.returnNumber} processed successfully. Refund: ₹${result.totalRefundAmount.toFixed(2)} (${result.refundMethod.toUpperCase()})`
          : `Return ${result.returnRecord.returnNumber} created with status 'pending' awaiting approval.`,
      return: result.returnRecord,
    });
  } catch (error: any) {
    console.error("POST /api/admin/returns error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to process sales return" },
      { status: 400 }
    );
  }
}
