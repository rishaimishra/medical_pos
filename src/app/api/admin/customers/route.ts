import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

/**
 * MODULE 1.13.1: CUSTOMER / PATIENT DIRECTORY & MASTER DATABASE
 * 
 * - GET: Search, filter by chronic status, due balance, gender, with pagination & financial metrics.
 * - POST: Create new customer with duplicate phone detection, age/DOB parsing, chronic tags, and credit limit.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const chronicFilter = (searchParams.get("chronic") || "all").toLowerCase(); // "all" | "chronic" | "non_chronic"
  const genderFilter = (searchParams.get("gender") || "all").toLowerCase();
  const hasDueOnly = searchParams.get("hasDue") === "true";
  const sortBy = searchParams.get("sort") || "recent"; // "recent" | "name_asc" | "due_desc"

  try {
    const whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { chronicDiseases: { contains: search, mode: "insensitive" } },
      ];
    }

    if (chronicFilter === "chronic") {
      whereClause.isChronic = true;
    } else if (chronicFilter === "non_chronic") {
      whereClause.isChronic = false;
    }

    if (genderFilter && genderFilter !== "all") {
      whereClause.gender = genderFilter;
    }

    // Determine ordering
    let orderBy: any = { id: "desc" };
    if (sortBy === "name_asc") {
      orderBy = { name: "asc" };
    }

    // Top KPI Aggregates
    const [totalCustomers, chronicCount, rawDueSales, rawPayments] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { isChronic: true } }),
      prisma.sale.findMany({
        where: { customerId: { not: null }, paymentMethod: "credit" },
        select: { customerId: true, grandTotal: true },
      }),
      prisma.customerPayment.findMany({
        select: { customerId: true, amount: true },
      }),
    ]);

    // Compute net due per customer
    const duesMap = new Map<number, number>();
    for (const s of rawDueSales) {
      if (s.customerId) {
        duesMap.set(s.customerId, (duesMap.get(s.customerId) || 0) + Number(s.grandTotal));
      }
    }
    for (const p of rawPayments) {
      duesMap.set(p.customerId, (duesMap.get(p.customerId) || 0) - Number(p.amount));
    }

    let totalOutstandingDue = 0;
    for (const due of duesMap.values()) {
      if (due > 0) totalOutstandingDue += due;
    }

    // Count refills due within 7 days
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const refillsDueWeek = await prisma.customer.count({
      where: {
        isChronic: true,
        nextRefillDate: { lte: nextWeek },
      },
    });

    // If hasDueOnly filter is active
    if (hasDueOnly) {
      const dueCustomerIds = Array.from(duesMap.entries())
        .filter(([_, bal]) => bal > 0.01)
        .map(([id]) => id);
      whereClause.id = { in: dueCustomerIds };
    }

    const [count, customers] = await Promise.all([
      prisma.customer.count({ where: whereClause }),
      prisma.customer.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: { sales: true, patientMessages: true },
          },
          sales: {
            take: 1,
            orderBy: { saleDate: "desc" },
            select: { saleDate: true },
          },
        },
      }),
    ]);

    // Map customer view models with computed metrics
    const customerList = customers.map((c) => {
      const netDue = Math.max(0, Math.round((duesMap.get(c.id) || 0) * 100) / 100);
      const lastVisit = c.sales[0]?.saleDate || null;

      let daysToRefill: number | null = null;
      if (c.isChronic && c.nextRefillDate) {
        const today = new Date().setHours(0, 0, 0, 0);
        const refDate = new Date(c.nextRefillDate).setHours(0, 0, 0, 0);
        daysToRefill = Math.ceil((refDate - today) / (1000 * 60 * 60 * 24));
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        dob: c.dob,
        gender: c.gender,
        medicalNotes: c.medicalNotes,
        isChronic: c.isChronic,
        chronicDiseases: c.chronicDiseases,
        refillDays: c.refillDays,
        nextRefillDate: c.nextRefillDate,
        lastRefillDate: c.lastRefillDate,
        daysToRefill,
        creditLimit: Number(c.creditLimit),
        outstandingDue: netDue,
        active: c.active,
        verified: c.verified,
        salesCount: c._count.sales,
        prescriptionsCount: c._count.patientMessages,
        lastVisit,
        createdAt: c.createdAt,
      };
    });

    // If sorting by due_desc
    if (sortBy === "due_desc") {
      customerList.sort((a, b) => b.outstandingDue - a.outstandingDue);
    }

    return NextResponse.json({
      success: true,
      customers: customerList,
      summary: {
        totalCustomers,
        chronicCount,
        refillsDueWeek,
        totalOutstandingDue: Math.round(totalOutstandingDue * 100) / 100,
      },
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/customers error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch customers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!hasPermission(auth.session, "manage_customers") && auth.session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    const phone = (body.phone || "").replace(/\s+/g, "").trim();
    const email = (body.email || "").toLowerCase().trim() || null;
    const address = (body.address || "").trim() || null;
    const gender = (body.gender || "").trim().toLowerCase() || null;
    const medicalNotes = (body.medicalNotes || "").trim() || null;
    const isChronic = Boolean(body.isChronic);
    const chronicDiseases = (body.chronicDiseases || "").trim() || null;
    const refillDays = body.refillDays ? parseInt(body.refillDays, 10) : (isChronic ? 30 : null);
    const creditLimit = Math.max(0, parseFloat(body.creditLimit) || 0);

    if (!name) {
      return NextResponse.json({ success: false, message: "Customer full name is required" }, { status: 400 });
    }

    if (!phone) {
      return NextResponse.json({ success: false, message: "Customer phone number is required" }, { status: 400 });
    }

    // Duplicate phone prevention
    const existing = await prisma.customer.findUnique({
      where: { phone },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          message: `A patient / customer is already registered with mobile number ${phone} (${existing.name}).`,
        },
        { status: 400 }
      );
    }

    if (email) {
      const existingEmail = await prisma.customer.findUnique({ where: { email } });
      if (existingEmail) {
        return NextResponse.json({ success: false, message: `Email address ${email} is already registered.` }, { status: 400 });
      }
    }

    // DOB / Age calculation with timezone protection
    let dob: Date | null = null;
    if (body.dob) {
      const parsed = new Date(body.dob);
      if (!isNaN(parsed.getTime())) dob = parsed;
    } else if (body.age && !isNaN(parseInt(body.age, 10))) {
      const ageNum = parseInt(body.age, 10);
      const birthYear = new Date().getFullYear() - ageNum;
      dob = new Date(`${birthYear}-01-01T00:00:00.000Z`);
    }

    // Next refill date calculation
    let nextRefillDate: Date | null = null;
    const today = new Date();
    if (body.nextRefillDate) {
      const parsedRefill = new Date(body.nextRefillDate);
      if (!isNaN(parsedRefill.getTime())) nextRefillDate = parsedRefill;
    } else if (isChronic && refillDays) {
      const refDate = new Date();
      refDate.setDate(refDate.getDate() + refillDays);
      nextRefillDate = refDate;
    }

    const newCustomer = await prisma.customer.create({
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
        lastRefillDate: isChronic ? today : null,
        creditLimit,
        active: true,
      },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "CUSTOMER_CREATED",
      entity: "customer",
      entityId: newCustomer.id,
      details: {
        name: newCustomer.name,
        phone: newCustomer.phone,
        isChronic: newCustomer.isChronic,
        creditLimit: newCustomer.creditLimit,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Customer ${newCustomer.name} created successfully`,
      customer: newCustomer,
    });
  } catch (error: any) {
    console.error("POST /api/admin/customers error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to create customer" }, { status: 500 });
  }
}
