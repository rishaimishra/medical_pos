import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { sendCustomerRefillAlertEmail } from "@/lib/email";

/**
 * MODULE 1.13.2: CHRONIC PATIENT MEDICINE REFILL TRACKER
 * 
 * - GET: List chronic patients with upcoming or overdue medicine refills.
 * - POST: Dispatch automated reminder alerts (email / SMS / WhatsApp log) and optionally advance refill cycle.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const daysAhead = parseInt(searchParams.get("days") || "7", 10);
  const statusFilter = (searchParams.get("status") || "all").toLowerCase(); // "all" | "overdue" | "upcoming"
  const search = (searchParams.get("search") || "").trim();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + daysAhead);

    const whereClause: any = {
      isChronic: true,
      nextRefillDate: { not: null },
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { chronicDiseases: { contains: search, mode: "insensitive" } },
      ];
    }

    if (statusFilter === "overdue") {
      whereClause.nextRefillDate = { lt: today };
    } else if (statusFilter === "upcoming") {
      whereClause.nextRefillDate = { gte: today, lte: cutoff };
    } else {
      // "all" due up to cutoff
      whereClause.nextRefillDate = { lte: cutoff };
    }

    const chronicPatients = await prisma.customer.findMany({
      where: whereClause,
      orderBy: { nextRefillDate: "asc" },
      include: {
        sales: {
          take: 1,
          orderBy: { saleDate: "desc" },
          select: {
            id: true,
            invoiceNo: true,
            saleDate: true,
            grandTotal: true,
            items: {
              take: 3,
              select: { medicine: { select: { name: true } } },
            },
          },
        },
      },
    });

    const refillList = chronicPatients.map((p) => {
      const refDate = new Date(p.nextRefillDate!);
      refDate.setHours(0, 0, 0, 0);
      const diffMs = refDate.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const isOverdue = diffDays < 0;

      const recentMeds = p.sales[0]?.items.map((i) => i.medicine.name) || [];

      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        chronicDiseases: p.chronicDiseases,
        refillDays: p.refillDays || 30,
        nextRefillDate: p.nextRefillDate ? new Date(p.nextRefillDate).toISOString().slice(0, 10) : null,
        lastRefillDate: p.lastRefillDate ? new Date(p.lastRefillDate).toISOString().slice(0, 10) : null,
        diffDays,
        isOverdue,
        statusText: isOverdue ? `${Math.abs(diffDays)} days overdue` : diffDays === 0 ? "Due today" : `Due in ${diffDays} days`,
        recentMedicines: recentMeds,
        lastPurchaseDate: p.sales[0]?.saleDate || null,
        lastInvoiceNo: p.sales[0]?.invoiceNo || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: refillList.length,
      daysAhead,
      refills: refillList,
    });
  } catch (error: any) {
    console.error("GET /api/admin/customers/refills error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch refills" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const customerId = parseInt(body.customerId, 10);
    const channel = (body.channel || "email").toLowerCase(); // email | sms | whatsapp
    const advanceCycle = Boolean(body.advanceCycle);

    if (!customerId || isNaN(customerId)) {
      return NextResponse.json({ success: false, message: "Customer ID is required" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    }

    if (!customer.isChronic) {
      return NextResponse.json({ success: false, message: "Patient is not marked as a chronic prescription refill recipient" }, { status: 400 });
    }

    const settings = await prisma.settings.findFirst();
    const storeName = settings?.storeName || "Medical POS Pharmacy";
    const storePhone = settings?.storePhone || "";
    const storeAddress = settings?.storeAddress || "";

    const dateStr = customer.nextRefillDate
      ? new Date(customer.nextRefillDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "Upcoming";

    let emailResult: any = null;

    if (channel === "email") {
      if (!customer.email) {
        return NextResponse.json({ success: false, message: `Patient '${customer.name}' does not have an email address on file.` }, { status: 400 });
      }

      emailResult = await sendCustomerRefillAlertEmail({
        customerEmail: customer.email,
        customerName: customer.name,
        conditions: customer.chronicDiseases || undefined,
        refillDays: customer.refillDays || undefined,
        nextRefillDate: dateStr,
        storeName,
        storePhone,
        storeAddress,
      });
    }

    // If advanceCycle is requested, advance nextRefillDate by refillDays (default 30) from today
    let updatedNextRefill = customer.nextRefillDate;
    if (advanceCycle) {
      const cycleDays = customer.refillDays || 30;
      const today = new Date();
      const newNext = new Date();
      newNext.setDate(today.getDate() + cycleDays);

      await prisma.customer.update({
        where: { id: customerId },
        data: {
          lastRefillDate: today,
          nextRefillDate: newNext,
          refillDays: cycleDays,
        },
      });
      updatedNextRefill = newNext;
    }

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "REFILL_REMINDER_SENT",
      entity: "customer",
      entityId: customerId,
      details: {
        customerName: customer.name,
        channel,
        phone: customer.phone,
        email: customer.email,
        advanceCycle,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Refill reminder dispatched to ${customer.name} via ${channel.toUpperCase()}`,
      channel,
      emailResult,
      updatedNextRefill,
    });
  } catch (error: any) {
    console.error("POST /api/admin/customers/refills error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to send refill reminder" }, { status: 500 });
  }
}
