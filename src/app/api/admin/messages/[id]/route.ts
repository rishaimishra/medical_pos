import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessPage } from "@/lib/rbac";
import { escapeHtml, sendEmail } from "@/lib/email";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * MODULE 2.17.2: Admin Supplier Message Actions (Mark Read, Reply, Delete)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json({ success: false, message: "Forbidden: Messaging access denied" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid message ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.supplierMessage.findUnique({
      where: { id },
      include: { supplier: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    }

    if (existing.direction !== "in") {
      return NextResponse.json(
        {
          success: false,
          message: "Only inbound supplier inquiries can be marked read or replied to by administration.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const action = String(body.action || "").toLowerCase();
    const replyText = body.reply !== undefined ? String(body.reply).trim() : "";

    if (action === "reply" || replyText.length > 0) {
      if (!replyText) {
        return NextResponse.json({ success: false, message: "Reply message cannot be empty." }, { status: 400 });
      }

      const updated = await prisma.supplierMessage.update({
        where: { id },
        data: {
          reply: replyText,
          repliedAt: new Date(),
          status: "replied",
        },
        include: {
          supplier: { select: { id: true, name: true, phone: true, email: true, contact: true } },
        },
      });

      await logAudit({
        userId: auth.session.userId,
        branchId: auth.session.branchId,
        action: "SUPPLIER_MESSAGE_REPLIED",
        entity: "supplier_message",
        entityId: id,
        details: { supplierId: existing.supplierId, subject: existing.subject },
        ipAddress: getClientIp(req),
      });

      const targetEmail = existing.senderEmail || existing.supplier?.email;
      if (targetEmail) {
        sendEmail({
          to: targetEmail,
          subject: `Re: ${existing.subject}`,
          html: `<p>Dear <strong>${escapeHtml(existing.supplier?.name || existing.supplierName || "Supplier")}</strong>,</p><p>Pharmacy staff replied to your message:</p><blockquote style="border-left:3px solid #1F4E5B;padding-left:12px;color:#334155;">${escapeHtml(replyText).replace(/\n/g, "<br/>")}</blockquote>`,
          text: `Re: ${existing.subject}\n\n${replyText}`,
          storeId: auth.session.storeId,
        }).catch(() => { });
      }

      return NextResponse.json({
        success: true,
        message: "Reply sent to supplier.",
        data: updated,
      });
    }

    const nextStatus = body.status === "unread" ? "unread" : "read";
    const updated = await prisma.supplierMessage.update({
      where: { id },
      data: { status: nextStatus },
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true, contact: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("PATCH /api/admin/messages/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update message" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/messages")) {
    return NextResponse.json({ success: false, message: "Forbidden: Messaging access denied" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid message ID" }, { status: 400 });
  }

  try {
    const existing = await prisma.supplierMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    }

    await prisma.supplierMessage.delete({ where: { id } });

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "SUPPLIER_MESSAGE_DELETED",
      entity: "supplier_message",
      entityId: id,
      details: { supplierId: existing.supplierId, subject: existing.subject },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: "Message deleted.",
    });
  } catch (error: any) {
    console.error("DELETE /api/admin/messages/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete message" },
      { status: 500 }
    );
  }
}
