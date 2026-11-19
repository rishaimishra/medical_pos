import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerRequest } from "@/lib/auth";

/**
 * MODULE 2.18.1: Customer Single Invoice View / Download Endpoint
 * Enforces strict ownership check: customer may ONLY view invoices with sale.customerId === session.customerId.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid invoice ID" }, { status: 400 });
  }

  try {
    const [sale, defaultSettings] = await Promise.all([
      prisma.sale.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true, address: true } },
          branch: { select: { id: true, code: true, name: true, address: true, phone: true, gstNo: true, dlNo: true, storeId: true } },
          items: {
            include: {
              medicine: {
                select: { id: true, name: true, genericName: true, company: true, hsnCode: true, scheduleType: true },
              },
              batch: { select: { batchNo: true, expiryDate: true } },
            },
          },
          returns: {
            select: { id: true, returnNumber: true, refundAmount: true, status: true, createdAt: true },
          },
        },
      }),
      prisma.settings.findFirst({ orderBy: { id: "asc" } }),
    ]);

    const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];
    if (!sale || !sale.customerId || !linkedIds.includes(sale.customerId)) {
      return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });
    }

    const storeSettings = sale.branch?.storeId
      ? await prisma.settings.findUnique({ where: { id: sale.branch.storeId } })
      : defaultSettings;

    return NextResponse.json({
      success: true,
      invoice: {
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        saleDate: sale.saleDate.toISOString(),
        createdAt: sale.createdAt.toISOString(),
        totalAmount: Number(sale.totalAmount),
        gstAmount: Number(sale.gstAmount),
        discountAmount: Number(sale.discountAmount),
        grandTotal: Number(sale.grandTotal),
        paymentMethod: sale.paymentMethod,
        doctorName: sale.doctorName,
        doctorRegNo: sale.doctorRegNo,
        customer: sale.customer,
        store: {
          name: storeSettings?.storeName || "Medical POS Pharmacy",
          branchName: sale.branch?.name || "Main Branch",
          address: sale.branch?.address || storeSettings?.storeAddress || "",
          phone: sale.branch?.phone || storeSettings?.storePhone || "",
          gstNo: sale.branch?.gstNo || storeSettings?.storeGst || "",
          dlNo: sale.branch?.dlNo || storeSettings?.storeDl || "",
        },
        items: sale.items.map((it) => ({
          id: it.id,
          medicineName: it.medicine?.name || "Medicine",
          genericName: it.medicine?.genericName || "",
          company: it.medicine?.company || "",
          hsnCode: it.medicine?.hsnCode || "",
          scheduleType: it.medicine?.scheduleType || "normal",
          batchNo: it.batch?.batchNo || "-",
          expiryDate: it.batch?.expiryDate?.toISOString() || null,
          quantity: it.quantity,
          mrp: Number(it.mrp),
          taxableBase: Number(it.taxableBase),
          gstPercent: Number(it.gstPercent),
          gstAmount: Number(it.gstAmount),
          price: Number(it.price),
        })),
        returns: sale.returns,
      },
    });
  } catch (error: any) {
    console.error("GET /api/customer/orders/[id] error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load invoice" },
      { status: 500 }
    );
  }
}
