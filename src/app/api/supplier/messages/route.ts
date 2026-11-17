import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySupplierRequest } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";

/**
 * MODULE 2.17.2: Supplier Two-Way Messaging Channel (Supplier Portal Endpoint)
 * - GET: Fetches message history between this supplier and the pharmacy store
 * - POST: Sends an inquiry/message to the pharmacy admin inbox (direction = "in")
 * - PATCH: Marks inbound messages from pharmacy admin (direction = "out") or replied threads as read
 */
export async function GET(req: NextRequest) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const messages = await prisma.supplierMessage.findMany({
      where: { supplierId: auth.session.supplierId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const unreadFromAdminCount = messages.filter(
      (m) => m.direction === "out" && m.status === "unread"
    ).length;

    return NextResponse.json({
      success: true,
      messages,
      unreadFromAdminCount,
    });
  } catch (error: any) {
    console.error("GET /api/supplier/messages error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const subject = String(body.subject || "").trim().slice(0, 255);
    const message = String(body.message || "").trim();

    if (!subject || !message) {
      return NextResponse.json(
        { success: false, message: "Subject and message body are required." },
        { status: 400 }
      );
    }

    const created = await prisma.supplierMessage.create({
      data: {
        supplierId: auth.session.supplierId,
        supplierName: auth.session.companyName || auth.session.name,
        senderEmail: auth.session.email,
        subject,
        message,
        direction: "in",
        status: "unread",
      },
    });

    // Notify pharmacy store email if configured (best-effort)
    const storeSettings = await prisma.settings.findFirst({
      orderBy: { id: "asc" },
      select: { storeEmail: true, storeName: true },
    });
    if (storeSettings?.storeEmail) {
      sendEmail({
        to: storeSettings.storeEmail,
        subject: `[Supplier Message] ${subject} — ${auth.session.companyName}`,
        html: `<p><strong>From Supplier:</strong> ${escapeHtml(auth.session.companyName)} (${escapeHtml(auth.session.email)})</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
        text: `Supplier Message from ${auth.session.companyName} (${auth.session.email})\nSubject: ${subject}\n\n${message}`,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: "Message sent to pharmacy administration.",
        data: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/supplier/messages error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const id = body.id ? parseInt(String(body.id), 10) : null;

    if (id && !isNaN(id)) {
      const existing = await prisma.supplierMessage.findUnique({ where: { id } });
      if (!existing || existing.supplierId !== auth.session.supplierId) {
        return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
      }
      if (existing.direction === "out" && existing.status === "unread") {
        await prisma.supplierMessage.update({
          where: { id },
          data: { status: "read" },
        });
      }
    } else if (body.markAllRead) {
      await prisma.supplierMessage.updateMany({
        where: {
          supplierId: auth.session.supplierId,
          direction: "out",
          status: "unread",
        },
        data: { status: "read" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH /api/supplier/messages error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update message status" },
      { status: 500 }
    );
  }
}
