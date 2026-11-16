/**
 * MODULE 2.6.4: Customer Emailed Invoice Receipt Dispatcher
 *
 * Dispatches an automated, responsive HTML purchase receipt to the patient/customer's email address.
 */

import { sendEmail, EmailResult } from "./email";

export interface InvoiceEmailReceiptOptions {
  toEmail: string;
  customerName: string;
  invoiceNo: string;
  saleDate: Date | string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeGst?: string;
  storeDl?: string;
  paymentMethod: string;
  splitDetails?: {
    cash?: number;
    upi?: number;
    card?: number;
    cheque?: number;
    credit?: number;
  };
  upiRef?: string | null;
  chequeNo?: string | null;
  doctorName?: string | null;
  items: Array<{
    name: string;
    batchNo?: string;
    expiryDate?: string | Date;
    quantity: number;
    mrp: number;
    price: number;
  }>;
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  grandTotal: number;
}

export async function sendCustomerInvoiceReceiptEmail(
  options: InvoiceEmailReceiptOptions
): Promise<EmailResult> {
  const {
    toEmail,
    customerName,
    invoiceNo,
    saleDate,
    storeName,
    storeAddress = "",
    storePhone = "",
    storeGst = "",
    storeDl = "",
    paymentMethod,
    splitDetails,
    upiRef,
    chequeNo,
    doctorName,
    items,
    subtotal,
    discountAmount,
    gstAmount,
    grandTotal,
  } = options;

  const dateFormatted = new Date(saleDate).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const cgst = (gstAmount / 2).toFixed(2);
  const sgst = (gstAmount / 2).toFixed(2);

  // Generate Item Rows
  const itemRowsHtml = items
    .map((item, idx) => {
      const exp = item.expiryDate
        ? new Date(item.expiryDate).toLocaleDateString("en-IN", {
            month: "2-digit",
            year: "2-digit",
          })
        : "-";
      return `
        <tr style="border-bottom: 1px solid #f1f5f9; ${idx % 2 === 1 ? "background-color: #fafbfc;" : ""}">
          <td style="padding: 10px 8px; font-size: 13px; color: #1e293b; font-weight: 600;">
            ${item.name}
            ${item.batchNo ? `<br/><span style="font-size: 11px; color: #64748b; font-weight: 400;">Batch: ${item.batchNo} | Exp: ${exp}</span>` : ""}
          </td>
          <td style="padding: 10px 8px; font-size: 13px; color: #334155; text-align: center;">
            ${item.quantity}
          </td>
          <td style="padding: 10px 8px; font-size: 13px; color: #334155; text-align: right;">
            ₹${Number(item.mrp).toFixed(2)}
          </td>
          <td style="padding: 10px 8px; font-size: 13px; color: #0f172a; font-weight: 700; text-align: right;">
            ₹${Number(item.price).toFixed(2)}
          </td>
        </tr>
      `;
    })
    .join("");

  // Payment Breakdown HTML
  let paymentInfoHtml = `
    <div style="font-size: 12px; color: #475569; margin-top: 8px;">
      <strong>Payment Mode:</strong> <span style="text-transform: uppercase;">${paymentMethod}</span>
  `;
  if (paymentMethod === "split" && splitDetails) {
    const parts: string[] = [];
    if (splitDetails.cash && splitDetails.cash > 0) parts.push(`Cash: ₹${splitDetails.cash.toFixed(2)}`);
    if (splitDetails.upi && splitDetails.upi > 0) parts.push(`UPI: ₹${splitDetails.upi.toFixed(2)}`);
    if (splitDetails.card && splitDetails.card > 0) parts.push(`Card: ₹${splitDetails.card.toFixed(2)}`);
    if (splitDetails.cheque && splitDetails.cheque > 0) parts.push(`Cheque: ₹${splitDetails.cheque.toFixed(2)}`);
    if (splitDetails.credit && splitDetails.credit > 0) parts.push(`Credit: ₹${splitDetails.credit.toFixed(2)}`);
    paymentInfoHtml += `<br/><span style="color: #64748b; font-size: 11px;">Breakdown: ${parts.join(" | ")}</span>`;
  }
  if (upiRef) {
    paymentInfoHtml += `<br/><span>UPI Reference: ${upiRef}</span>`;
  }
  if (chequeNo) {
    paymentInfoHtml += `<br/><span>Cheque No: ${chequeNo}</span>`;
  }
  paymentInfoHtml += `</div>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Invoice ${invoiceNo}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 24px 12px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
          
          <!-- Store Header -->
          <div style="background-color: #1F4E5B; color: #ffffff; padding: 28px 24px; text-align: center;">
            <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">
              ${storeName}
            </h1>
            <p style="margin: 0; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
              ${storeAddress}${storePhone ? ` • Ph: ${storePhone}` : ""}
            </p>
            ${
              storeGst || storeDl
                ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">
                    ${storeGst ? `GSTIN: ${storeGst}` : ""} ${storeDl ? `• D.L. No: ${storeDl}` : ""}
                   </p>`
                : ""
            }
          </div>

          <!-- Invoice Title & Customer Greeting -->
          <div style="padding: 24px 24px 12px 24px; border-bottom: 1px solid #e2e8f0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td>
                  <span style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase;">
                    Paid Tax Invoice
                  </span>
                  <div style="margin-top: 8px; font-size: 18px; font-weight: 800; color: #0f172a;">
                    ${invoiceNo}
                  </div>
                  <div style="font-size: 12px; color: #64748b;">
                    Date: ${dateFormatted}
                  </div>
                </td>
                <td style="text-align: right; vertical-align: top;">
                  <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">Billed To</span>
                  <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
                    ${customerName}
                  </div>
                  ${doctorName ? `<div style="font-size: 11px; color: #475569; margin-top: 4px;">Dr: ${doctorName}</div>` : ""}
                </td>
              </tr>
            </table>
          </div>

          <!-- Line Items Table -->
          <div style="padding: 16px 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 2px solid #e2e8f0; text-align: left; color: #64748b; font-size: 11px; text-transform: uppercase;">
                  <th style="padding: 8px; font-weight: 700;">Medicine Item</th>
                  <th style="padding: 8px; font-weight: 700; text-align: center;">Qty</th>
                  <th style="padding: 8px; font-weight: 700; text-align: right;">MRP</th>
                  <th style="padding: 8px; font-weight: 700; text-align: right;">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemRowsHtml}
              </tbody>
            </table>
          </div>

          <!-- Totals Summary Box -->
          <div style="padding: 16px 24px 24px 24px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
            <table style="width: 100%; max-width: 320px; margin-left: auto; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; color: #64748b;">Subtotal:</td>
                <td style="padding: 4px 0; text-align: right; font-weight: 600; color: #1e293b;">
                  ₹${Number(subtotal).toFixed(2)}
                </td>
              </tr>
              ${
                discountAmount > 0
                  ? `<tr>
                      <td style="padding: 4px 0; color: #dc2626; font-weight: 600;">Discount:</td>
                      <td style="padding: 4px 0; text-align: right; font-weight: 700; color: #dc2626;">
                        -₹${Number(discountAmount).toFixed(2)}
                      </td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding: 4px 0; color: #64748b; font-size: 12px;">CGST Included:</td>
                <td style="padding: 4px 0; text-align: right; color: #64748b; font-size: 12px;">
                  ₹${cgst}
                </td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #64748b; font-size: 12px;">SGST Included:</td>
                <td style="padding: 4px 0; text-align: right; color: #64748b; font-size: 12px;">
                  ₹${sgst}
                </td>
              </tr>
              <tr style="border-top: 2px solid #cbd5e1;">
                <td style="padding: 10px 0 4px 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                  Grand Total:
                </td>
                <td style="padding: 10px 0 4px 0; text-align: right; font-size: 18px; font-weight: 800; color: #1F4E5B;">
                  ₹${Number(grandTotal).toFixed(2)}
                </td>
              </tr>
            </table>

            <!-- Payment details -->
            ${paymentInfoHtml}
          </div>

          <!-- Footer Policy & Disclaimer -->
          <div style="padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
            <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748b;">
              Thank you for choosing ${storeName}!
            </p>
            <p style="margin: 0;">
              Medicines once sold can be returned within 7 days in original unopened packaging along with this invoice.
            </p>
          </div>

        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: toEmail,
    subject: `Tax Invoice ${invoiceNo} - ${storeName}`,
    html,
    text: `Tax Invoice: ${invoiceNo}\nStore: ${storeName}\nGrand Total: ₹${Number(grandTotal).toFixed(2)}\nThank you for choosing us!`,
  });
}

