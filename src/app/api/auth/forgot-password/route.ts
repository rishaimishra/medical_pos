import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/audit";
import { verifySameOrigin } from "@/lib/platformConfig";
import {
  isValidAuthPanel,
  requestPanelPasswordResetOtp,
  verifyOrResetPanelPassword,
} from "@/lib/passwordReset";

/**
 * Universal Email-OTP Forgot Password API (`POST /api/auth/forgot-password`)
 * Supports all 4 isolated authentication panels:
 * - `"admin"` (Store Admin / Staff / Cashier / Accountant)
 * - `"super_admin"` (Platform CEO / Super Admin / Finance / Support)
 * - `"customer"` (Patient / Customer Portal — syncs across linked stores by mobile/email)
 * - `"supplier"` (Supplier / Distributor Portal)
 */
export async function POST(req: NextRequest) {
  const csrf = verifySameOrigin(req);
  if (!csrf.ok && csrf.response) return csrf.response;

  const ipAddress = getClientIp(req);

  try {
    const body = await req.json();
    const rawPanel = String(body.panel || "").trim().toLowerCase();
    const action = String(body.action || "request_otp").trim().toLowerCase();
    const identifier = String(body.identifier || body.email || body.username || body.phone || "").trim();

    if (!isValidAuthPanel(rawPanel)) {
      return NextResponse.json(
        { success: false, message: "Invalid portal panel specified." },
        { status: 400 }
      );
    }

    if (!identifier) {
      return NextResponse.json(
        { success: false, message: "Please enter your registered username, email, or mobile." },
        { status: 400 }
      );
    }

    if (action === "request_otp") {
      const result = await requestPanelPasswordResetOtp({
        panel: rawPanel,
        identifier,
        ipAddress,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (action === "verify_otp") {
      const otp = String(body.otp || "").trim();
      const result = await verifyOrResetPanelPassword({
        panel: rawPanel,
        identifier,
        otp,
        mode: "verify_only",
        ipAddress,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    if (action === "reset_password") {
      const otp = String(body.otp || "").trim();
      const newPassword = String(body.newPassword || "");
      const confirmPassword = body.confirmPassword !== undefined ? String(body.confirmPassword) : null;

      if (confirmPassword !== null && confirmPassword !== newPassword) {
        return NextResponse.json(
          { success: false, message: "New Password and Confirm Password do not match." },
          { status: 400 }
        );
      }

      const result = await verifyOrResetPanelPassword({
        panel: rawPanel,
        identifier,
        otp,
        newPassword,
        mode: "reset",
        ipAddress,
      });
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json(
      { success: false, message: "Unsupported forgot-password action." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[POST /api/auth/forgot-password Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to process password reset request." },
      { status: 500 }
    );
  }
}
