import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { sendCustomerInvoiceReceiptEmail } from "@/lib/emailReceipt";

/**
 * MODULE 2.9.2: DIGITAL INVOICE DELIVERY (WhatsApp, SMS & Email)
 *
 * POST /api/admin/sales/[id]/share
 * Generates instant WhatsApp share link, SMS text, or re-dispatches email receipt.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json(
      { success: false, message: auth.message || "Unauthorized" },
      { status: auth.status }
    );
  }

  const { id } = await params;
  const saleId = parseInt(id, 10);
  if (isNaN(saleId)) {
    return NextResponse.json({ success: false, message: "Invalid sale ID" }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const channel = (body.channel || "whatsapp").toLowerCase(); // whatsapp | sms | email
    const recipientPhone = (body.recipientPhone || "").trim();
    const recipientEmail = (body.recipientEmail || "").trim();

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        branch: true,
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
      },
    });

    if (!sale) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    if (sale.branchId && !canAccessBranch(auth.session, sale.branchId)) {
      return NextResponse.json(
        { success: false, message: "Forbidden: Cannot share invoice from another branch" },
        { status: 403 }
      );
    }

    // Determine target recipient info
    const targetPhone = recipientPhone || sale.customer?.phone || "";
    const targetEmail = recipientEmail || sale.customer?.email || "";
    const customerName = sale.customer?.name || "Valued Customer";

    const storeSettings = sale.branch?.storeId
      ? await prisma.settings.findUnique({ where: { id: sale.branch.storeId } }).catch(() => null)
      : await prisma.settings.findFirst({ orderBy: { id: "asc" } }).catch(() => null);

    const storeName = sale.branch?.name || storeSettings?.storeName || "DRxStore Pharmacy";
    const storePhone = sale.branch?.phone || storeSettings?.storePhone || "";
    const grandTotalFormatted = Number(sale.grandTotal).toFixed(2);

    // Origin base url
    const origin = req.nextUrl.origin || "http://localhost:3000";
    const invoiceWebUrl = `${origin}/admin/pos/invoice/${sale.invoiceNo}`;

    // Clean phone number for WhatsApp / SMS (must contain digits, e.g. 91XXXXXXXXXX)
    const rawDigits = targetPhone.replace(/\D/g, "");
    let cleanPhone = rawDigits;
    if (cleanPhone.length === 10) {
      cleanPhone = "91" + cleanPhone; // Default to India country code if 10-digit
    }

    // 1. WhatsApp Delivery
    const whatsappMessage =
      `Hello ${customerName}! 💊\n\n` +
      `Thank you for choosing ${storeName}.\n` +
      `Your official Tax Invoice #${sale.invoiceNo} for ₹${grandTotalFormatted} has been generated.\n\n` +
      `📄 View & Download Digital Invoice:\n${invoiceWebUrl}\n\n` +
      (storePhone ? `📞 Helpline: ${storePhone}\n` : "") +
      `Stay healthy! 🌿`;

    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

    // 2. SMS Text
    const smsMessage =
      `Dear ${customerName}, your ${storeName} bill #${sale.invoiceNo} of Rs.${grandTotalFormatted} is ready. View invoice: ${invoiceWebUrl} - Thank you!`;

    // 3. Email Delivery (if requested)
    let emailSent = false;
    let emailError: string | null = null;
    if (channel === "email" && targetEmail) {
      try {
        const mailRes = await sendCustomerInvoiceReceiptEmail({
          toEmail: targetEmail,
          customerName,
          invoiceNo: sale.invoiceNo,
          saleDate: sale.saleDate,
          storeName,
          storeAddress: sale.branch?.address || storeSettings?.storeAddress || undefined,
          storePhone,
          storeGst: sale.branch?.gstNo || storeSettings?.storeGst || undefined,
          storeDl: sale.branch?.dlNo || storeSettings?.storeDl || undefined,
          paymentMethod: sale.paymentMethod,
          items: sale.items.map((it) => ({
            name: it.medicine.name,
            batchNo: it.batch.batchNo,
            expiryDate: it.batch.expiryDate,
            quantity: it.quantity,
            mrp: Number(it.mrp),
            price: Number(it.price),
          })),
          subtotal: Number(sale.totalAmount),
          discountAmount: Number(sale.discountAmount),
          gstAmount: Number(sale.gstAmount),
          grandTotal: Number(sale.grandTotal),
        });
        emailSent = mailRes.success;
        if (!mailRes.success) {
          emailError = mailRes.error || "Failed to dispatch email";
        }
      } catch (err: any) {
        emailError = err?.message || "Email error";
      }
    }

    // Audit Log
    await logAudit({
      storeId: auth.session.storeId,
      action: "INVOICE_SHARED",
      entity: "Sale",
      entityId: sale.id,
      userId: auth.session.userId,
      branchId: sale.branchId || undefined,
      details: {
        invoiceNo: sale.invoiceNo,
        channel,
        targetPhone,
        targetEmail,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Invoice digital delivery payload prepared for ${channel}`,
      delivery: {
        channel,
        customerName,
        targetPhone,
        targetEmail,
        invoiceWebUrl,
        whatsapp: {
          phone: cleanPhone,
          message: whatsappMessage,
          shareUrl: whatsappUrl,
        },
        sms: {
          phone: cleanPhone,
          message: smsMessage,
        },
        email: {
          sent: emailSent,
          error: emailError,
        },
      },
    });
  } catch (error: any) {
    console.error("POST /api/admin/sales/[id]/share error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to share invoice" },
      { status: 500 }
    );
  }
}
