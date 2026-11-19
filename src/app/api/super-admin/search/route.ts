import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";

/**
 * MODULE 3.2.2: Global Super Admin Quick-Search API (`Ctrl+K` Command Palette)
 * Searches across Store Tenants (name, GSTIN, owner email), Branches (code, name, DL/GSTIN),
 * Subscription Plans, and SaaS Invoices (`SUB-INV-...`).
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({
      success: true,
      stores: [],
      branches: [],
      plans: [],
      invoices: [],
    });
  }

  try {
    const [stores, branches, plans, invoices] = await Promise.all([
      prisma.settings.findMany({
        where: {
          AND: [
            { OR: [{ setupDone: true }, { branches: { some: {} } }] },
            {
              OR: [
                { storeName: { contains: q, mode: "insensitive" } },
                { storeGst: { contains: q, mode: "insensitive" } },
                { storeEmail: { contains: q, mode: "insensitive" } },
                { ownerEmail: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
        take: 6,
        orderBy: { id: "asc" },
        select: {
          id: true,
          storeName: true,
          storeGst: true,
          storeStatus: true,
          city: true,
          state: true,
        },
      }),
      prisma.branch.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { gstNo: { contains: q, mode: "insensitive" } },
            { dlNo: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 6,
        orderBy: { id: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          storeId: true,
          active: true,
          store: { select: { storeName: true } },
        },
      }),
      prisma.subscriptionPlan.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { razorpayPlanId: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        select: { id: true, code: true, name: true, priceInr: true, billingCycle: true },
      }),
      prisma.subscriptionPayment.findMany({
        where: {
          OR: [
            { invoiceNo: { contains: q, mode: "insensitive" } },
            { razorpayPaymentId: { contains: q, mode: "insensitive" } },
            { razorpayOrderId: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNo: true,
          storeId: true,
          totalAmount: true,
          status: true,
          store: { select: { storeName: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      stores,
      branches,
      plans: plans.map((p) => ({ ...p, priceInr: Number(p.priceInr) })),
      invoices: invoices.map((i) => ({ ...i, totalAmount: Number(i.totalAmount) })),
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/search Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Search failed" },
      { status: 500 }
    );
  }
}
