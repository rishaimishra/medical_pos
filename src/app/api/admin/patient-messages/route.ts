import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessPage } from "@/lib/rbac";
import { sendEmail, escapeHtml } from "@/lib/email";
import { logAudit, getClientIp } from "@/lib/audit";
import { deletePrescriptionFile } from "@/lib/prescriptionFiles";
import { requireStoreFeature } from "@/lib/entitlements";
import { buildPatientMessageScope, canStaffAccessPatientMessage } from "@/lib/customerRouting";

/**
 * MODULE 2.20.1: Patient Message Inbox API (Admin / Staff)
 * - GET: Per-patient conversation summaries + chronological thread for selected customerId + totalUnreadCount
 * - POST: Sends staff reply (direction = "out") to patient and triggers email notification
 * - PATCH: Marks individual message or full customer conversation as read/unread
 * - DELETE: Deletes a message or full patient conversation (and removes stored attachment files safely)
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to patient message inbox denied" },
      { status: 403 }
    );
  }

  const msgGate = await requireStoreFeature(auth.session.storeId, "twoWayMessagingInboxes");
  if (!msgGate.allowed) return msgGate.response!;

  const { searchParams } = new URL(req.url);
  const customerIdParam = searchParams.get("customerId");
  const search = (searchParams.get("search") || "").trim().toLowerCase();

  try {
    const userStoreId = auth.session.storeId ?? null;
    const userBranchId = auth.session.branchId ?? null;
    const pmStoreScope = buildPatientMessageScope(userStoreId, userBranchId);

    const [allMessages, totalUnreadCount, customers] = await Promise.all([
      prisma.patientMessage.findMany({
        where: pmStoreScope,
        orderBy: { createdAt: "desc" },
        take: 500,
        include: {
          customer: {
            select: { id: true, name: true, phone: true, email: true, isChronic: true },
          },
          creator: {
            select: { id: true, name: true, role: true },
          },
        },
      }),
      prisma.patientMessage.count({
        where: { direction: "in", isRead: false, ...pmStoreScope },
      }),
      prisma.customer.findMany({
        where: { active: true, ...(userStoreId ? { storeId: userStoreId } : {}) },
        orderBy: { name: "asc" },
        take: 100,
        select: { id: true, name: true, phone: true, email: true },
      }),
    ]);

    // Group conversations per patient from bounded recent feed
    const convMap = new Map<
      number,
      {
        customerId: number;
        name: string;
        phone: string;
        email: string | null;
        isChronic: boolean;
        unreadCount: number;
        totalCount: number;
        lastMessage: string;
        lastFileName: string | null;
        lastAt: string;
      }
    >();

    for (const m of allMessages) {
      const cId = m.customerId;
      const isUnreadInbound = m.direction === "in" && !m.isRead;

      const existing = convMap.get(cId);
      if (!existing) {
        convMap.set(cId, {
          customerId: cId,
          name: m.customer?.name || `Customer #${cId}`,
          phone: m.customer?.phone || "",
          email: m.customer?.email || null,
          isChronic: Boolean(m.customer?.isChronic),
          unreadCount: isUnreadInbound ? 1 : 0,
          totalCount: 1,
          lastMessage: m.message || (m.fileName ? `Attachment: ${m.fileName}` : ""),
          lastFileName: m.fileName,
          lastAt: m.createdAt.toISOString(),
        });
      } else {
        existing.totalCount += 1;
        if (isUnreadInbound) existing.unreadCount += 1;
      }
    }

    let conversations = Array.from(convMap.values());
    if (search) {
      conversations = conversations.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.phone.toLowerCase().includes(search) ||
          c.lastMessage.toLowerCase().includes(search)
      );
    }

    const selectedCustomerId = customerIdParam
      ? parseInt(customerIdParam, 10)
      : conversations[0]?.customerId || null;

    const threadRows =
      selectedCustomerId && !isNaN(selectedCustomerId)
        ? await prisma.patientMessage.findMany({
            where: { customerId: selectedCustomerId, ...pmStoreScope },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 200,
            include: {
              creator: {
                select: { id: true, name: true, role: true },
              },
            },
          })
        : [];

    const thread = threadRows
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        customerId: m.customerId,
        direction: m.direction,
        message: m.message,
        hasFile: Boolean(m.filePath),
        fileName: m.fileName,
        fileType: m.fileType,
        fileUrl: m.filePath ? `/api/prescriptions/file/${m.id}` : null,
        isRead: m.isRead,
        createdBy: m.createdBy,
        creatorName: m.creator?.name || null,
        createdAt: m.createdAt.toISOString(),
      }));

    return NextResponse.json({
      success: true,
      totalUnreadCount,
      conversations,
      selectedCustomerId,
      thread,
      customers,
    });
  } catch (error: any) {
    console.error("GET /api/admin/patient-messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to load patient messages" },
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
      { success: false, message: "Forbidden: Access to patient message inbox denied" },
      { status: 403 }
    );
  }

  const msgGate = await requireStoreFeature(auth.session.storeId, "twoWayMessagingInboxes");
  if (!msgGate.allowed) return msgGate.response!;

  try {
    const body = await req.json();
    const customerId = parseInt(String(body.customerId || ""), 10);
    const messageText = String(body.message || "").trim();

    if (!customerId || isNaN(customerId)) {
      return NextResponse.json({ success: false, message: "Valid customerId is required." }, { status: 400 });
    }
    if (!messageText) {
      return NextResponse.json({ success: false, message: "Message reply cannot be empty." }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || (auth.session.storeId && customer.storeId !== auth.session.storeId)) {
      return NextResponse.json({ success: false, message: "Customer not found." }, { status: 404 });
    }

    const userStoreId = auth.session.storeId ?? null;
    const created = await prisma.patientMessage.create({
      data: {
        storeId: userStoreId ?? customer.storeId ?? null,
        branchId: auth.session.branchId ?? null,
        customerId,
        direction: "out",
        message: messageText,
        isRead: false, // Unread by patient until opened in portal
        createdBy: auth.session.userId,
      },
      include: {
        creator: { select: { name: true } },
      },
    });

    // Also mark patient's inbound unread messages in this store/branch as read since staff replied
    await prisma.patientMessage.updateMany({
      where: {
        customerId,
        direction: "in",
        isRead: false,
        ...buildPatientMessageScope(userStoreId, auth.session.branchId),
      },
      data: { isRead: true },
    });

    await logAudit({
      storeId: userStoreId,
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "PATIENT_MESSAGE_REPLIED",
      entity: "patient_message",
      entityId: created.id,
      details: { customerId, customerName: customer.name },
      ipAddress: getClientIp(req),
    });

    if (customer.email) {
      const safeCustomerName = escapeHtml(customer.name);
      const safeStaffName = escapeHtml(auth.session.name);
      const safeHtmlMessage = escapeHtml(messageText).replace(/\n/g, "<br/>");
      sendEmail({
        to: customer.email,
        subject: `Reply from Pharmacy Support — ${customer.name}`,
        html: `<p>Hello <strong>${safeCustomerName}</strong>,</p><p>Pharmacy staff (${safeStaffName}) sent you a message:</p><blockquote style="border-left:3px solid #0F5A47;padding-left:12px;color:#334155;">${safeHtmlMessage}</blockquote><p>Log into your Patient Portal to reply or view prescriptions.</p>`,
        text: `Reply from ${auth.session.name}:\n\n${messageText}`,
        storeId: auth.session.storeId,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: "Reply sent to patient.",
        data: {
          ...created,
          creatorName: created.creator?.name || auth.session.name,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/admin/patient-messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to send patient message" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to patient message inbox denied" },
      { status: 403 }
    );
  }

  const msgGate = await requireStoreFeature(auth.session.storeId, "twoWayMessagingInboxes");
  if (!msgGate.allowed) return msgGate.response!;

  try {
    const body = await req.json();
    const msgId = body.id ? parseInt(String(body.id), 10) : null;
    const customerId = body.customerId ? parseInt(String(body.customerId), 10) : null;
    const isRead = body.isRead !== undefined ? Boolean(body.isRead) : true;

    const userStoreId = auth.session.storeId ?? null;
    if (msgId && !isNaN(msgId)) {
      const existing = await prisma.patientMessage.findUnique({
        where: { id: msgId },
        include: { customer: { select: { storeId: true } } },
      });
      if (!existing || !canStaffAccessPatientMessage(auth.session, existing)) {
        return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
      }
      if (existing.direction !== "in") {
        return NextResponse.json(
          { success: false, message: "Only inbound patient messages can be marked read by staff." },
          { status: 400 }
        );
      }
      const updated = await prisma.patientMessage.update({
        where: { id: msgId },
        data: { isRead },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    if (customerId && !isNaN(customerId)) {
      if (userStoreId) {
        const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { storeId: true } });
        if (!cust || cust.storeId !== userStoreId) {
          return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
        }
      }
      const updated = await prisma.patientMessage.updateMany({
        where: {
          customerId,
          direction: "in",
          ...buildPatientMessageScope(userStoreId, auth.session.branchId),
        },
        data: { isRead },
      });
      return NextResponse.json({ success: true, updatedCount: updated.count });
    }

    return NextResponse.json({ success: false, message: "Provide id or customerId." }, { status: 400 });
  } catch (error: any) {
    console.error("PATCH /api/admin/patient-messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update read status" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Access to patient message inbox denied" },
      { status: 403 }
    );
  }

  const msgGate = await requireStoreFeature(auth.session.storeId, "twoWayMessagingInboxes");
  if (!msgGate.allowed) return msgGate.response!;

  const { searchParams } = new URL(req.url);
  const idParam = searchParams.get("id");
  const customerIdParam = searchParams.get("customerId");

  try {
    const userStoreId = auth.session.storeId ?? null;
    if (idParam) {
      const id = parseInt(idParam, 10);
      if (isNaN(id)) {
        return NextResponse.json({ success: false, message: "Invalid message ID" }, { status: 400 });
      }
      const existing = await prisma.patientMessage.findUnique({
        where: { id },
        include: { customer: { select: { storeId: true } } },
      });
      if (!existing || !canStaffAccessPatientMessage(auth.session, existing)) {
        return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
      }
      await prisma.patientMessage.delete({ where: { id } });
      await deletePrescriptionFile(existing.filePath);

      await logAudit({
        storeId: userStoreId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "PATIENT_MESSAGE_DELETED",
        entity: "patient_message",
        entityId: id,
        details: { customerId: existing.customerId },
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({ success: true, message: "Message deleted." });
    }

    if (customerIdParam) {
      const customerId = parseInt(customerIdParam, 10);
      if (isNaN(customerId)) {
        return NextResponse.json({ success: false, message: "Invalid customerId" }, { status: 400 });
      }
      if (userStoreId) {
        const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { storeId: true } });
        if (!cust || cust.storeId !== userStoreId) {
          return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
        }
      }
      const msgWhere: any = {
        customerId,
        ...buildPatientMessageScope(userStoreId, auth.session.branchId),
      };
      const msgs = await prisma.patientMessage.findMany({ where: msgWhere });
      await prisma.patientMessage.deleteMany({ where: msgWhere });
      for (const m of msgs) {
        await deletePrescriptionFile(m.filePath);
      }

      await logAudit({
        storeId: userStoreId,
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "PATIENT_CONVERSATION_DELETED",
        entity: "patient_message",
        entityId: customerId,
        details: { customerId, count: msgs.length },
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({ success: true, deletedCount: msgs.length });
    }

    return NextResponse.json({ success: false, message: "Provide id or customerId query parameter." }, { status: 400 });
  } catch (error: any) {
    console.error("DELETE /api/admin/patient-messages error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to delete patient message" },
      { status: 500 }
    );
  }
}
