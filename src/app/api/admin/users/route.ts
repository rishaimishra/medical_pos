import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import {
  verifyAdminRequest,
  hashPassword,
} from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import {
  ROLE_MATRIX,
  SystemRole,
  PermissionKey,
} from "@/lib/rbac";
import { sendAccountCredentialsEmail } from "@/lib/email";

/**
 * GET /api/admin/users
 * Returns unified user accounts across 3 tabs (staff, suppliers, patients)
 * with branch assignments, role definitions, and last-admin protection metadata.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_users" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "staff";
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const branchId = searchParams.get("branchId") ? parseInt(searchParams.get("branchId")!, 10) : null;
  const roleFilter = searchParams.get("role") || null;

  try {
    const storeScope = auth.session.storeId ? { storeId: auth.session.storeId } : {};

    // 1. Fetch summary counts for the 3 tabs (strictly scoped to store tenant)
    const [staffCount, supplierCount, patientCount] = await Promise.all([
      prisma.user.count({ where: storeScope }),
      prisma.supplierUser.count(),
      prisma.customer.count(),
    ]);

    // 2. Fetch active branches & suppliers list for modal dropdown selectors
    const branchWhere: any = { active: true };
    if (auth.session.storeId) {
      branchWhere.storeId = auth.session.storeId;
    }

    const [branches, suppliersList] = await Promise.all([
      prisma.branch.findMany({
        where: branchWhere,
        select: { id: true, code: true, name: true, isMain: true, active: true },
        orderBy: [{ isMain: "desc" }, { name: "asc" }],
      }),
      prisma.supplier.findMany({
        select: { id: true, name: true, phone: true, email: true },
        orderBy: { name: "asc" },
      }),
    ]);

    // 3. Tab-specific data resolution
    if (tab === "suppliers") {
      const whereClause: any = {};
      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { username: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { supplier: { name: { contains: search, mode: "insensitive" } } },
        ];
      }

      const supplierUsers = await prisma.supplierUser.findMany({
        where: whereClause,
        include: {
          supplier: {
            select: { id: true, name: true, phone: true, email: true, gstNo: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Exclude password hashes from response
      const safeSupplierUsers = supplierUsers.map((su) => {
        const { password, ...safe } = su;
        return safe;
      });

      return NextResponse.json({
        success: true,
        tab: "suppliers",
        counts: { staffCount, supplierCount, patientCount },
        branches,
        suppliersList,
        data: safeSupplierUsers,
      });
    }

    if (tab === "patients") {
      const whereClause: any = {};
      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { address: { contains: search, mode: "insensitive" } },
        ];
      }

      const patients = await prisma.customer.findMany({
        where: whereClause,
        include: {
          _count: {
            select: { sales: true, purchaseLogs: true, returns: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const safePatients = patients.map((p) => {
        const { password, ...safe } = p;
        return safe;
      });

      return NextResponse.json({
        success: true,
        tab: "patients",
        counts: { staffCount, supplierCount, patientCount },
        branches,
        suppliersList,
        data: safePatients,
      });
    }

    // Default: 'staff' tab
    const staffWhere: any = { ...storeScope };
    if (search) {
      staffWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (branchId !== null && !isNaN(branchId)) {
      staffWhere.branchId = branchId;
    }
    if (roleFilter && roleFilter !== "all") {
      staffWhere.role = roleFilter;
    }

    const users = await prisma.user.findMany({
      where: staffWhere,
      include: {
        branch: {
          select: { id: true, code: true, name: true, isMain: true, active: true },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    // Check count of active admins for Last-Admin protection badges on frontend
    const activeAdminCount = await prisma.user.count({
      where: { role: "admin", active: true, ...storeScope },
    });

    const safeUsers = users.map((u) => {
      const { password, ...safe } = u;
      return {
        ...safe,
        isOnlyAdmin: u.role === "admin" && activeAdminCount <= 1,
      };
    });

    return NextResponse.json({
      success: true,
      tab: "staff",
      counts: { staffCount, supplierCount, patientCount },
      activeAdminCount,
      branches,
      suppliersList,
      roles: ROLE_MATRIX,
      data: safeUsers,
    });
  } catch (err: any) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to retrieve user accounts: " + (err?.message || "Unknown error") },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Creates a new user account (Staff, Supplier User, or Patient/Customer)
 * Validates unique email/username, minimum password length 6, sends credential email.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_users" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const type = body.type || "staff";

    // ── 1. CREATE STAFF USER ──────────────────────────────────────────
    if (type === "staff") {
      const name = (body.name || "").trim();
      const username = (body.username || "").trim().toLowerCase();
      const email = (body.email || "").trim().toLowerCase();
      const password = body.password || "";
      const role = (body.role || "staff").trim().toLowerCase() as SystemRole;
      const branchId = body.branchId !== null && body.branchId !== undefined && body.branchId !== ""
        ? parseInt(body.branchId, 10)
        : null;
      const permissions = body.permissions ? (typeof body.permissions === "string" ? body.permissions : JSON.stringify(body.permissions)) : null;
      const sendEmail = body.sendEmail !== false;

      // Validation
      if (!name) {
        return NextResponse.json({ success: false, message: "Staff full name is required." }, { status: 400 });
      }
      if (!username || username.length < 3) {
        return NextResponse.json({ success: false, message: "Username must be at least 3 characters." }, { status: 400 });
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        return NextResponse.json({ success: false, message: "Username can only contain letters, numbers, dots, and hyphens." }, { status: 400 });
      }
      if (!email || !email.includes("@")) {
        return NextResponse.json({ success: false, message: "A valid email address is required." }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ success: false, message: "Password must be at least 6 characters long." }, { status: 400 });
      }
      if (!ROLE_MATRIX[role]) {
        return NextResponse.json({ success: false, message: `Invalid role selected: ${role}.` }, { status: 400 });
      }

      // Privilege Escalation Guard: Only Super Admin can create an Admin account
      if (role === "admin" && auth.session.role !== "admin") {
        return NextResponse.json(
          { success: false, message: "Security Protection: Only Super Admins can create Admin accounts." },
          { status: 403 }
        );
      }

      // Check unique constraints
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
      });

      if (existingUser) {
        if (existingUser.username.toLowerCase() === username) {
          return NextResponse.json({ success: false, message: `Username '${username}' is already in use.` }, { status: 409 });
        }
        if (existingUser.email.toLowerCase() === email) {
          return NextResponse.json({ success: false, message: `Email '${email}' is already in use by another account.` }, { status: 409 });
        }
      }

      // Validate store branch if assigned (must be active and belong to store tenant)
      let assignedBranch: any = null;
      if (branchId) {
        assignedBranch = await prisma.branch.findFirst({
          where: {
            id: branchId,
            ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
            active: true,
          },
        });
        if (!assignedBranch) {
          return NextResponse.json(
            { success: false, message: "Selected store branch was not found or is currently inactive." },
            { status: 404 }
          );
        }
      }

      const hashedPassword = await hashPassword(password);

      const newUser = await prisma.user.create({
        data: {
          storeId: auth.session.storeId,
          name,
          username,
          email,
          password: hashedPassword,
          role,
          branchId,
          permissions,
          active: true,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      });

      // Audit Log
      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: newUser.branchId ?? auth.session.branchId,
        action: "USER_CREATED",
        entity: "users",
        entityId: newUser.id,
        details: {
          username: newUser.username,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          branchId: newUser.branchId,
        },
        ipAddress: clientIp,
      });

      // Module 1.5.4: Branded Credential Email
      let emailResult: any = null;
      if (sendEmail) {
        const storeSettings = await prisma.settings.findFirst({
          where: auth.session.storeId ? { id: auth.session.storeId } : {},
          select: { storeName: true },
        });
        const appUrl = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        emailResult = await sendAccountCredentialsEmail({
          toEmail: email,
          name,
          username,
          password,
          role,
          storeName: storeSettings?.storeName || "Medical POS Pharmacy",
          branchName: assignedBranch ? `${assignedBranch.name} (${assignedBranch.code})` : "All Branches (Global)",
          loginUrl: `${appUrl}/admin/login`,
          accountType: "staff",
          storeId: auth.session.storeId,
        });
      }

      const { password: _, ...safeUser } = newUser;
      return NextResponse.json({
        success: true,
        message: `Staff account for '${name}' created successfully.${emailResult?.success ? ` Welcome email sent to ${email}.` : ""}`,
        data: safeUser,
        emailSent: Boolean(emailResult?.success),
      });
    }

    // ── 2. CREATE SUPPLIER USER ───────────────────────────────────────
    if (type === "supplier") {
      const supplierId = parseInt(body.supplierId, 10);
      const name = (body.name || "").trim();
      const username = (body.username || "").trim().toLowerCase();
      const email = (body.email || "").trim().toLowerCase();
      const phone = (body.phone || "").trim();
      const password = body.password || "";
      const sendEmail = body.sendEmail !== false;

      if (!supplierId || isNaN(supplierId)) {
        return NextResponse.json({ success: false, message: "Please select an affiliated supplier company." }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json({ success: false, message: "Representative contact name is required." }, { status: 400 });
      }
      if (!username || username.length < 3) {
        return NextResponse.json({ success: false, message: "Portal username must be at least 3 characters." }, { status: 400 });
      }
      if (!email || !email.includes("@")) {
        return NextResponse.json({ success: false, message: "Valid supplier email address is required." }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return NextResponse.json({ success: false, message: "Password must be at least 6 characters." }, { status: 400 });
      }

      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) {
        return NextResponse.json({ success: false, message: "Affiliated supplier vendor not found." }, { status: 404 });
      }

      // Check unique
      const existing = await prisma.supplierUser.findFirst({
        where: { OR: [{ username }, { email }] },
      });
      if (existing) {
        return NextResponse.json({ success: false, message: "Username or email is already registered for another supplier user." }, { status: 409 });
      }

      const hashedPassword = await hashPassword(password);
      const newSupUser = await prisma.supplierUser.create({
        data: {
          supplierId,
          name,
          username,
          email,
          phone: phone || null,
          password: hashedPassword,
          active: true,
          verified: true,
        },
        include: {
          supplier: { select: { id: true, name: true } },
        },
      });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "USER_CREATED",
        entity: "supplier_users",
        entityId: newSupUser.id,
        details: {
          supplierId: newSupUser.supplierId,
          supplierName: supplier.name,
          username: newSupUser.username,
          email: newSupUser.email,
        },
        ipAddress: clientIp,
      });

      if (sendEmail) {
        const storeSettings = await prisma.settings.findFirst({
          where: auth.session.storeId ? { id: auth.session.storeId } : {},
          select: { storeName: true },
        });
        const appUrl = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await sendAccountCredentialsEmail({
          toEmail: email,
          name,
          username,
          password,
          role: "Supplier Vendor Portal",
          storeName: storeSettings?.storeName || "Medical POS Pharmacy",
          branchName: supplier.name,
          loginUrl: `${appUrl}/supplier/login`,
          accountType: "supplier",
          storeId: auth.session.storeId,
        });
      }

      const { password: _, ...safeSupUser } = newSupUser;
      return NextResponse.json({
        success: true,
        message: `Supplier portal account for '${name}' created successfully.`,
        data: safeSupUser,
      });
    }

    // ── 3. CREATE PATIENT / CUSTOMER ──────────────────────────────────
    if (type === "patient") {
      const name = (body.name || "").trim();
      const phone = (body.phone || "").trim();
      const email = body.email ? body.email.trim().toLowerCase() : null;
      const address = body.address ? body.address.trim() : null;
      const dob = body.dob ? new Date(body.dob) : null;
      const password = body.password ? body.password.trim() : null;

      if (!name) {
        return NextResponse.json({ success: false, message: "Patient / Customer name is required." }, { status: 400 });
      }
      if (!phone || phone.length < 7) {
        return NextResponse.json({ success: false, message: "Valid mobile contact number is required." }, { status: 400 });
      }
      if (password && password.length < 6) {
        return NextResponse.json({ success: false, message: "Optional portal password must be at least 6 characters." }, { status: 400 });
      }

      // Check unique phone / email
      const orCheck: any[] = [{ phone }];
      if (email) orCheck.push({ email });

      const existingCust = await prisma.customer.findFirst({
        where: { OR: orCheck },
      });
      if (existingCust) {
        return NextResponse.json(
          { success: false, message: "A patient with this mobile number or email already exists." },
          { status: 409 }
        );
      }

      const hashedPassword = password ? await hashPassword(password) : null;

      const newCustomer = await prisma.customer.create({
        data: {
          name,
          phone,
          email,
          address,
          dob: dob && !isNaN(dob.getTime()) ? dob : null,
          password: hashedPassword,
          active: true,
          verified: Boolean(body.verified ?? true),
        },
      });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "USER_CREATED",
        entity: "customers",
        entityId: newCustomer.id,
        details: {
          name: newCustomer.name,
          phone: newCustomer.phone,
          email: newCustomer.email,
        },
        ipAddress: clientIp,
      });

      const { password: _, ...safeCust } = newCustomer;
      return NextResponse.json({
        success: true,
        message: `Patient account for '${name}' registered successfully.`,
        data: safeCust,
      });
    }

    return NextResponse.json({ success: false, message: `Unsupported account type: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/admin/users error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to create user account: " + (err?.message || "Internal error") },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/users
 * Updates user profile, role, branch, custom permissions, or status toggle.
 * Strictly enforces Last-Admin protection (Module 1.5.2).
 */
export async function PUT(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_users" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);

  try {
    const body = await req.json();
    const type = body.type || "staff";
    const id = parseInt(body.id, 10);

    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: "Valid target account ID is required." }, { status: 400 });
    }

    // ── 1. UPDATE STAFF USER ──────────────────────────────────────────
    if (type === "staff") {
      const userWhere: any = { id };
      if (auth.session.storeId) userWhere.storeId = auth.session.storeId;

      const existingUser = await prisma.user.findFirst({
        where: userWhere,
        include: { branch: true },
      });
      if (!existingUser) {
        return NextResponse.json({ success: false, message: "Staff user account not found." }, { status: 404 });
      }

      // Safeguard: Prevent self-deactivation or self-demoting from Super Admin
      if (id === auth.session.userId) {
        if (body.action === "toggle_status" && existingUser.active) {
          return NextResponse.json(
            { success: false, message: "Security Protection: You cannot deactivate your own logged-in account." },
            { status: 400 }
          );
        }
        if (body.active === false && existingUser.active) {
          return NextResponse.json(
            { success: false, message: "Security Protection: You cannot deactivate your own logged-in account." },
            { status: 400 }
          );
        }
        if (body.role && body.role !== "admin" && existingUser.role === "admin") {
          return NextResponse.json(
            { success: false, message: "Security Protection: You cannot demote your own account from Super Admin." },
            { status: 400 }
          );
        }
      }

      // Privilege Escalation Guard: Non-admin users cannot promote to Admin, nor modify an Admin account
      if (auth.session.role !== "admin") {
        if (existingUser.role === "admin") {
          return NextResponse.json(
            { success: false, message: "Security Protection: Non-admin users cannot modify a Super Admin account." },
            { status: 403 }
          );
        }
        if (body.role && body.role === "admin" && existingUser.role !== "admin") {
          return NextResponse.json(
            { success: false, message: "Security Protection: Only Super Admins can promote accounts to Admin." },
            { status: 403 }
          );
        }
      }

      // Check if this is a quick status toggle (action === "toggle_status")
      if (body.action === "toggle_status") {
        const targetActive = body.active !== undefined ? Boolean(body.active) : !existingUser.active;

        // Module 1.5.2: Last-Admin Protection on deactivation
        if (existingUser.role.toLowerCase() === "admin" && existingUser.active && !targetActive) {
          const activeAdmins = await prisma.user.count({
            where: {
              role: "admin",
              active: true,
              ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
            },
          });
          if (activeAdmins <= 1) {
            return NextResponse.json(
              {
                success: false,
                message: "Security Protection: Cannot deactivate the only active Super Admin account.",
              },
              { status: 400 }
            );
          }
        }

        const updated = await prisma.user.update({
          where: { id },
          data: { active: targetActive },
          include: { branch: true },
        });

        await logAudit({
          storeId: auth.session.storeId,
          userId: auth.session.userId,
          branchId: updated.branchId ?? auth.session.branchId,
          action: targetActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
          entity: "users",
          entityId: updated.id,
          details: { username: updated.username, active: targetActive },
          ipAddress: clientIp,
        });

        const { password: _, ...safeUser } = updated;
        return NextResponse.json({
          success: true,
          message: `User '${updated.name}' has been ${targetActive ? "activated" : "deactivated"}.`,
          data: safeUser,
        });
      }

      // Full Staff Edit
      const name = (body.name || existingUser.name).trim();
      const email = (body.email || existingUser.email).trim().toLowerCase();
      const role = (body.role || existingUser.role).trim().toLowerCase() as SystemRole;
      const branchId = body.branchId !== undefined
        ? (body.branchId === null || body.branchId === "" ? null : parseInt(body.branchId, 10))
        : existingUser.branchId;
      const active = body.active !== undefined ? Boolean(body.active) : existingUser.active;
      const permissions = body.permissions !== undefined
        ? (typeof body.permissions === "string" ? body.permissions : JSON.stringify(body.permissions))
        : existingUser.permissions;

      if (!name) {
        return NextResponse.json({ success: false, message: "Staff full name is required." }, { status: 400 });
      }
      if (!email || !email.includes("@")) {
        return NextResponse.json({ success: false, message: "Valid email address is required." }, { status: 400 });
      }

      // Validate branch if changing to a new branch
      if (branchId !== null && branchId !== undefined && branchId !== existingUser.branchId) {
        const assignedBranch = await prisma.branch.findFirst({
          where: {
            id: branchId,
            ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
            active: true,
          },
        });
        if (!assignedBranch) {
          return NextResponse.json(
            { success: false, message: "Selected store branch was not found or is currently inactive." },
            { status: 404 }
          );
        }
      }

      // Module 1.5.2: Last-Admin Protection on role change or deactivation
      if (existingUser.role.toLowerCase() === "admin") {
        const isDemoting = role !== "admin";
        const isDisabling = !active;

        if (isDemoting || isDisabling) {
          const activeAdmins = await prisma.user.count({
            where: {
              role: "admin",
              active: true,
              id: { not: id },
              ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
            },
          });
          if (activeAdmins < 1) {
            return NextResponse.json(
              {
                success: false,
                message: "Security Protection: Cannot demote or disable the last active Super Admin account.",
              },
              { status: 400 }
            );
          }
        }
      }

      // Case-insensitive unique check for email change
      if (email !== existingUser.email.toLowerCase()) {
        const duplicateEmail = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
            id: { not: id },
          },
        });
        if (duplicateEmail) {
          return NextResponse.json({ success: false, message: `Email '${email}' is already in use by another user.` }, { status: 409 });
        }
      }

      const updateData: any = {
        name,
        email,
        role,
        branchId,
        active,
        permissions,
      };

      // Optional password reset
      if (body.password && body.password.trim()) {
        if (body.password.trim().length < 6) {
          return NextResponse.json({ success: false, message: "New password must be at least 6 characters." }, { status: 400 });
        }
        updateData.password = await hashPassword(body.password.trim());
      }

      const updated = await prisma.user.update({
        where: { id },
        data: updateData,
        include: { branch: true },
      });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: updated.branchId ?? auth.session.branchId,
        action: "USER_UPDATED",
        entity: "users",
        entityId: updated.id,
        details: {
          username: updated.username,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          branchId: updated.branchId,
          active: updated.active,
        },
        ipAddress: clientIp,
      });

      const { password: _, ...safeUser } = updated;
      return NextResponse.json({
        success: true,
        message: `Staff user '${updated.name}' updated successfully.`,
        data: safeUser,
      });
    }

    // ── 2. UPDATE SUPPLIER USER ───────────────────────────────────────
    if (type === "supplier") {
      const existing = await prisma.supplierUser.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ success: false, message: "Supplier portal user not found." }, { status: 404 });
      }

      if (body.action === "toggle_status" || (body.active !== undefined && Object.keys(body).length <= 3)) {
        const targetActive = body.active !== undefined ? Boolean(body.active) : !existing.active;
        const updated = await prisma.supplierUser.update({
          where: { id },
          data: { active: targetActive },
          include: { supplier: true },
        });

        await logAudit({
          storeId: auth.session.storeId,
          userId: auth.session.userId,
          branchId: auth.session.branchId,
          action: targetActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
          entity: "supplier_users",
          entityId: id,
          details: { username: existing.username, active: targetActive },
          ipAddress: clientIp,
        });

        const { password: _, ...safe } = updated;
        return NextResponse.json({
          success: true,
          message: `Supplier user '${updated.name}' status updated.`,
          data: safe,
        });
      }

      const name = (body.name || existing.name).trim();
      const email = (body.email || existing.email).trim().toLowerCase();
      const phone = body.phone !== undefined ? (body.phone ? body.phone.trim() : null) : existing.phone;
      const supplierId = body.supplierId ? parseInt(body.supplierId, 10) : existing.supplierId;
      const active = body.active !== undefined ? Boolean(body.active) : existing.active;
      const verified = body.verified !== undefined ? Boolean(body.verified) : existing.verified;

      if (!name) return NextResponse.json({ success: false, message: "Representative name is required." }, { status: 400 });
      if (!email || !email.includes("@")) return NextResponse.json({ success: false, message: "Valid email is required." }, { status: 400 });

      // Unique email check
      if (email !== existing.email.toLowerCase()) {
        const dup = await prisma.supplierUser.findFirst({ where: { email, id: { not: id } } });
        if (dup) return NextResponse.json({ success: false, message: "Email is already in use." }, { status: 409 });
      }

      const updateData: any = { name, email, phone, supplierId, active, verified };
      if (body.password && body.password.trim()) {
        if (body.password.trim().length < 6) return NextResponse.json({ success: false, message: "Password min 6 chars." }, { status: 400 });
        updateData.password = await hashPassword(body.password.trim());
      }

      const updated = await prisma.supplierUser.update({
        where: { id },
        data: updateData,
        include: { supplier: true },
      });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "USER_UPDATED",
        entity: "supplier_users",
        entityId: id,
        details: { username: updated.username, supplierId: updated.supplierId },
        ipAddress: clientIp,
      });

      const { password: _, ...safe } = updated;
      return NextResponse.json({ success: true, message: `Supplier user '${updated.name}' updated.`, data: safe });
    }

    // ── 3. UPDATE PATIENT / CUSTOMER ──────────────────────────────────
    if (type === "patient") {
      const existing = await prisma.customer.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ success: false, message: "Patient record not found." }, { status: 404 });
      }

      if (body.action === "toggle_status" || (body.active !== undefined && Object.keys(body).length <= 3)) {
        const targetActive = body.active !== undefined ? Boolean(body.active) : !existing.active;
        const updated = await prisma.customer.update({
          where: { id },
          data: { active: targetActive },
        });

        await logAudit({
          storeId: auth.session.storeId,
          userId: auth.session.userId,
          branchId: auth.session.branchId,
          action: targetActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
          entity: "customers",
          entityId: id,
          details: { name: existing.name, active: targetActive },
          ipAddress: clientIp,
        });

        const { password: _, ...safe } = updated;
        return NextResponse.json({ success: true, message: `Patient '${updated.name}' status updated.`, data: safe });
      }

      const name = (body.name || existing.name).trim();
      const phone = (body.phone || existing.phone).trim();
      const email = body.email ? body.email.trim().toLowerCase() : null;
      const address = body.address !== undefined ? body.address : existing.address;
      const dob = body.dob ? new Date(body.dob) : existing.dob;
      const active = body.active !== undefined ? Boolean(body.active) : existing.active;
      const verified = body.verified !== undefined ? Boolean(body.verified) : existing.verified;

      if (!name) return NextResponse.json({ success: false, message: "Patient name is required." }, { status: 400 });
      if (!phone || phone.length < 7) return NextResponse.json({ success: false, message: "Valid mobile phone required." }, { status: 400 });

      // Unique phone & email checks
      const dupPhone = await prisma.customer.findFirst({ where: { phone, id: { not: id } } });
      if (dupPhone) return NextResponse.json({ success: false, message: "Phone number is already registered to another patient." }, { status: 409 });

      if (email) {
        const dupEmail = await prisma.customer.findFirst({ where: { email, id: { not: id } } });
        if (dupEmail) return NextResponse.json({ success: false, message: "Email is already registered to another patient." }, { status: 409 });
      }

      const updateData: any = {
        name,
        phone,
        email,
        address,
        dob: dob && !isNaN(dob.getTime()) ? dob : null,
        active,
        verified,
      };

      if (body.password && body.password.trim()) {
        if (body.password.trim().length < 6) return NextResponse.json({ success: false, message: "Password min 6 chars." }, { status: 400 });
        updateData.password = await hashPassword(body.password.trim());
      }

      const updated = await prisma.customer.update({
        where: { id },
        data: updateData,
      });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "USER_UPDATED",
        entity: "customers",
        entityId: id,
        details: { name: updated.name, phone: updated.phone },
        ipAddress: clientIp,
      });

      const { password: _, ...safe } = updated;
      return NextResponse.json({ success: true, message: `Patient '${updated.name}' updated successfully.`, data: safe });
    }

    return NextResponse.json({ success: false, message: `Unsupported account type: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error("PUT /api/admin/users error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to update user account: " + (err?.message || "Internal error") },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users
 * Removes an account with strict Last-Admin & Self-Delete safeguards (Module 1.5.2).
 */
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_users" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const clientIp = getClientIp(req);
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "", 10);
  const type = searchParams.get("type") || "staff";

  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Valid target account ID is required." }, { status: 400 });
  }

  try {
    // ── 1. DELETE STAFF USER ──────────────────────────────────────────
    if (type === "staff") {
      // Safeguard 1: Cannot delete your own active account
      if (id === auth.session.userId) {
        return NextResponse.json(
          { success: false, message: "Security Protection: You cannot delete your own logged-in account." },
          { status: 400 }
        );
      }

      const userWhere: any = { id };
      if (auth.session.storeId) userWhere.storeId = auth.session.storeId;

      const targetUser = await prisma.user.findFirst({
        where: userWhere,
        include: {
          _count: {
            select: { salesCreated: true, stockAdjustments: true, auditLogs: true },
          },
        },
      });

      if (!targetUser) {
        return NextResponse.json({ success: false, message: "Staff user not found." }, { status: 404 });
      }

      // Privilege check: Non-admin users cannot delete an Admin account
      if (auth.session.role !== "admin" && targetUser.role === "admin") {
        return NextResponse.json(
          { success: false, message: "Security Protection: Non-admin users cannot delete a Super Admin account." },
          { status: 403 }
        );
      }

      // Safeguard 2: Module 1.5.2 - Last-Admin Protection
      if (targetUser.role.toLowerCase() === "admin") {
        const totalAdmins = await prisma.user.count({
          where: {
            role: "admin",
            ...(auth.session.storeId ? { storeId: auth.session.storeId } : {}),
          },
        });
        if (totalAdmins <= 1) {
          return NextResponse.json(
            { success: false, message: "Security Protection: Cannot delete the last Super Admin in the system." },
            { status: 400 }
          );
        }
      }

      // Safeguard 3: If user has created sales or stock adjustments, soft-deactivate instead of hard delete
      const hasHistory = (targetUser._count.salesCreated || 0) > 0 || (targetUser._count.stockAdjustments || 0) > 0;

      if (hasHistory) {
        await prisma.user.update({
          where: { id },
          data: { active: false },
        });

        await logAudit({
          storeId: auth.session.storeId,
          userId: auth.session.userId,
          branchId: targetUser.branchId ?? auth.session.branchId,
          action: "USER_DEACTIVATED",
          entity: "users",
          entityId: targetUser.id,
          details: { username: targetUser.username, reason: "Deactivated due to historical sales/stock records" },
          ipAddress: clientIp,
        });

        return NextResponse.json({
          success: true,
          message: `User '${targetUser.name}' has historical sales/stock records and was safely deactivated rather than deleted.`,
        });
      }

      // Safe to hard delete
      await prisma.user.delete({ where: { id } });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: targetUser.branchId ?? auth.session.branchId,
        action: "USER_DELETED",
        entity: "users",
        entityId: targetUser.id,
        details: { username: targetUser.username, name: targetUser.name, role: targetUser.role },
        ipAddress: clientIp,
      });

      return NextResponse.json({
        success: true,
        message: `Staff user '${targetUser.name}' was permanently deleted.`,
      });
    }

    // ── 2. DELETE SUPPLIER USER ───────────────────────────────────────
    if (type === "supplier") {
      const target = await prisma.supplierUser.findUnique({ where: { id } });
      if (!target) {
        return NextResponse.json({ success: false, message: "Supplier user not found." }, { status: 404 });
      }

      await prisma.supplierUser.delete({ where: { id } });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "USER_DELETED",
        entity: "supplier_users",
        entityId: id,
        details: { username: target.username, supplierId: target.supplierId },
        ipAddress: clientIp,
      });

      return NextResponse.json({ success: true, message: `Supplier portal user '${target.name}' deleted.` });
    }

    // ── 3. DELETE PATIENT / CUSTOMER ──────────────────────────────────
    if (type === "patient") {
      const target = await prisma.customer.findUnique({
        where: { id },
        include: { _count: { select: { sales: true, returns: true } } },
      });
      if (!target) {
        return NextResponse.json({ success: false, message: "Patient account not found." }, { status: 404 });
      }

      const hasHistory = (target._count.sales || 0) > 0 || (target._count.returns || 0) > 0;
      if (hasHistory) {
        await prisma.customer.update({
          where: { id },
          data: { active: false },
        });

        await logAudit({
          storeId: auth.session.storeId,
          userId: auth.session.userId,
          branchId: auth.session.branchId,
          action: "USER_DEACTIVATED",
          entity: "customers",
          entityId: id,
          details: { name: target.name, reason: "Deactivated due to historical sales" },
          ipAddress: clientIp,
        });

        return NextResponse.json({
          success: true,
          message: `Patient '${target.name}' has historical sales and was safely deactivated.`,
        });
      }

      await prisma.customer.delete({ where: { id } });

      await logAudit({
        storeId: auth.session.storeId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "USER_DELETED",
        entity: "customers",
        entityId: id,
        details: { name: target.name, phone: target.phone },
        ipAddress: clientIp,
      });

      return NextResponse.json({ success: true, message: `Patient '${target.name}' deleted.` });
    }

    return NextResponse.json({ success: false, message: `Unsupported account type: ${type}` }, { status: 400 });
  } catch (err: any) {
    console.error("DELETE /api/admin/users error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to delete account: " + (err?.message || "Internal error") },
      { status: 500 }
    );
  }
}

