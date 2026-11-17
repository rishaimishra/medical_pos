import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySupplierRequest } from "@/lib/auth";
import { escapeHtml, sendEmail } from "@/lib/email";

/**
 * MODULE 2.20.2: Supplier Contact Form API (ref: supplier_contact.php)
 * Allows either an authenticated supplier OR a public distributor contact submission
 * to deliver an inquiry into the Admin Supplier Message Inbox with email notification,
 * without creating unverified rows in the master Supplier vendor directory.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifySupplierRequest(req);
    const body = await req.json();

    const subject = String(body.subject || "").trim().slice(0, 255);
    const rawMessage = String(body.message || "").trim();

    if (!subject || !rawMessage) {
      return NextResponse.json(
        { success: false, message: "Subject and message body are required." },
        { status: 400 }
      );
    }

    let supplierId: number | null = null;
    let supplierName: string;
    let senderEmail: string;
    let storedMessage = rawMessage;

    if (auth.authorized && auth.session) {
      supplierId = auth.session.supplierId;
      supplierName = auth.session.companyName || auth.session.name;
      senderEmail = auth.session.email;
    } else {
      const companyOrName = String(body.supplierName || body.companyName || body.name || "").trim();
      const rawEmail = String(body.senderEmail || body.email || "").trim().toLowerCase();
      const rawPhone = String(body.phone || "").trim();

      if (!companyOrName || !rawEmail || !rawPhone) {
        return NextResponse.json(
          { success: false, message: "Supplier/Company Name, Email, and Phone are required." },
          { status: 400 }
        );
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return NextResponse.json(
          { success: false, message: "Please provide a valid contact email address." },
          { status: 400 }
        );
      }

      supplierName = companyOrName;
      senderEmail = rawEmail;
      storedMessage = `Contact Phone: ${rawPhone}\n\n${rawMessage}`;
    }

    const created = await prisma.supplierMessage.create({
      data: {
        supplierId,
        supplierName,
        senderEmail,
        subject,
        message: storedMessage,
        direction: "in",
        status: "unread",
      },
    });

    const storeSettings = await prisma.settings.findFirst({
      orderBy: { id: "asc" },
      select: { id: true, storeEmail: true, storeName: true },
    });

    if (storeSettings?.storeEmail) {
      sendEmail({
        to: storeSettings.storeEmail,
        subject: `[Supplier Contact] ${subject} — ${supplierName}`,
        html: `<p><strong>Distributor:</strong> ${escapeHtml(supplierName)} (${escapeHtml(senderEmail)})</p><p><strong>Subject:</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(storedMessage).replace(/\n/g, "<br/>")}</p>`,
        text: `Supplier Contact Form Submission\nFrom: ${supplierName} (${senderEmail})\nSubject: ${subject}\n\n${storedMessage}`,
        storeId: storeSettings.id,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: "Your inquiry has been submitted to Pharmacy Administration.",
        data: created,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/supplier/contact error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to submit contact form" },
      { status: 500 }
    );
  }
}
