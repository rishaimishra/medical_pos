import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessPage } from "@/lib/rbac";
import { escapeHtml, sendEmail } from "@/lib/email";
import { logAudit, getClientIp } from "@/lib/audit";
import { requireStoreFeature } from "@/lib/entitlements";

/**
 * MODULE 2.17.2: Pharmacy Admin Supplier Messaging Inbox API
 * - GET: Lists all two-way supplier messages with supplier directory and unread count
 * - POST: Sends a direct outbound message from pharmacy admin to a supplier (direction = "out")
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to messaging inbox denied" },
      { status: 403 }
    );
  }

  const msgGate = await requireStoreFeature(auth.session.storeId, "twoWayMessagingInboxes");
  if (!msgGate.allowed) return msgGate.response!;

  const { searchParams } = new URL(req.url);
  const supplierIdParam = searchParams.get("supplierId");
  const statusParam = (searchParams.get("status") || "all").toLowerCase();
  const directionParam = (searchParams.get("direction") || "all").toLowerCase();
  const search = (searchParams.get("search") || "").trim();

  try {
    const userStoreId = auth.session.storeId ?? null;
    const smStoreScope: any = userStoreId
      ? {
          OR: [
            { storeId: userStoreId },
            { storeId: null, supplier: { storeId: userStoreId } },
          ],
        }
      : {};

    const where: any = { ...smStoreScope };

    if (supplierIdParam && supplierIdParam !== "all") {
      const sId = parseInt(supplierIdParam, 10);
      if (!isNaN(sId)) where.supplierId = sId;
    }

    if (statusParam !== "all") {
      where.status = statusParam;
    }

    if (directionParam === "in" || directionParam === "out") {
      where.direction = directionParam;
    }

    if (search) {
      const searchCond = [
        { subject: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
        { supplierName: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
      ];
      where.AND = [...(where.AND || []), { OR: searchCond }];
    }

    const [messages, unreadCount, suppliers] = await Promise.all([
      prisma.supplierMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 150,
        include: {
          supplier: {
            select: { id: true, name: true, phone: true, email: true, contact: true },
          },
        },
      }),
      prisma.supplierMessage.count({
        where: { direction: "in", status: "unread", ...smStoreScope },
      }),
      prisma.supplier.findMany({
        where: userStoreId ? { storeId: userStoreId } : undefined,
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, phone: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      messages,
      unreadCount,
      suppliers,
    });
  } catch (error: any) {
    console.error("GET /api/admin/messages error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch supplier messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to messaging inbox denied" },
      { status: 403 }
    );
  }

  const msgGate = await requireStoreFeature(auth.session.storeId, "twoWayMessagingInboxes");
  if (!msgGate.allowed) return msgGate.response!;

  try {
    const body = await req.json();
    const supplierId = parseInt(String(body.supplierId || ""), 10);
    const subject = String(body.subject || "").trim().slice(0, 255);
    const message = String(body.message || "").trim();

    if (!supplierId || isNaN(supplierId)) {
      return NextResponse.json({ success: false, message: "Valid supplierId is required." }, { status: 400 });
    }
    if (!subject || !message) {
      return NextResponse.json(
        { success: false, message: "Subject and message content are required." },
        { status: 400 }
      );
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || (auth.session.storeId && supplier.storeId !== auth.session.storeId)) {
      return NextResponse.json({ success: false, message: "Supplier not found." }, { status: 404 });
    }

    const created = await prisma.supplierMessage.create({
      data: {
        storeId: auth.session.storeId ?? supplier.storeId ?? null,
        supplierId: supplier.id,
        supplierName: supplier.name,
        senderEmail: auth.session.email,
        subject,
        message,
        direction: "out",
        status: "unread",
      },
      include: {
        supplier: {
          select: { id: true, name: true, phone: true, email: true, contact: true },
        },
      },
    });

    await logAudit({
      storeId: auth.session.storeId ?? null,
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "SUPPLIER_MESSAGE_SENT",
      entity: "supplier_message",
      entityId: created.id,
      details: { supplierId: supplier.id, supplierName: supplier.name, subject },
      ipAddress: getClientIp(req),
    });

    if (supplier.email) {
      sendEmail({
        to: supplier.email,
        subject: `[Pharmacy Message] ${subject}`,
        html: `<p>Dear <strong>${escapeHtml(supplier.name)}</strong>,</p><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p><p style="color:#64748b;font-size:12px;">Reply directly inside your Medical POS Supplier Portal.</p>`,
        text: `Message from Pharmacy (${auth.session.name}):\nSubject: ${subject}\n\n${message}`,
        storeId: auth.session.storeId,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: `Message sent to ${supplier.name}.`,
        data: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/admin/messages error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to send message to supplier" },
      { status: 500 }
    );
  }
}
