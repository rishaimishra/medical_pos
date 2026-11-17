import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";
import { calculateGstInclusiveLine } from "@/lib/taxCalculations";

/**
 * MODULE 2.14.2: GST Outward & Inward Summary Reports (GSTR-1 & GSTR-3B)
 *
 * Provides:
 * 1. GSTR-1 Outward Supplies Summary:
 *    - HSN-wise summary table (HSN Code, Description, Qty, Total Value, Taxable Base, CGST, SGST, IGST)
 *    - Rate-wise breakup (0%, 5%, 12%, 18%, 28%)
 *    - B2C Small vs B2B Taxable Invoices
 * 2. GSTR-3B Inward vs Outward ITC Reconciliation:
 *    - Outward Tax Liability (Sales)
 *    - Input Tax Credit (ITC) from Verified Supplier Purchase Orders
 *    - Net GST Payable / (Credit Balance)
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const month = searchParams.get("month"); // e.g. "2026-11"

  try {
    let targetBranchId: number | null = auth.session.branchId;
    if (!targetBranchId && branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        targetBranchId = bId;
      }
    }

    // Build Date Filter
    let dateFilter: any = {};
    if (month) {
      const [y, m] = month.split("-").map((v) => parseInt(v, 10));
      const s = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const e = new Date(y, m, 0, 23, 59, 59, 999);
      dateFilter = { gte: s, lte: e };
    } else if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        dateFilter.gte = s;
      }
      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        dateFilter.lte = e;
      }
    }

    const branchFilter = targetBranchId ? { branchId: targetBranchId } : {};

    // 1. Fetch Outward Sales Items & Invoices (for GSTR-1 & Outward 3B)
    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: {
          ...branchFilter,
          ...(dateFilter.gte || dateFilter.lte ? { saleDate: dateFilter } : {}),
        },
      },
      include: {
        medicine: {
          select: {
            id: true,
            name: true,
            genericName: true,
            hsnCode: true,
            gstPercent: true,
          },
        },
        batch: {
          select: {
            mrp: true,
          },
        },
        sale: {
          select: {
            id: true,
            invoiceNo: true,
            saleDate: true,
            totalAmount: true,
            discountAmount: true,
            grandTotal: true,
            customer: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // 2. Fetch Inward Supplies (Purchase Orders received/confirmed) for GSTR-3B ITC
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        ...branchFilter,
        status: { in: ["received", "partially_received", "completed", "confirmed"] },
        ...(dateFilter.gte || dateFilter.lte ? { poDate: dateFilter } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true, gstNo: true } },
        items: {
          include: {
            medicine: { select: { name: true, hsnCode: true, gstPercent: true } },
          },
        },
      },
    });

    // ==========================================
    // AGGREGATION: GSTR-1 HSN SUMMARY & RATE SLABS
    // ==========================================
    const hsnMap: Record<
      string,
      {
        hsnCode: string;
        description: string;
        uqc: string;
        totalQty: number;
        totalValue: number;
        taxableValue: number;
        cgstAmount: number;
        sgstAmount: number;
        igstAmount: number;
        totalTax: number;
      }
    > = {};

    const rateSlabMap: Record<
      number,
      {
        rate: number;
        taxableValue: number;
        cgstAmount: number;
        sgstAmount: number;
        igstAmount: number;
        totalTax: number;
        totalValue: number;
      }
    > = {
      0: { rate: 0, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
      5: { rate: 5, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
      12: { rate: 12, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
      18: { rate: 18, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
      28: { rate: 28, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0, totalValue: 0 },
    };

    let totalOutwardTurnover = 0;
    let totalOutwardTaxable = 0;
    let totalOutwardCgst = 0;
    let totalOutwardSgst = 0;
    let totalOutwardIgst = 0;
    let totalOutwardGst = 0;

    for (const item of saleItems) {
      const hsn = item.medicine.hsnCode || "30049099"; // Standard default Indian Pharma HSN
      const gstRate = Number(item.gstPercent || item.medicine.gstPercent || 12);
      const taxable = Number(item.taxableBase);
      const tax = Number(item.gstAmount);
      const lineVal = Number(item.price);
      const halfTax = Math.round((tax / 2) * 100) / 100;
      const remainderTax = Math.max(0, Math.round((tax - halfTax) * 100) / 100);

      // 1. HSN aggregation
      if (!hsnMap[hsn]) {
        hsnMap[hsn] = {
          hsnCode: hsn,
          description: item.medicine.genericName || item.medicine.name,
          uqc: "NOS",
          totalQty: 0,
          totalValue: 0,
          taxableValue: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalTax: 0,
        };
      }

      hsnMap[hsn].totalQty += item.quantity;
      hsnMap[hsn].totalValue = Math.round((hsnMap[hsn].totalValue + lineVal) * 100) / 100;
      hsnMap[hsn].taxableValue = Math.round((hsnMap[hsn].taxableValue + taxable) * 100) / 100;
      hsnMap[hsn].cgstAmount = Math.round((hsnMap[hsn].cgstAmount + halfTax) * 100) / 100;
      hsnMap[hsn].sgstAmount = Math.round((hsnMap[hsn].sgstAmount + remainderTax) * 100) / 100;
      hsnMap[hsn].totalTax = Math.round((hsnMap[hsn].totalTax + tax) * 100) / 100;

      // 2. Rate Slab aggregation
      const slabKey = Math.round(gstRate);
      if (!rateSlabMap[slabKey]) {
        rateSlabMap[slabKey] = {
          rate: slabKey,
          taxableValue: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          totalTax: 0,
          totalValue: 0,
        };
      }
      rateSlabMap[slabKey].taxableValue = Math.round((rateSlabMap[slabKey].taxableValue + taxable) * 100) / 100;
      rateSlabMap[slabKey].cgstAmount = Math.round((rateSlabMap[slabKey].cgstAmount + halfTax) * 100) / 100;
      rateSlabMap[slabKey].sgstAmount = Math.round((rateSlabMap[slabKey].sgstAmount + remainderTax) * 100) / 100;
      rateSlabMap[slabKey].totalTax = Math.round((rateSlabMap[slabKey].totalTax + tax) * 100) / 100;
      rateSlabMap[slabKey].totalValue = Math.round((rateSlabMap[slabKey].totalValue + lineVal) * 100) / 100;

      totalOutwardTurnover += lineVal;
      totalOutwardTaxable += taxable;
      totalOutwardCgst += halfTax;
      totalOutwardSgst += remainderTax;
      totalOutwardGst += tax;
    }

    // ==========================================
    // AGGREGATION: GSTR-3B INWARD SUPPLIES (ITC)
    // ==========================================
    let totalInwardTaxable = 0;
    let totalInwardCgst = 0;
    let totalInwardSgst = 0;
    let totalInwardIgst = 0;
    let totalInwardGst = 0;
    let totalInwardGross = 0;

    for (const po of purchaseOrders) {
      for (const item of po.items) {
        const itemTotal = Number(item.price) * item.quantity;
        const rate = Number(item.medicine.gstPercent || 12);
        // Purchase cost is typically exclusive of GST or inclusive; calculate standard breakdown
        const divisor = 1 + rate / 100;
        const taxable = Math.round((itemTotal / divisor) * 100) / 100;
        const gst = Math.round((itemTotal - taxable) * 100) / 100;
        const halfGst = Math.round((gst / 2) * 100) / 100;

        totalInwardGross += itemTotal;
        totalInwardTaxable += taxable;
        totalInwardCgst += halfGst;
        totalInwardSgst += Math.round((gst - halfGst) * 100) / 100;
        totalInwardGst += gst;
      }
    }

    // Net GST Payable Calculation
    const netCgstPayable = Math.round((totalOutwardCgst - totalInwardCgst) * 100) / 100;
    const netSgstPayable = Math.round((totalOutwardSgst - totalInwardSgst) * 100) / 100;
    const netTotalGstPayable = Math.round((netCgstPayable + netSgstPayable) * 100) / 100;

    return NextResponse.json({
      success: true,
      period: {
        month: month || null,
        startDate: startDate || null,
        endDate: endDate || null,
        branchId: targetBranchId,
      },
      gstr1: {
        summary: {
          totalTurnover: Math.round(totalOutwardTurnover * 100) / 100,
          totalTaxableValue: Math.round(totalOutwardTaxable * 100) / 100,
          totalCgst: Math.round(totalOutwardCgst * 100) / 100,
          totalSgst: Math.round(totalOutwardSgst * 100) / 100,
          totalIgst: Math.round(totalOutwardIgst * 100) / 100,
          totalGst: Math.round(totalOutwardGst * 100) / 100,
          totalItemsSold: saleItems.length,
        },
        hsnBreakdown: Object.values(hsnMap).sort((a, b) => b.totalValue - a.totalValue),
        rateSlabs: Object.values(rateSlabMap).filter((s) => s.totalValue > 0 || s.rate === 12),
      },
      gstr3b: {
        outwardTaxableSupplies: {
          taxableValue: Math.round(totalOutwardTaxable * 100) / 100,
          cgst: Math.round(totalOutwardCgst * 100) / 100,
          sgst: Math.round(totalOutwardSgst * 100) / 100,
          igst: Math.round(totalOutwardIgst * 100) / 100,
          totalLiability: Math.round(totalOutwardGst * 100) / 100,
        },
        eligibleITC: {
          inwardGross: Math.round(totalInwardGross * 100) / 100,
          taxableValue: Math.round(totalInwardTaxable * 100) / 100,
          cgst: Math.round(totalInwardCgst * 100) / 100,
          sgst: Math.round(totalInwardSgst * 100) / 100,
          igst: Math.round(totalInwardIgst * 100) / 100,
          totalCredit: Math.round(totalInwardGst * 100) / 100,
          verifiedPOCount: purchaseOrders.length,
        },
        netTaxPayable: {
          netCgst: netCgstPayable,
          netSgst: netSgstPayable,
          netIgst: 0,
          totalPayable: netTotalGstPayable,
          status: netTotalGstPayable > 0 ? "tax_payable" : "itc_carry_forward",
        },
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/reports/gst error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to generate GST reports" },
      { status: 500 }
    );
  }
}
