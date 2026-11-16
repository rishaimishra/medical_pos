import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

/**
 * MODULE 1.10.2: SUPPLIER ACCOUNTS PAYABLE LEDGER & PAYMENTS
 * 
 * Endpoints:
 * - GET: Fetch purchase and payment ledger history for a specific supplier with running balance.
 * - POST: Record a payment made to the supplier (Cheque, NEFT/RTGS, UPI, Cash) updating outstanding balance.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  // Permission Check: Requires manage_purchases or admin/manager/accountant role
  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    auth.session.role !== "accountant" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to view supplier ledger" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const supplierId = parseInt(rawId, 10);
  if (!supplierId || isNaN(supplierId)) {
    return NextResponse.json({ success: false, message: "Invalid supplier ID" }, { status: 400 });
  }

  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        purchaseOrders: {
          orderBy: { poDate: "desc" },
          include: {
            branch: { select: { id: true, code: true, name: true } },
            items: {
              select: {
                id: true,
                quantity: true,
                receivedQty: true,
                price: true,
                mrp: true,
                medicine: { select: { id: true, name: true } },
              },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          include: {
            branch: { select: { id: true, code: true, name: true } },
            creator: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    const totalPurchased = supplier.purchaseOrders
      .filter((po) => po.status !== "cancelled" && po.status !== "draft")
      .reduce((sum, po) => sum + Number(po.total || 0), 0);

    const totalPaid = supplier.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstandingBalance = Math.round((totalPurchased - totalPaid) * 100) / 100;

    // Build Chronological Ledger Entries
    const ledgerEntries: any[] = [];

    // Add Invoices / Purchase Orders
    for (const po of supplier.purchaseOrders) {
      if (po.status === "cancelled" || po.status === "draft") continue;
      ledgerEntries.push({
        type: "purchase",
        id: po.id,
        date: po.poDate,
        docNumber: po.poNumber,
        invoiceNo: po.invoiceNo,
        description: `Purchase Order ${po.poNumber} (${po.status.toUpperCase()})`,
        debit: Number(po.total), // Owed to supplier
        credit: 0,
        status: po.status,
        branch: po.branch,
        createdAt: po.createdAt,
      });
    }

    // Add Payments Made
    for (const p of supplier.payments) {
      ledgerEntries.push({
        type: "payment",
        id: p.id,
        date: p.paymentDate,
        docNumber: p.referenceNo || `PAY-${p.id}`,
        invoiceNo: null,
        description: `Payment via ${p.paymentMethod.toUpperCase()}${p.referenceNo ? ` (Ref: ${p.referenceNo})` : ""}${p.notes ? ` - ${p.notes}` : ""}`,
        debit: 0,
        credit: Number(p.amount), // Paid to supplier
        method: p.paymentMethod,
        referenceNo: p.referenceNo,
        notes: p.notes,
        branch: p.branch,
        creator: p.creator,
        createdAt: p.createdAt,
      });
    }

    // Sort ascending chronologically to compute accurate running balance
    ledgerEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id);
    let running = 0;
    for (const entry of ledgerEntries) {
      running += entry.debit - entry.credit;
      entry.runningBalance = Math.round(running * 100) / 100;
    }

    // Sort descending for delivery so newest appears on top
    ledgerEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id);

    return NextResponse.json({
      success: true,
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contact: supplier.contact,
        phone: supplier.phone,
        email: supplier.email,
        gstNo: supplier.gstNo,
        dlNo: supplier.dlNo,
        paymentTerms: supplier.paymentTerms,
      },
      summary: {
        totalPurchased: Math.round(totalPurchased * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      },
      ledger: ledgerEntries,
      payments: supplier.payments,
      purchaseOrders: supplier.purchaseOrders,
    });
  } catch (error: any) {
    console.error("GET /api/admin/suppliers/[id]/payments error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to load supplier ledger" }, { status: 500 });
  }
}

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
    auth.session.role !== "accountant" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to record payments" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const supplierId = parseInt(rawId, 10);
  if (!supplierId || isNaN(supplierId)) {
    return NextResponse.json({ success: false, message: "Invalid supplier ID" }, { status: 400 });
  }

  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    const body = await req.json();
    const amount = parseFloat(body.amount);
    const paymentMethod = (body.paymentMethod || "bank_transfer").toLowerCase();
    const referenceNo = (body.referenceNo || "").trim() || null;
    const notes = (body.notes || "").trim() || null;
    const paymentDateStr = body.paymentDate || new Date().toISOString().slice(0, 10);
    const branchId = body.branchId ? parseInt(body.branchId, 10) : auth.session.branchId;

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, message: "Payment amount must be greater than zero" }, { status: 400 });
    }

    const validMethods = ["cheque", "neft_rtgs", "upi", "cash", "bank_transfer"];
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json({ success: false, message: `Invalid payment method. Allowed: ${validMethods.join(", ")}` }, { status: 400 });
    }

    const poId = body.poId ? parseInt(body.poId, 10) : undefined;
    const currentUserId = auth.session.userId;
    const payment = await prisma.$transaction(async (tx) => {
      if (poId) {
        const targetPO = await tx.purchaseOrder.findUnique({ where: { id: poId } });
        if (targetPO && targetPO.supplierId === supplierId) {
          const updatedPaid = Math.min(Number(targetPO.total), Number(targetPO.paidAmount || 0) + amount);
          await tx.purchaseOrder.update({
            where: { id: poId },
            data: { paidAmount: updatedPaid },
          });
        }
      }

      return await tx.supplierPayment.create({
        data: {
          supplierId,
          branchId: branchId || null,
          amount,
          paymentDate: new Date(paymentDateStr),
          paymentMethod,
          referenceNo,
          notes,
          createdBy: currentUserId,
        },
        include: {
          branch: { select: { code: true, name: true } },
        },
      });
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: branchId || auth.session.branchId,
      action: "SUPPLIER_PAYMENT_RECORDED",
      entity: "supplier_payment",
      entityId: payment.id,
      details: {
        supplierId,
        supplierName: supplier.name,
        amount,
        paymentMethod,
        referenceNo,
        allocatedPoId: poId,
      },
      ipAddress: getClientIp(req),
    });

    // Compute updated balances
    const allPurchases = await prisma.purchaseOrder.findMany({
      where: {
        supplierId,
        status: { notIn: ["cancelled", "draft"] },
      },
      select: { total: true },
    });
    const allPayments = await prisma.supplierPayment.findMany({
      where: { supplierId },
      select: { amount: true },
    });

    const totalPurchased = allPurchases.reduce((sum, po) => sum + Number(po.total || 0), 0);
    const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const outstandingBalance = Math.round((totalPurchased - totalPaid) * 100) / 100;

    return NextResponse.json({
      success: true,
      message: `Payment of ₹${amount.toFixed(2)} recorded for '${supplier.name}'`,
      payment,
      updatedBalance: {
        totalPurchased: Math.round(totalPurchased * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error("POST /api/admin/suppliers/[id]/payments error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to record payment" }, { status: 500 });
  }
}
