import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

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

  try {
    const body = await req.json();
    const saleId = parseInt(body.saleId, 10);
    const reason = String(body.reason || "").trim() || "Customer returned medicine";
    const refundMethod = (body.refundMethod || "cash").toLowerCase(); // cash, store_credit, upi
    const rawItems: Array<{
      saleItemId: number;
      quantity: number;
      restockAction?: "restock" | "damaged_write_off";
    }> = Array.isArray(body.items) ? body.items : [];

    if (!saleId || isNaN(saleId)) {
      return NextResponse.json({ success: false, message: "Valid Sale ID is required" }, { status: 400 });
    }

    if (rawItems.length === 0) {
      return NextResponse.json(
        { success: false, message: "Please select at least one item to return" },
        { status: 400 }
      );
    }

    // Filter valid positive quantity items
    const returnItemsToProcess = rawItems.filter((i) => i.quantity > 0);
    if (returnItemsToProcess.length === 0) {
      return NextResponse.json(
        { success: false, message: "Return quantity must be greater than zero" },
        { status: 400 }
      );
    }

    // Atomic Database Transaction with custom timeout for remote DB pools
    const result = await prisma.$transaction(
      async (tx) => {
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
            branch: true,
          },
        });

        if (!sale) {
          throw new Error("Sale invoice not found");
        }

        // Branch isolation check
        if (sale.branchId && !canAccessBranch(auth.session, sale.branchId)) {
          throw new Error("Forbidden: Cannot process returns for another branch");
        }

        // 2. Validate Module 2.11.2 (Already-Returned Guard) & compute discount proportion
        const saleTotal = Number(sale.totalAmount);
        const saleDiscount = Number(sale.discountAmount);
        const discountRatio = saleTotal > 0 ? saleDiscount / saleTotal : 0;

        let totalRefundCalculated = 0;
        const validatedReturnItems: Array<{
          saleItemId: number;
          medicineId: number;
          batchId: number;
          batchQty: number;
          quantity: number;
          lineRefundPrice: number;
          restockAction: "restock" | "damaged_write_off";
        }> = [];

        for (const reqItem of returnItemsToProcess) {
          const saleItem = sale.items.find((si) => si.id === reqItem.saleItemId);
          if (!saleItem) {
            throw new Error(`Sale item ID ${reqItem.saleItemId} does not belong to invoice ${sale.invoiceNo}`);
          }

          // Calculate already returned
          const alreadyReturned = saleItem.returnItems
            .filter((ri) => ri.returnReturn.status !== "rejected")
            .reduce((sum, ri) => sum + ri.quantity, 0);

          const remainingReturnable = saleItem.quantity - alreadyReturned;

          if (reqItem.quantity > remainingReturnable) {
            throw new Error(
              `Cannot return ${reqItem.quantity} units for item ID ${saleItem.id}. Only ${remainingReturnable} units remain returnable (Purchased: ${saleItem.quantity}, Already Returned: ${alreadyReturned}).`
            );
          }

          // Module 2.11.3: Discount-Proportional Refund
          const lineGrossUnit = Number(saleItem.price) / saleItem.quantity;
          const lineNetUnit = lineGrossUnit * (1 - discountRatio);
          const itemRefundTotal = Number((lineNetUnit * reqItem.quantity).toFixed(2));

          totalRefundCalculated += itemRefundTotal;

          validatedReturnItems.push({
            saleItemId: saleItem.id,
            medicineId: saleItem.medicineId,
            batchId: saleItem.batchId,
            batchQty: saleItem.batch.quantity,
            quantity: reqItem.quantity,
            lineRefundPrice: itemRefundTotal,
            restockAction: reqItem.restockAction === "damaged_write_off" ? "damaged_write_off" : "restock",
          });
        }

        totalRefundCalculated = Number(totalRefundCalculated.toFixed(2));

        // 3. Generate unique Return Number (e.g. RET-2026-00001)
        const year = new Date().getFullYear();
        const returnCount = await tx.return.count();
        const returnNumber = `RET-${year}-${String(returnCount + 1).padStart(5, "0")}`;

        // 4. Create Return Master Record
        const newReturn = await tx.return.create({
          data: {
            returnNumber,
            saleId: sale.id,
            customerId: sale.customerId,
            branchId: sale.branchId,
            reason,
            refundAmount: totalRefundCalculated,
            status: "processed",
            stockAdjusted: true,
            requestedBy: "staff",
            createdBy: currentUserId,
            processedAt: new Date(),
          },
        });

        // 5. Create Return Line Items & Apply Restock vs Discard Workflow (Module 2.10.2 & 2.11.4)
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

          const oldQty = item.batchQty;

          if (item.restockAction === "restock") {
            // Add back to active salable inventory
            await tx.batch.update({
              where: { id: item.batchId },
              data: {
                quantity: { increment: item.quantity },
              },
            });

            // Create stock adjustment audit record
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
            // Damaged or expired write-off (do not increase salable stock)
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

        return {
          returnRecord: newReturn,
          totalRefundAmount: totalRefundCalculated,
          refundMethod,
          itemsCount: validatedReturnItems.length,
        };
      },
      { maxWait: 15000, timeout: 30000 }
    );

    // 6. Audit Log
    await logAudit({
      storeId: currentStoreId,
      action: "RETURN_PROCESSED",
      entity: "Return",
      entityId: result.returnRecord.id,
      userId: currentUserId,
      branchId: currentBranchId || undefined,
      details: {
        returnNumber: result.returnRecord.returnNumber,
        saleId,
        refundAmount: result.totalRefundAmount,
        refundMethod: result.refundMethod,
        itemsCount: result.itemsCount,
        reason,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Return ${result.returnRecord.returnNumber} processed successfully. Refund: ₹${result.totalRefundAmount.toFixed(2)} (${result.refundMethod.toUpperCase()})`,
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
