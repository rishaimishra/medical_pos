import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidGST(gst: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9A-Z]{4}[A-Z0-9]{4}$/.test(gst);
}

/**
 * MODULE 1.10.1: SUPPLIER / DISTRIBUTOR PROFILE MASTER
 * 
 * Endpoints:
 * - GET: Fetch paginated suppliers with search, financial aggregates (purchases, payments, balance), and portal user status.
 * - POST: Create new supplier profile with contact details, GSTIN, DL No, and credit payment terms.
 * - PUT: Update supplier profile.
 * - DELETE: Guarded deletion blocking removal if active batches or purchase orders reference this supplier.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  // Permission Check: Requires manage_purchases or admin/manager role
  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to view suppliers directory" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const all = searchParams.get("all") === "true"; // For dropdown selectors

  try {
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { contact: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { gstNo: { contains: search, mode: "insensitive" } },
        { dlNo: { contains: search, mode: "insensitive" } },
      ];
    }

    if (all) {
      const suppliers = await prisma.supplier.findMany({
        where: whereClause,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          contact: true,
          phone: true,
          email: true,
          gstNo: true,
          dlNo: true,
          paymentTerms: true,
        },
      });
      return NextResponse.json({ success: true, suppliers });
    }

    const [totalSuppliers, suppliers] = await Promise.all([
      prisma.supplier.count({ where: whereClause }),
      prisma.supplier.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              batches: true,
              purchaseOrders: true,
              payments: true,
              supplierUsers: true,
            },
          },
          purchaseOrders: {
            select: {
              id: true,
              total: true,
              status: true,
              poDate: true,
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              paymentDate: true,
              paymentMethod: true,
            },
          },
          supplierUsers: {
            select: {
              id: true,
              username: true,
              email: true,
              active: true,
              verified: true,
              lastLogin: true,
            },
          },
        },
      }),
    ]);

    // Calculate Financial Aggregates per supplier
    const enrichedSuppliers = suppliers.map((sup) => {
      // Total purchases from confirmed, shipped, received POs
      const totalPurchased = sup.purchaseOrders
        .filter((po) => po.status !== "cancelled" && po.status !== "draft")
        .reduce((sum, po) => sum + Number(po.total || 0), 0);

      const totalPaid = sup.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const outstandingBalance = Math.max(0, totalPurchased - totalPaid);

      return {
        id: sup.id,
        name: sup.name,
        contact: sup.contact,
        phone: sup.phone,
        email: sup.email,
        address: sup.address,
        gstNo: sup.gstNo,
        dlNo: sup.dlNo,
        paymentTerms: sup.paymentTerms,
        batchesCount: sup._count.batches,
        purchaseOrdersCount: sup._count.purchaseOrders,
        paymentsCount: sup._count.payments,
        portalUsersCount: sup._count.supplierUsers,
        totalPurchased: Math.round(totalPurchased * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
        portalUser: sup.supplierUsers[0] || null,
        createdAt: sup.createdAt,
        updatedAt: sup.updatedAt,
      };
    });

    // Calculate Summary KPIs across all suppliers
    const allSuppliersForKpis = await prisma.supplier.findMany({
      include: {
        purchaseOrders: {
          select: { total: true, status: true, poDate: true },
        },
        payments: {
          select: { amount: true, paymentDate: true },
        },
      },
    });

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalAccountsPayable = 0;
    let totalPurchasesThisMonth = 0;

    for (const sup of allSuppliersForKpis) {
      const supPurchases = sup.purchaseOrders
        .filter((po) => po.status !== "cancelled" && po.status !== "draft")
        .reduce((sum, po) => sum + Number(po.total || 0), 0);
      const supPayments = sup.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const balance = Math.max(0, supPurchases - supPayments);
      totalAccountsPayable += balance;

      // Month-to-date purchases
      const mtdPurchases = sup.purchaseOrders
        .filter((po) => po.status !== "cancelled" && po.status !== "draft" && new Date(po.poDate) >= firstDayOfMonth)
        .reduce((sum, po) => sum + Number(po.total || 0), 0);
      totalPurchasesThisMonth += mtdPurchases;
    }

    const totalActivePortalUsers = await prisma.supplierUser.count({
      where: {
        active: true,
      },
    });

    return NextResponse.json({
      success: true,
      suppliers: enrichedSuppliers,
      pagination: {
        page,
        limit,
        total: totalSuppliers,
        totalPages: Math.ceil(totalSuppliers / limit) || 1,
      },
      summary: {
        totalSuppliers,
        totalAccountsPayable: Math.round(totalAccountsPayable * 100) / 100,
        totalPurchasesThisMonth: Math.round(totalPurchasesThisMonth * 100) / 100,
        activePortalUsers: totalActivePortalUsers,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/suppliers error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch suppliers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to add suppliers" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    const contact = (body.contact || "").trim() || null;
    const phone = (body.phone || "").trim();
    const email = (body.email || "").trim() || null;
    const address = (body.address || "").trim() || null;
    const gstNo = (body.gstNo || "").trim().toUpperCase() || null;
    const dlNo = (body.dlNo || "").trim().toUpperCase() || null;
    const rawPaymentTerms = parseInt(body.paymentTerms, 10);
    const paymentTerms = Math.max(0, Math.min(365, isNaN(rawPaymentTerms) ? 30 : rawPaymentTerms));

    if (!name) {
      return NextResponse.json({ success: false, message: "Vendor/Supplier name is required" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ success: false, message: "Phone number is required" }, { status: 400 });
    }
    if (!isValidPhone(phone)) {
      return NextResponse.json({ success: false, message: "Phone number must contain between 7 and 15 digits" }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email address format" }, { status: 400 });
    }
    if (gstNo && !isValidGST(gstNo)) {
      return NextResponse.json({ success: false, message: "Invalid GSTIN format (must be 15 alphanumeric characters e.g. 19ABCDE1234F1Z5)" }, { status: 400 });
    }

    // Check duplicate phone, name, GSTIN or DL No
    const dupConditions: any[] = [
      { name: { equals: name, mode: "insensitive" } },
      { phone: { equals: phone } },
    ];
    if (gstNo) dupConditions.push({ gstNo: { equals: gstNo, mode: "insensitive" } });
    if (dlNo) dupConditions.push({ dlNo: { equals: dlNo, mode: "insensitive" } });

    const existing = await prisma.supplier.findFirst({
      where: { OR: dupConditions },
    });

    if (existing) {
      if (existing.name.toLowerCase() === name.toLowerCase()) {
        return NextResponse.json({ success: false, message: `A supplier named '${name}' already exists.` }, { status: 400 });
      }
      if (existing.phone === phone) {
        return NextResponse.json({ success: false, message: `Phone number '${phone}' is already registered with supplier '${existing.name}'.` }, { status: 400 });
      }
      if (gstNo && existing.gstNo?.toUpperCase() === gstNo) {
        return NextResponse.json({ success: false, message: `GSTIN '${gstNo}' is already registered with supplier '${existing.name}'.` }, { status: 400 });
      }
      if (dlNo && existing.dlNo?.toUpperCase() === dlNo) {
        return NextResponse.json({ success: false, message: `Drug License '${dlNo}' is already registered with supplier '${existing.name}'.` }, { status: 400 });
      }
    }

    const supplier = await prisma.supplier.create({
      data: {
        name,
        contact,
        phone,
        email,
        address,
        gstNo,
        dlNo,
        paymentTerms,
      },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "SUPPLIER_CREATED",
      entity: "supplier",
      entityId: supplier.id,
      details: { name: supplier.name, phone: supplier.phone, gstNo: supplier.gstNo, paymentTerms },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Supplier '${supplier.name}' created successfully`,
      supplier,
    });
  } catch (error: any) {
    console.error("POST /api/admin/suppliers error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to create supplier" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to update suppliers" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = parseInt(body.id, 10);
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: "Valid Supplier ID is required" }, { status: 400 });
    }

    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    const name = body.name !== undefined ? (body.name || "").trim() : existing.name;
    const contact = body.contact !== undefined ? ((body.contact || "").trim() || null) : existing.contact;
    const phone = body.phone !== undefined ? (body.phone || "").trim() : existing.phone;
    const email = body.email !== undefined ? ((body.email || "").trim() || null) : existing.email;
    const address = body.address !== undefined ? ((body.address || "").trim() || null) : existing.address;
    const gstNo = body.gstNo !== undefined ? ((body.gstNo || "").trim().toUpperCase() || null) : existing.gstNo;
    const dlNo = body.dlNo !== undefined ? ((body.dlNo || "").trim().toUpperCase() || null) : existing.dlNo;
    const paymentTerms = body.paymentTerms !== undefined && body.paymentTerms !== null && String(body.paymentTerms).trim() !== ""
      ? Math.max(0, Math.min(365, isNaN(parseInt(body.paymentTerms, 10)) ? 30 : parseInt(body.paymentTerms, 10)))
      : existing.paymentTerms;

    if (!name) {
      return NextResponse.json({ success: false, message: "Vendor/Supplier name cannot be empty" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ success: false, message: "Phone number cannot be empty" }, { status: 400 });
    }
    if (!isValidPhone(phone)) {
      return NextResponse.json({ success: false, message: "Phone number must contain between 7 and 15 digits" }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ success: false, message: "Invalid email address format" }, { status: 400 });
    }
    if (gstNo && !isValidGST(gstNo)) {
      return NextResponse.json({ success: false, message: "Invalid GSTIN format (must be 15 alphanumeric characters e.g. 19ABCDE1234F1Z5)" }, { status: 400 });
    }

    // Check duplicate phone, name, GSTIN or DL No against OTHER suppliers
    const duplicateConditions: any[] = [
      { name: { equals: name, mode: "insensitive" } },
      { phone: { equals: phone } },
    ];
    if (gstNo) duplicateConditions.push({ gstNo: { equals: gstNo, mode: "insensitive" } });
    if (dlNo) duplicateConditions.push({ dlNo: { equals: dlNo, mode: "insensitive" } });

    const duplicate = await prisma.supplier.findFirst({
      where: {
        id: { not: id },
        OR: duplicateConditions,
      },
    });

    if (duplicate) {
      if (duplicate.name.toLowerCase() === name.toLowerCase()) {
        return NextResponse.json({ success: false, message: `Another supplier named '${name}' already exists.` }, { status: 400 });
      }
      if (duplicate.phone === phone) {
        return NextResponse.json({ success: false, message: `Phone number '${phone}' is already registered with supplier '${duplicate.name}'.` }, { status: 400 });
      }
      if (gstNo && duplicate.gstNo?.toUpperCase() === gstNo) {
        return NextResponse.json({ success: false, message: `GSTIN '${gstNo}' is already registered with supplier '${duplicate.name}'.` }, { status: 400 });
      }
      if (dlNo && duplicate.dlNo?.toUpperCase() === dlNo) {
        return NextResponse.json({ success: false, message: `Drug License '${dlNo}' is already registered with supplier '${duplicate.name}'.` }, { status: 400 });
      }
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        contact,
        phone,
        email,
        address,
        gstNo,
        dlNo,
        paymentTerms,
      },
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "SUPPLIER_UPDATED",
      entity: "supplier",
      entityId: updated.id,
      details: {
        old: { name: existing.name, phone: existing.phone, paymentTerms: existing.paymentTerms },
        new: { name: updated.name, phone: updated.phone, paymentTerms: updated.paymentTerms },
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Supplier '${updated.name}' updated successfully`,
      supplier: updated,
    });
  } catch (error: any) {
    console.error("PUT /api/admin/suppliers error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update supplier" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  // Deletion is strictly reserved for Admin or Manager with manage_purchases
  if (auth.session.role !== "admin" && !hasPermission(auth.session, "manage_purchases")) {
    return NextResponse.json({ success: false, message: "Forbidden: Admin privileges required to delete suppliers" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get("id") || "", 10);
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: "Valid Supplier ID is required" }, { status: 400 });
    }

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            batches: true,
            purchaseOrders: true,
            payments: true,
          },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json({ success: false, message: "Supplier not found" }, { status: 404 });
    }

    // Safety Deletion Guard: Block if active batches or purchase orders exist
    if (supplier._count.batches > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete supplier '${supplier.name}': There are ${supplier._count.batches} inventory batch records linked to this distributor.`,
        },
        { status: 400 }
      );
    }

    if (supplier._count.purchaseOrders > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete supplier '${supplier.name}': There are ${supplier._count.purchaseOrders} purchase order records linked to this distributor.`,
        },
        { status: 400 }
      );
    }

    if (supplier._count.payments > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot delete supplier '${supplier.name}': There are ${supplier._count.payments} financial payment/ledger records linked to this distributor.`,
        },
        { status: 400 }
      );
    }

    await prisma.supplier.delete({ where: { id } });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "SUPPLIER_DELETED",
      entity: "supplier",
      entityId: id,
      details: { name: supplier.name, phone: supplier.phone },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Supplier '${supplier.name}' removed successfully`,
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/suppliers error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete supplier" }, { status: 500 });
  }
}
