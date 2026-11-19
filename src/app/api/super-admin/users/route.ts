import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";

/**
 * MODULE 3.3.4: Global Cross-Tenant Users Directory API (`/api/super-admin/users`)
 * Tabs: store_admins | staff | suppliers | patients | platform
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const tab = (searchParams.get("tab") || "store_admins").toLowerCase();
  const search = (searchParams.get("search") || "").trim();
  const storeIdParam = searchParams.get("storeId");
  const statusParam = (searchParams.get("status") || "all").toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") || "25", 10) || 25));
  const skip = (page - 1) * limit;

  const filterStoreId =
    storeIdParam && storeIdParam !== "all" ? parseInt(storeIdParam, 10) : null;

  try {
    const [
      stores,
      adminCount,
      staffCount,
      supplierUserCount,
      patientCount,
      platformCount,
    ] = await Promise.all([
      prisma.settings.findMany({ orderBy: { id: "asc" }, select: { id: true, storeName: true } }),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.user.count({ where: { role: { not: "admin" } } }),
      prisma.supplierUser.count(),
      prisma.customer.count(),
      prisma.platformUser.count(),
    ]);

    const counts = {
      storeAdmins: adminCount,
      staff: staffCount,
      suppliers: supplierUserCount,
      patients: patientCount,
      platform: platformCount,
    };

    if (tab === "store_admins" || tab === "staff") {
      const where: any = {
        role: tab === "store_admins" ? "admin" : { not: "admin" },
      };
      if (filterStoreId && !isNaN(filterStoreId)) where.storeId = filterStoreId;
      if (statusParam === "active") where.active = true;
      else if (statusParam === "inactive") where.active = false;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ id: "desc" }],
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            role: true,
            active: true,
            lastLogin: true,
            storeId: true,
            branchId: true,
            store: { select: { storeName: true } },
            branch: { select: { name: true, code: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        tab,
        counts,
        stores,
        users: rows,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      });
    }

    if (tab === "suppliers") {
      const where: any = {};
      if (filterStoreId && !isNaN(filterStoreId)) {
        where.supplier = { storeId: filterStoreId };
      }
      if (statusParam === "active") where.active = true;
      else if (statusParam === "inactive") where.active = false;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { supplier: { name: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.supplierUser.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: "desc" },
          select: {
            id: true,
            name: true,
            username: true,
            email: true,
            phone: true,
            active: true,
            verified: true,
            lastLogin: true,
            supplier: {
              select: {
                id: true,
                name: true,
                storeId: true,
                store: { select: { storeName: true } },
              },
            },
          },
        }),
        prisma.supplierUser.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        tab,
        counts,
        stores,
        users: rows,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      });
    }

    if (tab === "patients") {
      const where: any = {};
      if (filterStoreId && !isNaN(filterStoreId)) where.storeId = filterStoreId;
      if (statusParam === "active") where.active = true;
      else if (statusParam === "inactive") where.active = false;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { id: "desc" },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            storeId: true,
            active: true,
            verified: true,
            isChronic: true,
            lastLogin: true,
            store: { select: { storeName: true } },
            _count: { select: { sales: true } },
          },
        }),
        prisma.customer.count({ where }),
      ]);

      return NextResponse.json({
        success: true,
        tab,
        counts,
        stores,
        users: rows,
        pagination: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      });
    }

    // Platform Team tab
    const pWhere: any = {};
    if (statusParam === "active") pWhere.active = true;
    else if (statusParam === "inactive") pWhere.active = false;
    if (search) {
      pWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [pRows, pTotal] = await Promise.all([
      prisma.platformUser.findMany({
        where: pWhere,
        skip,
        take: limit,
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          active: true,
          lastLogin: true,
          createdAt: true,
        },
      }),
      prisma.platformUser.count({ where: pWhere }),
    ]);

    return NextResponse.json({
      success: true,
      tab: "platform",
      counts,
      stores,
      users: pRows,
      pagination: { total: pTotal, page, limit, totalPages: Math.max(1, Math.ceil(pTotal / limit)) },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/users Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load global users directory" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const userType = String(body.userType || "").toLowerCase(); // store_user | supplier_user | customer | platform_user
    const id = parseInt(String(body.id || ""), 10);
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: "Valid user ID is required." }, { status: 400 });
    }

    const ip = getClientIp(req);

    if (userType === "store_user") {
      const updated = await prisma.user.update({
        where: { id },
        data: { active: Boolean(body.active) },
      });
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId: updated.storeId,
        action: updated.active ? "GLOBAL_STORE_USER_ACTIVATED" : "GLOBAL_STORE_USER_DEACTIVATED",
        entity: "users",
        entityId: id,
        details: { username: updated.username },
        ipAddress: ip,
      });
      return NextResponse.json({ success: true, active: updated.active });
    }

    if (userType === "supplier_user") {
      const updated = await prisma.supplierUser.update({
        where: { id },
        data: { active: Boolean(body.active) },
      });
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: updated.active ? "GLOBAL_SUPPLIER_USER_ACTIVATED" : "GLOBAL_SUPPLIER_USER_DEACTIVATED",
        entity: "supplier_users",
        entityId: id,
        details: { username: updated.username },
        ipAddress: ip,
      });
      return NextResponse.json({ success: true, active: updated.active });
    }

    if (userType === "customer") {
      const updated = await prisma.customer.update({
        where: { id },
        data: { active: Boolean(body.active) },
      });
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        storeId: updated.storeId,
        action: updated.active ? "GLOBAL_PATIENT_ACTIVATED" : "GLOBAL_PATIENT_DEACTIVATED",
        entity: "customers",
        entityId: id,
        details: { phone: updated.phone },
        ipAddress: ip,
      });
      return NextResponse.json({ success: true, active: updated.active });
    }

    if (userType === "platform_user") {
      if (auth.session.role !== "ceo") {
        return NextResponse.json(
          { success: false, message: "Only the Platform CEO may modify platform team accounts." },
          { status: 403 }
        );
      }
      if (id === auth.session.platformUserId && body.active === false) {
        return NextResponse.json(
          { success: false, message: "You cannot deactivate your own active CEO session." },
          { status: 400 }
        );
      }
      const updateData: any = {};
      if (body.active !== undefined) updateData.active = Boolean(body.active);
      if (body.role && ["ceo", "platform_admin", "finance_ops", "support_viewer"].includes(body.role)) {
        updateData.role = body.role;
      }
      const updated = await prisma.platformUser.update({ where: { id }, data: updateData });
      await logPlatformAudit({
        platformUserId: auth.session.platformUserId,
        action: "PLATFORM_OPERATOR_UPDATED",
        entity: "platform_users",
        entityId: id,
        details: updateData,
        ipAddress: ip,
      });
      return NextResponse.json({ success: true, active: updated.active, role: updated.role });
    }

    return NextResponse.json({ success: false, message: "Unsupported userType." }, { status: 400 });
  } catch (err: any) {
    console.error("[PATCH /api/super-admin/users Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
