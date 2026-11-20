import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessPage } from "@/lib/rbac";
import { requireStoreFeature } from "@/lib/entitlements";
import { buildPatientMessageScope, canStaffAccessPatientMessage } from "@/lib/customerRouting";

/**
 * MODULE 2.18.2: Pharmacist / POS Prescription Requests Queue
 * - GET: Lists patient prescription uploads & order requests with customer credit/contact info
 * - PATCH: Marks prescription request as verified / processed by pharmacist
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/pos") && !canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: POS or Messages access required" },
      { status: 403 }
    );
  }

  const rxGate = await requireStoreFeature(auth.session.storeId, "patientPortalAndRxQueue");
  if (!rxGate.allowed) return rxGate.response!;

  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");
  const filter = (searchParams.get("filter") || "all").toLowerCase(); // all | unread

  try {
    const userStoreId = auth.session.storeId ?? null;
    const userBranchId = auth.session.branchId ?? null;
    const pmStoreScope = buildPatientMessageScope(userStoreId, userBranchId);

    if (idParam) {
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });
      }
      const single = await prisma.patientMessage.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              id: true,
              storeId: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              creditLimit: true,
              isChronic: true,
            },
          },
        },
      });
      if (!single || !canStaffAccessPatientMessage(auth.session, single)) {
        return NextResponse.json({ success: false, message: "Prescription request not found" }, { status: 404 });
      }
      let singleDue = 0;
      if (single.customer) {
        const [cSales, cPays] = await Promise.all([
          prisma.sale.findMany({
            where: {
              customerId: single.customerId,
              OR: [{ paymentMethod: "credit" }, { creditAmount: { gt: 0 } }],
            },
            select: { paymentMethod: true, grandTotal: true, creditAmount: true },
          }),
          prisma.customerPayment.findMany({
            where: { customerId: single.customerId },
            select: { amount: true },
          }),
        ]);
        const totalCred = cSales.reduce((acc, s) => {
          const cAmt = Number(s.creditAmount || 0);
          return acc + (cAmt > 0 ? cAmt : s.paymentMethod === "credit" ? Number(s.grandTotal) : 0);
        }, 0);
        const totalPaid = cPays.reduce((acc, p) => acc + Number(p.amount), 0);
        singleDue = Math.max(0, Number((totalCred - totalPaid).toFixed(2)));
      }
      return NextResponse.json({
        success: true,
        prescription: {
          ...single,
          customer: single.customer
            ? { ...single.customer, currentDue: singleDue }
            : null,
          fileUrl: single.filePath ? `/api/prescriptions/file/${single.id}` : null,
        },
      });
    }

    const where: any = {
      direction: "in",
      ...pmStoreScope,
    };
    if (filter === "unread") {
      where.isRead = false;
    }

    const [items, unreadCount] = await Promise.all([
      prisma.patientMessage.findMany({
        where,
        orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
        take: 50,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              creditLimit: true,
              isChronic: true,
            },
          },
        },
      }),
      prisma.patientMessage.count({
        where: { direction: "in", isRead: false, ...pmStoreScope },
      }),
    ]);

    const custIds = Array.from(new Set(items.map((i) => i.customerId)));
    const duesMap = new Map<number, number>();
    if (custIds.length > 0) {
      const [creditSales, custPayments] = await Promise.all([
        prisma.sale.findMany({
          where: {
            customerId: { in: custIds },
            OR: [{ paymentMethod: "credit" }, { creditAmount: { gt: 0 } }],
          },
          select: { customerId: true, paymentMethod: true, grandTotal: true, creditAmount: true },
        }),
        prisma.customerPayment.findMany({
          where: { customerId: { in: custIds } },
          select: { customerId: true, amount: true },
        }),
      ]);
      for (const s of creditSales) {
        if (s.customerId) {
          const cAmt = Number(s.creditAmount || 0);
          const saleDue = cAmt > 0 ? cAmt : s.paymentMethod === "credit" ? Number(s.grandTotal) : 0;
          duesMap.set(s.customerId, (duesMap.get(s.customerId) || 0) + saleDue);
        }
      }
      for (const p of custPayments) {
        duesMap.set(p.customerId, (duesMap.get(p.customerId) || 0) - Number(p.amount));
      }
    }

    return NextResponse.json({
      success: true,
      unreadCount,
      prescriptions: items.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        customer: r.customer
          ? {
              ...r.customer,
              currentDue: Math.max(0, Number((duesMap.get(r.customerId) || 0).toFixed(2))),
            }
          : null,
        message: r.message,
        hasFile: Boolean(r.filePath),
        fileName: r.fileName,
        fileType: r.fileType,
        fileUrl: r.filePath ? `/api/prescriptions/file/${r.id}` : null,
        isRead: r.isRead,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/admin/prescriptions error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch prescription queue" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/pos") && !canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: POS or Messages access required" },
      { status: 403 }
    );
  }

  const rxGate = await requireStoreFeature(auth.session.storeId, "patientPortalAndRxQueue");
  if (!rxGate.allowed) return rxGate.response!;

  try {
    const body = await req.json();
    const id = parseInt(String(body.id || ""), 10);
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: "Valid prescription message ID required" }, { status: 400 });
    }

    const existing = await prisma.patientMessage.findUnique({
      where: { id },
      include: { customer: { select: { storeId: true } } },
    });
    if (!canStaffAccessPatientMessage(auth.session, existing)) {
      return NextResponse.json({ success: false, message: "Prescription request not found" }, { status: 404 });
    }

    const updated = await prisma.patientMessage.update({
      where: { id },
      data: { isRead: body.isRead !== undefined ? Boolean(body.isRead) : true },
    });

    return NextResponse.json({
      success: true,
      prescription: updated,
    });
  } catch (error: any) {
    console.error("PATCH /api/admin/prescriptions error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update prescription status" },
      { status: 500 }
    );
  }
}
