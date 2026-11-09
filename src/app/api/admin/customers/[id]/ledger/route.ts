import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

/**
 * MODULE 1.13.3: CUSTOMER BAKI KHATA & CREDIT LEDGER
 * 
 * - GET: Chronological credit statement (debits: credit sales, credits: settlement payments) with running balance.
 * - POST: Record a customer credit payment settlement, reducing outstanding due.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true, creditLimit: true },
    });

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    // 1. Fetch all credit sales
    const creditSales = await prisma.sale.findMany({
      where: { customerId: id, paymentMethod: "credit" },
      orderBy: { saleDate: "asc" },
      include: {
        branch: { select: { code: true, name: true } },
      },
    });

    // 2. Fetch all payment settlements
    const payments = await prisma.customerPayment.findMany({
      where: { customerId: id },
      orderBy: { paymentDate: "asc" },
      include: {
        creator: { select: { name: true, username: true } },
        sale: { select: { invoiceNo: true } },
      },
    });

    // 3. Merge into unified chronological ledger
    interface LedgerEntry {
      id: string;
      date: string;
      type: "sale" | "payment";
      description: string;
      referenceNo?: string | null;
      paymentMethod?: string | null;
      debit: number;  // Increases due (sale)
      credit: number; // Decreases due (payment)
      runningBalance: number;
    }

    const rawEntries: Array<{
      id: string;
      date: Date;
      type: "sale" | "payment";
      description: string;
      referenceNo?: string | null;
      paymentMethod?: string | null;
      amount: number;
    }> = [];

    for (const s of creditSales) {
      rawEntries.push({
        id: `sale-${s.id}`,
        date: new Date(s.saleDate),
        type: "sale",
        description: `Credit Sale Invoice ${s.invoiceNo}${s.branch ? ` (${s.branch.code})` : ""}`,
        referenceNo: s.invoiceNo,
        amount: Number(s.grandTotal),
      });
    }

    for (const p of payments) {
      rawEntries.push({
        id: `pay-${p.id}`,
        date: new Date(p.paymentDate),
        type: "payment",
        description: p.notes || `Credit Settlement (${p.paymentMethod.toUpperCase()})${p.sale ? ` against ${p.sale.invoiceNo}` : ""}`,
        referenceNo: p.referenceNo,
        paymentMethod: p.paymentMethod,
        amount: Number(p.amount),
      });
    }

    // Sort chronologically ascending with secondary sort key: sales before payments on same date
    rawEntries.sort((a, b) => {
      const timeDiff = a.date.getTime() - b.date.getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.type !== b.type) return a.type === "sale" ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    let runningBalance = 0;
    const ledger: LedgerEntry[] = [];

    for (const entry of rawEntries) {
      if (entry.type === "sale") {
        runningBalance += entry.amount;
        ledger.push({
          id: entry.id,
          date: entry.date.toISOString().slice(0, 10),
          type: "sale",
          description: entry.description,
          referenceNo: entry.referenceNo,
          debit: entry.amount,
          credit: 0,
          runningBalance: Math.round(runningBalance * 100) / 100,
        });
      } else {
        runningBalance -= entry.amount;
        ledger.push({
          id: entry.id,
          date: entry.date.toISOString().slice(0, 10),
          type: "payment",
          description: entry.description,
          referenceNo: entry.referenceNo,
          paymentMethod: entry.paymentMethod,
          debit: 0,
          credit: entry.amount,
          runningBalance: Math.round(runningBalance * 100) / 100,
        });
      }
    }

    const totalDebit = creditSales.reduce((sum, s) => sum + Number(s.grandTotal), 0);
    const totalCredit = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const currentDue = Math.max(0, Math.round((totalDebit - totalCredit) * 100) / 100);
    const creditLimit = Number(customer.creditLimit);
    const availableCredit = Math.max(0, Math.round((creditLimit - currentDue) * 100) / 100);

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        creditLimit,
      },
      summary: {
        creditLimit,
        totalCreditSales: Math.round(totalDebit * 100) / 100,
        totalSettled: Math.round(totalCredit * 100) / 100,
        currentDue,
        availableCredit,
        isOverLimit: currentDue > creditLimit && creditLimit > 0,
      },
      ledger,
    });
  } catch (error: any) {
    console.error("GET /api/admin/customers/[id]/ledger error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch ledger" }, { status: 500 });
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

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    const body = await req.json();
    const amount = parseFloat(body.amount);
    const paymentMethod = (body.paymentMethod || "cash").toLowerCase();
    const paymentDateStr = body.paymentDate || new Date().toISOString().slice(0, 10);
    const referenceNo = (body.referenceNo || "").trim() || null;
    const notes = (body.notes || "").trim() || null;
    const saleId = body.saleId ? parseInt(body.saleId, 10) : null;
    const branchId = body.branchId ? parseInt(body.branchId, 10) : auth.session.branchId;

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, message: "Payment amount must be greater than zero" }, { status: 400 });
    }

    const validMethods = ["cash", "upi", "card", "bank_transfer", "cheque"];
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json({ success: false, message: `Invalid payment method: ${paymentMethod}` }, { status: 400 });
    }

    // Verify saleId if provided
    if (saleId) {
      const sale = await prisma.sale.findUnique({ where: { id: saleId } });
      if (!sale || sale.customerId !== id) {
        return NextResponse.json({ success: false, message: "Referenced invoice does not belong to this customer" }, { status: 400 });
      }
    }

    const payment = await prisma.customerPayment.create({
      data: {
        customerId: id,
        saleId,
        amount,
        paymentDate: new Date(paymentDateStr),
        paymentMethod,
        referenceNo,
        notes,
        branchId,
        createdBy: auth.session.userId,
      },
      include: {
        customer: { select: { name: true, phone: true } },
        creator: { select: { name: true } },
      },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId,
      action: "CUSTOMER_CREDIT_SETTLED",
      entity: "customer_payment",
      entityId: payment.id,
      details: {
        customerId: id,
        customerName: customer.name,
        amount,
        paymentMethod,
        referenceNo,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Settlement of ₹${amount.toFixed(2)} received from ${customer.name} via ${paymentMethod.toUpperCase()}`,
      payment,
    });
  } catch (error: any) {
    console.error("POST /api/admin/customers/[id]/ledger error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to record payment" }, { status: 500 });
  }
}
