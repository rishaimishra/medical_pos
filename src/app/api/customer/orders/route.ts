import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerRequest } from "@/lib/auth";

/**
 * MODULE 2.18.1: Customer Account & Purchase Archive API
 * Strictly isolated to authenticated customer's own sales, prescription records, and purchase summary.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const customerId = auth.session.customerId;
  const linkedIds = auth.session.linkedCustomerIds ?? [customerId];
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const filter = (searchParams.get("filter") || "all").toLowerCase(); // all | rx

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        isChronic: true,
        chronicDiseases: true,
        refillDays: true,
        nextRefillDate: true,
        lastRefillDate: true,
        creditLimit: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ success: false, message: "Customer profile not found" }, { status: 404 });
    }

    const whereClause: any = { customerId: { in: linkedIds } };
    if (filter === "rx") {
      whereClause.OR = [
        { doctorName: { not: null } },
        { items: { some: { medicine: { scheduleType: { not: "normal" } } } } },
      ];
    }
    if (search) {
      whereClause.AND = [
        {
          OR: [
            { invoiceNo: { contains: search, mode: "insensitive" } },
            { doctorName: { contains: search, mode: "insensitive" } },
            { items: { some: { medicine: { name: { contains: search, mode: "insensitive" } } } } },
          ],
        },
      ];
    }

    const [orders, allSalesForStats, processedReturns, creditPayments] = await Promise.all([
      prisma.sale.findMany({
        where: whereClause,
        orderBy: [{ saleDate: "desc" }, { id: "desc" }],
        take: 100,
        include: {
          branch: {
            select: {
              id: true,
              code: true,
              name: true,
              phone: true,
              address: true,
              gstNo: true,
              storeId: true,
              store: { select: { id: true, storeName: true } },
            },
          },
          items: {
            include: {
              medicine: {
                select: { id: true, name: true, genericName: true, company: true, scheduleType: true, hsnCode: true },
              },
              batch: { select: { batchNo: true, expiryDate: true } },
              returnItems: {
                select: {
                  quantity: true,
                  returnReturn: { select: { status: true } },
                },
              },
            },
          },
          returns: {
            select: { id: true, returnNumber: true, refundAmount: true, status: true, createdAt: true },
          },
        },
      }),
      prisma.sale.findMany({
        where: { customerId: { in: linkedIds } },
        select: {
          id: true,
          grandTotal: true,
          creditAmount: true,
          paymentMethod: true,
          doctorName: true,
          items: {
            select: {
              medicineId: true,
              quantity: true,
              price: true,
              medicine: { select: { id: true, name: true, genericName: true, scheduleType: true } },
            },
          },
        },
      }),
      prisma.return.findMany({
        where: { customerId: { in: linkedIds }, status: "processed" },
        select: { refundAmount: true },
      }),
      prisma.customerPayment.findMany({
        where: { customerId: { in: linkedIds } },
        select: { amount: true },
      }),
    ]);

    let totalSpentGross = 0;
    let totalCreditAssigned = 0;
    let rxOrdersCount = 0;
    const medStatsMap = new Map<
      number,
      { medicineId: number; name: string; genericName: string | null; totalQty: number; totalSpent: number }
    >();

    for (const s of allSalesForStats) {
      totalSpentGross += Number(s.grandTotal || 0);
      const cAmt = Number(s.creditAmount || 0);
      const saleCreditDue =
        cAmt > 0 ? cAmt : s.paymentMethod === "credit" ? Number(s.grandTotal || 0) : 0;
      totalCreditAssigned += saleCreditDue;
      const hasScheduled = s.items.some((i) => i.medicine?.scheduleType && i.medicine.scheduleType !== "normal");
      if (s.doctorName || hasScheduled) rxOrdersCount += 1;

      for (const it of s.items) {
        if (!it.medicine) continue;
        const m = medStatsMap.get(it.medicine.id) || {
          medicineId: it.medicine.id,
          name: it.medicine.name,
          genericName: it.medicine.genericName,
          totalQty: 0,
          totalSpent: 0,
        };
        m.totalQty += it.quantity;
        m.totalSpent += Number(it.price || 0);
        medStatsMap.set(it.medicine.id, m);
      }
    }

    const totalRefunded = processedReturns.reduce((acc, r) => acc + Number(r.refundAmount || 0), 0);
    const totalPaidTowardsCredit = creditPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const currentCreditDue = Math.max(0, totalCreditAssigned - totalPaidTowardsCredit);

    const topMedicines = Array.from(medStatsMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent || b.totalQty - a.totalQty)
      .slice(0, 8)
      .map((m) => ({
        ...m,
        totalSpent: Number(m.totalSpent.toFixed(2)),
      }));

    return NextResponse.json({
      success: true,
      customer,
      orders: orders.map((o) => ({
        id: o.id,
        invoiceNo: o.invoiceNo,
        saleDate: o.saleDate.toISOString(),
        createdAt: o.createdAt.toISOString(),
        totalAmount: Number(o.totalAmount),
        gstAmount: Number(o.gstAmount),
        discountAmount: Number(o.discountAmount),
        grandTotal: Number(o.grandTotal),
        paymentMethod: o.paymentMethod,
        doctorName: o.doctorName,
        doctorRegNo: o.doctorRegNo,
        storeId: o.branch?.store?.id || o.branch?.storeId || null,
        storeName: o.branch?.store?.storeName || null,
        branch: o.branch,
        items: o.items.map((it) => {
          const alreadyReturnedQty = (it.returnItems || [])
            .filter((ri) => ri.returnReturn.status !== "rejected")
            .reduce((sum, ri) => sum + ri.quantity, 0);
          return {
            id: it.id,
            medicineId: it.medicineId,
            medicineName: it.medicine?.name || "Medicine",
            genericName: it.medicine?.genericName || "",
            scheduleType: it.medicine?.scheduleType || "normal",
            hsnCode: it.medicine?.hsnCode || "",
            batchNo: it.batch?.batchNo || "-",
            expiryDate: it.batch?.expiryDate?.toISOString() || null,
            quantity: it.quantity,
            alreadyReturnedQty,
            remainingReturnableQty: Math.max(0, it.quantity - alreadyReturnedQty),
            mrp: Number(it.mrp),
            gstPercent: Number(it.gstPercent),
            gstAmount: Number(it.gstAmount),
            price: Number(it.price),
          };
        }),
        returns: o.returns.map((r) => ({
          id: r.id,
          returnNumber: r.returnNumber,
          refundAmount: Number(r.refundAmount),
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      })),
      summary: {
        totalOrders: allSalesForStats.length,
        rxOrdersCount,
        totalSpentGross: Number(totalSpentGross.toFixed(2)),
        totalRefunded: Number(totalRefunded.toFixed(2)),
        netSpent: Number(Math.max(0, totalSpentGross - totalRefunded).toFixed(2)),
        currentCreditDue: Number(currentCreditDue.toFixed(2)),
        topMedicines,
      },
    });
  } catch (error: any) {
    console.error("GET /api/customer/orders error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to load purchase history" },
      { status: 500 }
    );
  }
}
