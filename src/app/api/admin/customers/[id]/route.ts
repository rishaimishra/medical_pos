import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

/**
 * MODULE 1.13.1 & 1.13.3: CUSTOMER PROFILE & CRUD
 * 
 * - GET: Full profile with purchase history, credit status, and health info.
 * - PUT: Update master fields, chronic tags, and credit limits.
 * - DELETE: Delete guard preventing deletion of customers with sales or active credit balances.
 */

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
    return NextResponse.json({ success: false, message: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          orderBy: { saleDate: "desc" },
          take: 15,
          include: {
            branch: { select: { id: true, code: true, name: true } },
            items: {
              include: {
                medicine: { select: { id: true, name: true, category: true } },
              },
            },
          },
        },
        payments: {
          orderBy: { paymentDate: "desc" },
          take: 15,
          include: {
            creator: { select: { id: true, name: true, username: true } },
          },
        },
        patientMessages: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    // Compute financial aggregates across all sales and payments
    const [allSales, allPayments] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: id },
        select: { grandTotal: true, paymentMethod: true },
      }),
      prisma.customerPayment.findMany({
        where: { customerId: id },
        select: { amount: true },
      }),
    ]);

    const totalPurchased = allSales.reduce((sum, s) => sum + Number(s.grandTotal), 0);
    const totalCreditSales = allSales
      .filter((s) => s.paymentMethod === "credit")
      .reduce((sum, s) => sum + Number(s.grandTotal), 0);
    const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstandingDue = Math.max(0, Math.round((totalCreditSales - totalPaid) * 100) / 100);
    const availableCredit = Math.max(0, Number(customer.creditLimit) - outstandingDue);

    let daysToRefill: number | null = null;
    if (customer.isChronic && customer.nextRefillDate) {
      const today = new Date().setHours(0, 0, 0, 0);
      const refDate = new Date(customer.nextRefillDate).setHours(0, 0, 0, 0);
      daysToRefill = Math.ceil((refDate - today) / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      success: true,
      customer: {
        ...customer,
        creditLimit: Number(customer.creditLimit),
        financials: {
          totalPurchased: Math.round(totalPurchased * 100) / 100,
          totalCreditSales: Math.round(totalCreditSales * 100) / 100,
          totalPaid: Math.round(totalPaid * 100) / 100,
          outstandingDue,
          availableCredit: Math.round(availableCredit * 100) / 100,
        },
        daysToRefill,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/customers/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch customer profile" }, { status: 500 });
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

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    const body = await req.json();
    const name = body.name !== undefined ? (body.name || "").trim() : existing.name;
    const phone = body.phone !== undefined ? (body.phone || "").replace(/\s+/g, "").trim() : existing.phone;
    const email = body.email !== undefined ? ((body.email || "").toLowerCase().trim() || null) : existing.email;
    const address = body.address !== undefined ? ((body.address || "").trim() || null) : existing.address;
    const gender = body.gender !== undefined ? ((body.gender || "").trim().toLowerCase() || null) : existing.gender;
    const medicalNotes = body.medicalNotes !== undefined ? ((body.medicalNotes || "").trim() || null) : existing.medicalNotes;
    const isChronic = body.isChronic !== undefined ? Boolean(body.isChronic) : existing.isChronic;
    const chronicDiseases = body.chronicDiseases !== undefined ? ((body.chronicDiseases || "").trim() || null) : existing.chronicDiseases;
    const refillDays = body.refillDays !== undefined ? (parseInt(body.refillDays, 10) || null) : existing.refillDays;
    const creditLimit = body.creditLimit !== undefined ? Math.max(0, parseFloat(body.creditLimit) || 0) : existing.creditLimit;
    const active = body.active !== undefined ? Boolean(body.active) : existing.active;

    if (!name) {
      return NextResponse.json({ success: false, message: "Full Name cannot be empty" }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ success: false, message: "Phone number cannot be empty" }, { status: 400 });
    }

    // Check unique phone collision
    if (phone !== existing.phone) {
      const phoneTaken = await prisma.customer.findUnique({ where: { phone } });
      if (phoneTaken && phoneTaken.id !== id) {
        return NextResponse.json({ success: false, message: `Phone number ${phone} is already used by ${phoneTaken.name}` }, { status: 400 });
      }
    }

    // Check unique email collision
    if (email && email !== existing.email) {
      const emailTaken = await prisma.customer.findUnique({ where: { email } });
      if (emailTaken && emailTaken.id !== id) {
        return NextResponse.json({ success: false, message: `Email ${email} is already in use.` }, { status: 400 });
      }
    }

    let dob: Date | null = existing.dob;
    if (body.dob !== undefined) {
      dob = body.dob ? new Date(body.dob) : null;
    } else if (body.age && !isNaN(parseInt(body.age, 10))) {
      const birthYear = new Date().getFullYear() - parseInt(body.age, 10);
      dob = new Date(`${birthYear}-01-01T00:00:00.000Z`);
    }

    let nextRefillDate: Date | null = existing.nextRefillDate;
    if (body.nextRefillDate !== undefined) {
      nextRefillDate = body.nextRefillDate ? new Date(body.nextRefillDate) : null;
    } else if (isChronic && !existing.nextRefillDate && refillDays) {
      const refDate = new Date();
      refDate.setDate(refDate.getDate() + refillDays);
      nextRefillDate = refDate;
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name,
        phone,
        email,
        address,
        dob,
        gender,
        medicalNotes,
        isChronic,
        chronicDiseases: isChronic ? chronicDiseases : null,
        refillDays: isChronic ? refillDays : null,
        nextRefillDate: isChronic ? nextRefillDate : null,
        creditLimit,
        active,
      },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "CUSTOMER_UPDATED",
      entity: "customer",
      entityId: id,
      details: {
        name: updated.name,
        phone: updated.phone,
        isChronic: updated.isChronic,
        creditLimit: updated.creditLimit,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Customer ${updated.name} updated successfully`,
      customer: updated,
    });
  } catch (error: any) {
    console.error("PUT /api/admin/customers/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update customer" }, { status: 500 });
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

  if (auth.session.role !== "admin" && !hasPermission(auth.session, "manage_customers")) {
    return NextResponse.json({ success: false, message: "Forbidden: Admin privileges required to delete customer" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid customer ID" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        _count: { select: { sales: true } },
        sales: {
          where: { paymentMethod: "credit" },
          select: { grandTotal: true },
        },
        payments: { select: { amount: true } },
      },
    });

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    // Delete Guard: Cannot delete if sales exist or has unpaid credit balance
    if (customer._count.sales > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete patient '${customer.name}' because they have ${customer._count.sales} historical sales/invoice records. You can deactivate the customer instead.`,
        },
        { status: 400 }
      );
    }

    const totalCredit = customer.sales.reduce((sum, s) => sum + Number(s.grandTotal), 0);
    const totalPaid = customer.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const outstanding = totalCredit - totalPaid;

    if (outstanding > 0.01) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete patient '${customer.name}' because they have an unsettled outstanding balance of ₹${outstanding.toFixed(2)}.`,
        },
        { status: 400 }
      );
    }

    await prisma.customer.delete({ where: { id } });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "CUSTOMER_DELETED",
      entity: "customer",
      entityId: id,
      details: { name: customer.name, phone: customer.phone },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Customer ${customer.name} deleted successfully`,
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/customers/[id] error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete customer" }, { status: 500 });
  }
}
