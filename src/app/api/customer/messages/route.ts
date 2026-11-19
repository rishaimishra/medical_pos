import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCustomerTargetStore, verifyCustomerRequest } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";
import { requireCustomerPortalFeature, requireStoreFeature } from "@/lib/entitlements";

/**
 * MODULE 2.20.1: Customer Side Two-Way Messages Endpoint
 * Allows authenticated customers to view staff replies, send follow-up inquiries, and mark staff replies as read.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];
  const { searchParams } = new URL(req.url);
  const storeIdParam = searchParams.get("storeId");
  const filterStoreId =
    storeIdParam && storeIdParam !== "all" && !isNaN(Number(storeIdParam))
      ? Number(storeIdParam)
      : null;

  const msgGate = await requireCustomerPortalFeature(
    auth.session.customerId,
    "twoWayMessagingInboxes",
    { linkedCustomerIds: linkedIds, targetStoreId: filterStoreId }
  );
  if (!msgGate.allowed) return msgGate.response!;

  try {
    const recentMsgs = await prisma.patientMessage.findMany({
      where: {
        customerId: { in: linkedIds },
        ...(filterStoreId
          ? { OR: [{ storeId: filterStoreId }, { storeId: null, customer: { storeId: filterStoreId } }] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 150,
      include: {
        creator: { select: { name: true } },
        store: { select: { id: true, storeName: true } },
      },
    });
    const msgs = recentMsgs.slice().reverse();

    const unreadFromPharmacyCount = msgs.filter((m) => m.direction === "out" && !m.isRead).length;

    return NextResponse.json({
      success: true,
      unreadFromPharmacyCount,
      messages: msgs.map((m) => ({
        id: m.id,
        storeId: m.storeId,
        storeName: m.store?.storeName || null,
        direction: m.direction,
        message: m.message,
        hasFile: Boolean(m.filePath),
        fileName: m.fileName,
        fileUrl: m.filePath ? `/api/prescriptions/file/${m.id}` : null,
        isRead: m.isRead,
        senderLabel: m.direction === "out" ? m.creator?.name || "Pharmacy Support" : "You",
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/customer/messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load support messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const msgGate = await requireCustomerPortalFeature(
    auth.session.customerId,
    "twoWayMessagingInboxes"
  );
  if (!msgGate.allowed) return msgGate.response!;

  try {
    const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];
    const body = await req.json();
    const messageText = String(body.message || "").trim();
    if (!messageText) {
      return NextResponse.json({ success: false, message: "Message cannot be empty." }, { status: 400 });
    }

    const requestedStoreId = body.storeId ? parseInt(String(body.storeId), 10) : null;
    const resolvedStore = await resolveCustomerTargetStore(
      auth.session.customerId,
      linkedIds,
      requestedStoreId && !isNaN(requestedStoreId) ? requestedStoreId : null
    );
    const targetGate = await requireStoreFeature(resolvedStore.storeId, "twoWayMessagingInboxes", {
      forExternalPortal: true,
    });
    if (!targetGate.allowed) return targetGate.response!;

    const created = await prisma.patientMessage.create({
      data: {
        storeId: resolvedStore.storeId,
        customerId: resolvedStore.targetCustomerId,
        direction: "in",
        message: messageText,
        isRead: false,
      },
    });

    if (resolvedStore.storeEmail) {
      sendEmail({
        to: resolvedStore.storeEmail,
        subject: `[Patient Inquiry] ${auth.session.name} (${auth.session.phone})`,
        html: `<p><strong>Patient:</strong> ${escapeHtml(auth.session.name)} (${escapeHtml(auth.session.phone)})</p><p>${escapeHtml(messageText).replace(/\n/g, "<br/>")}</p>`,
        text: `Patient Inquiry from ${auth.session.name} (${auth.session.phone}):\n\n${messageText}`,
        storeId: resolvedStore.storeId,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: "Message sent to pharmacy support.",
        data: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/customer/messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const msgGate = await requireCustomerPortalFeature(
    auth.session.customerId,
    "twoWayMessagingInboxes"
  );
  if (!msgGate.allowed) return msgGate.response!;

  const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];

  try {
    const body = await req.json();
    if (body.markAllRead) {
      await prisma.patientMessage.updateMany({
        where: { customerId: { in: linkedIds }, direction: "out", isRead: false },
        data: { isRead: true },
      });
    } else if (body.id) {
      const id = parseInt(String(body.id), 10);
      const existing = await prisma.patientMessage.findUnique({ where: { id } });
      if (!existing || !linkedIds.includes(existing.customerId)) {
        return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
      }
      if (existing.direction === "out") {
        await prisma.patientMessage.update({ where: { id }, data: { isRead: true } });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH /api/customer/messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to mark messages read" },
      { status: 500 }
    );
  }
}
