import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";

/**
 * MODULE 2.19.1: Email Verification Link Handler
 * Verifies token and redirects to /customer/login?verified=1 (or returns JSON for API callers).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = (searchParams.get("token") || "").trim();
  const wantsJson = (req.headers.get("accept") || "").includes("application/json");

  if (!token) {
    if (wantsJson) {
      return NextResponse.json({ success: false, message: "Missing verification token." }, { status: 400 });
    }
    return NextResponse.redirect(new URL("/customer/login?verifyError=missing_token", req.url));
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: { verifyToken: token },
    });

    if (!customer) {
      if (wantsJson) {
        return NextResponse.json({ success: false, message: "Invalid or already used verification token." }, { status: 400 });
      }
      return NextResponse.redirect(new URL("/customer/login?verifyError=invalid_token", req.url));
    }

    if (
      customer.verifySentAt &&
      Date.now() - customer.verifySentAt.getTime() > 24 * 60 * 60 * 1000
    ) {
      if (wantsJson) {
        return NextResponse.json({ success: false, expired: true, message: "Verification link expired." }, { status: 400 });
      }
      return NextResponse.redirect(new URL("/customer/login?verifyError=expired", req.url));
    }

    await prisma.customer.updateMany({
      where: {
        OR: [{ id: customer.id }, { phone: customer.phone }],
      },
      data: {
        verified: true,
        verifiedAt: new Date(),
        verifyToken: null,
      },
    });

    if (wantsJson) {
      return NextResponse.json({ success: true, verified: true, message: "Email verified successfully!" });
    }
    return NextResponse.redirect(new URL("/customer/login?verified=1", req.url));
  } catch (err: any) {
    if (wantsJson) {
      return NextResponse.json({ success: false, message: err?.message || "Verification failed" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/customer/login?verifyError=server_error", req.url));
  }
}
