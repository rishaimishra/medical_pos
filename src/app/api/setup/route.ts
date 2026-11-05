import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runInTransaction, getDatabaseHealth } from "@/lib/db-transaction";
import { sendSetupOtpEmail } from "@/lib/email";
import {
  SESSION_COOKIE_NAME,
  buildUserSessionPayload,
  createSessionToken,
  checkBruteForceLockout,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from "@/lib/auth";
import { getClientIp } from "@/lib/audit";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const DEFAULT_DOSAGE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Injection",
  "Infusion",
  "Suppository",
  "Powder",
  "Granules",
  "Cream",
  "Ointment",
  "Gel",
  "Lotion",
  "Drop",
  "Inhaler",
  "Patch",
  "Spray",
  "Emulsion",
  "Solution",
  "Other",
];

/**
 * Resolves the current user's in-progress store setup draft:
 * 1. By `setup_session_token` cookie (matching an incomplete `Settings` row on this browser).
 * 2. Or if no cookie is present, checks if there is an unfinished `Settings` row (`setupDone: false`)
 *    ONLY if requested for resume; otherwise starts a clean Step 1 for a new store owner!
 */
export async function GET(request: NextRequest) {
  try {
    const clientToken = request.cookies.get("setup_session_token")?.value;
    const { searchParams } = new URL(request.url);
    const resumeHint = searchParams.get("resume")?.trim();

    let settings = null;

    if (clientToken) {
      settings = await prisma.settings.findFirst({
        where: {
          setupToken: clientToken,
          setupDone: false,
        },
      });
    }

    if (!settings && resumeHint) {
      // Allow finding an incomplete store setup by storeEmail, storeName, or admin email/username
      const matchedAdmin = await prisma.user.findFirst({
        where: {
          role: "admin",
          OR: [
            { email: { equals: resumeHint, mode: "insensitive" } },
            { username: { equals: resumeHint, mode: "insensitive" } },
          ],
        },
        include: { store: true },
      });

      if (matchedAdmin?.store && !matchedAdmin.store.setupDone) {
        settings = matchedAdmin.store;
      } else {
        settings = await prisma.settings.findFirst({
          where: {
            setupDone: false,
            OR: [
              { storeEmail: { equals: resumeHint, mode: "insensitive" } },
              { storeName: { equals: resumeHint, mode: "insensitive" } },
            ],
          },
        });
      }
    }

    // If no active draft for this browser, return a clean Step 1 so ANY new user can register their own store
    if (!settings) {
      return NextResponse.json({
        setupDone: false,
        currentStep: 1,
        requiresUnlock: false,
        adminConfigured: false,
        adminEmailHint: null,
        draft: {
          storeName: "",
          storeAddress: "",
          storePhone: "",
          storeEmail: "",
          storeGst: "",
          storeDl: "",
          currency: "₹",
          lowQty: 10,
          expiryDays: 90,
          adminName: "",
          adminUsername: "",
          adminEmail: "",
        },
      });
    }

    const adminUser = await prisma.user.findFirst({
      where: { storeId: settings.id, role: "admin" },
      select: { id: true, name: true, username: true, email: true },
    });

    const isTokenValid = Boolean(
      settings.setupToken && clientToken && settings.setupToken === clientToken
    );

    const requiresUnlock = settings.setupStep > 1 && !isTokenValid;

    // Security Gate: If session requires unlock from a new device/cleared cache,
    // NEVER expose unauthenticated plaintext store and admin credentials!
    if (requiresUnlock) {
      return NextResponse.json({
        setupDone: false,
        setupId: settings.id,
        currentStep: settings.setupStep || 1,
        requiresUnlock: true,
        adminConfigured: Boolean(adminUser),
        adminEmailHint: adminUser?.email ? maskEmail(adminUser.email) : null,
        draft: {
          storeName: settings.storeName || "",
          currency: settings.currency || "₹",
        },
      });
    }

    return NextResponse.json({
      setupDone: false,
      setupId: settings.id,
      currentStep: settings.setupStep || 1,
      requiresUnlock: false,
      adminConfigured: Boolean(adminUser),
      adminEmailHint: adminUser?.email ? maskEmail(adminUser.email) : null,
      draft: {
        storeName: settings.storeName || "",
        storeAddress: settings.storeAddress || "",
        storePhone: settings.storePhone || "",
        storeEmail: settings.storeEmail || "",
        storeGst: settings.storeGst || "",
        storeDl: settings.storeDl || "",
        currency: settings.currency || "₹",
        lowQty: typeof settings.lowQty === "number" ? settings.lowQty : 10,
        expiryDays: typeof settings.expiryDays === "number" ? settings.expiryDays : 90,
        adminName: adminUser?.name || "",
        adminUsername: adminUser?.username || "",
        adminEmail: adminUser?.email || "",
      },
    });
  } catch (error: any) {
    console.error("Setup GET Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve setup state", details: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const clientToken = request.cookies.get("setup_session_token")?.value;

    // Locate this browser's unfinished setup draft (if any)
    let settings = clientToken
      ? await prisma.settings.findFirst({
          where: { setupToken: clientToken, setupDone: false },
        })
      : null;

    if (!settings && body.setupId) {
      settings = await prisma.settings.findFirst({
        where: { id: Number(body.setupId), setupDone: false },
      });
    }

    // Fallback for single unfinished draft in DB when resuming without cookie
    if (
      !settings &&
      action !== "save_step_1" &&
      action !== "test_db"
    ) {
      settings = await prisma.settings.findFirst({
        where: { setupDone: false },
        orderBy: { updatedAt: "desc" },
      });
    }

    // Security Gate: If existing draft has advanced beyond Step 1 (admin credentials exist),
    // mutations require valid setup_session_token matching this store draft's token.
    const isTokenValid = Boolean(
      settings && settings.setupToken && clientToken && settings.setupToken === clientToken
    );

    if (
      settings &&
      settings.setupStep > 1 &&
      !isTokenValid &&
      action !== "verify_resume" &&
      action !== "send_otp" &&
      action !== "test_db"
    ) {
      if (action === "save_step_1" && !body.setupId) {
        settings = null;
      } else {
        return NextResponse.json(
          {
            error:
              "Setup session is locked on this device. Please unlock using your Admin Password or OTP before proceeding.",
            requiresUnlock: true,
            setupId: settings.id,
          },
          { status: 401 }
        );
      }
    }

    // ------------------------------------------------------------------------
    // ACTION: save_step_1 (Create or Update Isolated Store Tenant Profile)
    // ------------------------------------------------------------------------
    if (action === "save_step_1") {
      const {
        storeName,
        storeAddress,
        storePhone,
        storeEmail,
        storeGst,
        storeDl,
        currency,
        lowQty,
        expiryDays,
      } = body;

      if (!storeName || storeName.trim().length === 0) {
        return NextResponse.json(
          { error: "Pharmacy Store Name is required." },
          { status: 400 }
        );
      }

      const parsedLowQty =
        lowQty !== undefined && lowQty !== null && !isNaN(Number(lowQty))
          ? Math.max(0, Number(lowQty))
          : 10;
      const parsedExpiryDays =
        expiryDays !== undefined && expiryDays !== null && !isNaN(Number(expiryDays))
          ? Math.max(1, Number(expiryDays))
          : 90;

      const sessionToken =
        settings?.setupToken || crypto.randomBytes(32).toString("hex");

      if (settings) {
        settings = await prisma.settings.update({
          where: { id: settings.id },
          data: {
            storeName: storeName.trim(),
            storeAddress: storeAddress?.trim() || null,
            storePhone: storePhone?.trim() || null,
            storeEmail: storeEmail?.trim() || null,
            storeGst: storeGst?.trim() || null,
            storeDl: storeDl?.trim() || null,
            currency: currency || "₹",
            lowQty: parsedLowQty,
            expiryDays: parsedExpiryDays,
            setupStep: Math.max(settings.setupStep, 2),
            setupToken: sessionToken,
            updatedAt: new Date(),
          },
        });
      } else {
        // Create a brand new isolated Store Tenant row for this store owner
        settings = await prisma.settings.create({
          data: {
            storeName: storeName.trim(),
            storeAddress: storeAddress?.trim() || null,
            storePhone: storePhone?.trim() || null,
            storeEmail: storeEmail?.trim() || null,
            storeGst: storeGst?.trim() || null,
            storeDl: storeDl?.trim() || null,
            currency: currency || "₹",
            lowQty: parsedLowQty,
            expiryDays: parsedExpiryDays,
            setupDone: false,
            setupStep: 2,
            setupToken: sessionToken,
            storage: "postgres",
          },
        });
      }

      const response = NextResponse.json({
        success: true,
        setupId: settings.id,
        nextStep: 2,
        message: "Store profile saved successfully.",
      });

      response.cookies.set("setup_session_token", sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    // ------------------------------------------------------------------------
    // ACTION: test_db (Step 3 Database Health & Diagnostics)
    // ------------------------------------------------------------------------
    if (action === "test_db") {
      const health = await getDatabaseHealth();
      return NextResponse.json({
        success: health.status === "healthy",
        health,
      });
    }

    if (!settings) {
      return NextResponse.json(
        {
          error:
            "No active store setup session found. Please start from Step 1.",
        },
        { status: 400 }
      );
    }

    // ------------------------------------------------------------------------
    // ACTION: save_step_2 (Admin Account Creation Scoped to Store Tenant)
    // ------------------------------------------------------------------------
    if (action === "save_step_2") {
      const { name, username, email, password, confirmPassword } = body;

      if (!name || !username || !email || !password) {
        return NextResponse.json(
          { error: "All admin fields are required." },
          { status: 400 }
        );
      }

      if (password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters long." },
          { status: 400 }
        );
      }

      if (password !== confirmPassword) {
        return NextResponse.json(
          { error: "Password and Confirm Password do not match." },
          { status: 400 }
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: "Invalid email address format." },
          { status: 400 }
        );
      }

      const cleanUsername = username.trim().toLowerCase();
      const cleanEmail = email.trim().toLowerCase();

      // Check if username or email is already taken by another store or account
      const conflictingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email: cleanEmail }, { username: cleanUsername }],
        },
      });

      if (conflictingUser) {
        // If this user record already belongs to this store draft, allow updating it
        const isOwnDraftUser = (conflictingUser as any).storeId === settings.id;
        if (!isOwnDraftUser) {
          return NextResponse.json(
            {
              error:
                "This username or email is already registered with another store. Please choose a different username/email.",
            },
            { status: 409 }
          );
        }
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      const existingStoreAdmin =
        conflictingUser && (conflictingUser as any).storeId === settings.id
          ? conflictingUser
          : await prisma.user.findFirst({
              where: {
                OR: [
                  { storeId: settings.id },
                  { email: cleanEmail },
                  { username: cleanUsername },
                ],
                role: "admin",
              },
            });

      if (existingStoreAdmin) {
        await prisma.user.update({
          where: { id: existingStoreAdmin.id },
          data: {
            name: name.trim(),
            username: cleanUsername,
            email: cleanEmail,
            password: hashedPassword,
            role: "admin",
            active: true,
          },
        });
      } else {
        await prisma.user.create({
          data: {
            storeId: settings.id,
            name: name.trim(),
            username: cleanUsername,
            email: cleanEmail,
            password: hashedPassword,
            role: "admin",
            active: true,
          },
        });
      }

      const sessionToken =
        settings.setupToken || crypto.randomBytes(32).toString("hex");

      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          setupStep: Math.max(settings.setupStep, 3),
          setupToken: sessionToken,
          updatedAt: new Date(),
        },
      });

      const response = NextResponse.json({
        success: true,
        nextStep: 3,
        message: "Super Admin account created successfully.",
      });

      response.cookies.set("setup_session_token", sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    // ------------------------------------------------------------------------
    // ACTION: verify_resume (Unlock via Password or OTP on new device)
    // ------------------------------------------------------------------------
    if (action === "verify_resume") {
      const { password, otp } = body;
      const ip = getClientIp(request);

      if (!settings) {
        return NextResponse.json(
          { error: "No store setup session found to unlock." },
          { status: 400 }
        );
      }

      const adminUser = await prisma.user.findFirst({
        where: { storeId: settings.id, role: "admin" },
      });

      if (!adminUser) {
        return NextResponse.json(
          { error: "No admin account configured for this store draft yet." },
          { status: 400 }
        );
      }

      // Check brute-force lockout (5 failed attempts within 15 minutes)
      const lockoutStatus = await checkBruteForceLockout(
        ip,
        "admin",
        adminUser.username,
        adminUser.email
      );

      if (lockoutStatus.locked) {
        return NextResponse.json(
          {
            error: `Too many failed unlock attempts. Please wait ${Math.ceil(
              lockoutStatus.remainingSeconds / 60
            )} minute(s) before trying again.`,
            lockedOut: true,
            remainingSeconds: lockoutStatus.remainingSeconds,
          },
          { status: 429 }
        );
      }

      let verified = false;

      if (password) {
        const matches = await bcrypt.compare(password, adminUser.password);
        if (matches) verified = true;
      }

      if (!verified && otp && settings.setupOtp) {
        const isNotExpired =
          settings.setupOtpExp && new Date() < settings.setupOtpExp;
        if (isNotExpired && settings.setupOtp.trim() === otp.trim()) {
          verified = true;
        }
      }

      if (!verified) {
        const failStatus = await recordFailedLoginAttempt(
          ip,
          "admin",
          adminUser.username,
          adminUser.email
        );

        return NextResponse.json(
          {
            error: failStatus.locked
              ? "Too many failed attempts. Session unlock locked for 15 minutes."
              : `Invalid Admin password or verification code. ${failStatus.remainingAttempts} attempt(s) remaining before 15-min lockout.`,
            lockedOut: failStatus.locked,
            remainingAttempts: failStatus.remainingAttempts,
            remainingSeconds: failStatus.remainingSeconds,
          },
          { status: failStatus.locked ? 429 : 401 }
        );
      }

      // Clear failed attempts on success
      await clearFailedLoginAttempts(
        ip,
        "admin",
        adminUser.username,
        adminUser.email
      );

      const newToken = crypto.randomBytes(32).toString("hex");
      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          setupToken: newToken,
          setupOtp: null,
          setupOtpExp: null,
        },
      });

      const response = NextResponse.json({
        success: true,
        currentStep: settings.setupStep,
        message: "Session unlocked successfully. Resuming setup.",
      });

      response.cookies.set("setup_session_token", newToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    // ------------------------------------------------------------------------
    // ACTION: send_otp (Generate & Send 6-Digit Verification PIN)
    // ------------------------------------------------------------------------
    if (action === "send_otp") {
      if (!settings) {
        return NextResponse.json(
          { error: "No store setup session found." },
          { status: 400 }
        );
      }

      const adminUser = await prisma.user.findFirst({
        where: { storeId: settings.id, role: "admin" },
      });

      if (!adminUser || !adminUser.email) {
        return NextResponse.json(
          { error: "No admin email configured to receive OTP." },
          { status: 400 }
        );
      }

      // 60-second cooldown check
      if (settings.setupOtpExp) {
        const remainingTimeMs = settings.setupOtpExp.getTime() - Date.now();
        // 15 min OTP: if remaining time > 14 mins, last request was < 60s ago
        if (remainingTimeMs > 14 * 60 * 1000) {
          return NextResponse.json(
            { error: "Please wait 60 seconds before requesting another verification code." },
            { status: 429 }
          );
        }
      }

      const generatedOtp = Math.floor(
        100000 + Math.random() * 900000
      ).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins per spec

      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          setupOtp: generatedOtp,
          setupOtpExp: expiresAt,
        },
      });

      const emailResult = await sendSetupOtpEmail(
        adminUser.email,
        generatedOtp,
        settings.storeName
      );

      return NextResponse.json({
        success: true,
        emailSent: emailResult.success,
        emailError: emailResult.error,
        message: `6-digit verification code sent to ${maskEmail(
          adminUser.email
        )}`,
        devOtpPreview:
          process.env.NODE_ENV === "development" ? generatedOtp : undefined,
      });
    }

    // ------------------------------------------------------------------------
    // ACTION: advance_to_step_4 (Save Step 3 Completion)
    // ------------------------------------------------------------------------
    if (action === "advance_to_step_4") {
      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          setupStep: Math.max(settings.setupStep, 4),
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        currentStep: 4,
        message: "Step 3 verified. Proceeding to Step 4 confirmation.",
      });
    }

    // ------------------------------------------------------------------------
    // ACTION: confirm_finalize (Step 4 Finalize Store Setup & Auto-Login Owner)
    // ------------------------------------------------------------------------
    if (action === "confirm_finalize") {
      const adminUser = await prisma.user.findFirst({
        where: { storeId: settings.id, role: "admin", active: true },
      });

      if (!adminUser) {
        return NextResponse.json(
          {
            error:
              "Cannot finalize setup without an active administrator account.",
          },
          { status: 400 }
        );
      }

      let createdMainBranchId: number | null = null;

      await runInTransaction(async (tx) => {
        // 1. Seed 20 dosage forms in a single fast batch query (single network round-trip)
        await tx.category.createMany({
          data: DEFAULT_DOSAGE_FORMS.map((name) => ({ name, type: "dosage" })),
          skipDuplicates: true,
        });

        // 2. Create Primary Branch (MAIN) scoped strictly to this Store Tenant (storeId = settings.id)
        const existingMain = await tx.branch.findFirst({
          where: { storeId: settings.id, code: "MAIN" },
        });

        const mainBranch = existingMain
          ? await tx.branch.update({
              where: { id: existingMain.id },
              data: {
                name: settings.storeName,
                address: settings.storeAddress,
                phone: settings.storePhone,
                email: settings.storeEmail,
                gstNo: settings.storeGst,
                dlNo: settings.storeDl,
                isMain: true,
                active: true,
              },
            })
          : await tx.branch.create({
              data: {
                storeId: settings.id,
                code: "MAIN",
                name: settings.storeName,
                address: settings.storeAddress,
                phone: settings.storePhone,
                email: settings.storeEmail,
                gstNo: settings.storeGst,
                dlNo: settings.storeDl,
                isMain: true,
                active: true,
              },
            });

        createdMainBranchId = mainBranch.id;

        // 3. Mark this Store Tenant setup as completed
        await tx.settings.update({
          where: { id: settings.id },
          data: {
            setupDone: true,
            setupStep: 4,
            setupToken: null,
            setupOtp: null,
            setupOtpExp: null,
            updatedAt: new Date(),
          },
        });

        // 4. Log initial audit trail entry scoped to this Store Tenant
        await tx.auditLog.create({
          data: {
            storeId: settings.id,
            userId: adminUser.id,
            branchId: mainBranch.id,
            action: "SETUP_COMPLETED",
            entity: "settings",
            entityId: settings.id,
            details: `Store setup finalized for '${settings.storeName}'. Primary MAIN branch and 20 dosage categories initialized.`,
          },
        });
      });

      // Automatically issue authenticated admin session cookie for this store owner
      const sessionPayload = buildUserSessionPayload(
        {
          ...adminUser,
          storeId: settings.id,
          branchId: null,
          branch: {
            code: "MAIN",
            name: settings.storeName,
            storeId: settings.id,
          },
        },
        false
      );
      const authToken = createSessionToken(sessionPayload);

      const response = NextResponse.json({
        success: true,
        storeId: settings.id,
        branchId: createdMainBranchId,
        message: "Store registered successfully! Opening your store dashboard...",
        redirectUrl: "/admin/dashboard",
      });

      response.cookies.delete("setup_session_token");
      response.cookies.set(SESSION_COOKIE_NAME, authToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 12,
      });

      return response;
    }

    // ------------------------------------------------------------------------
    // ACTION: restart_setup (Clean Reset of Current Unfinished Draft Only)
    // ------------------------------------------------------------------------
    if (action === "restart_setup") {
      await prisma.user.deleteMany({
        where: { storeId: settings.id },
      });

      await prisma.settings.delete({
        where: { id: settings.id },
      });

      const response = NextResponse.json({
        success: true,
        message: "Setup wizard reset successfully. Starting from Step 1.",
      });

      response.cookies.delete("setup_session_token");
      return response;
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Setup POST Error:", error);
    return NextResponse.json(
      {
        error:
          error?.message || "Internal server error processing setup request",
      },
      { status: 500 }
    );
  }
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}***@${domain}`;
}
