/**
 * Standard Indian Pharma GST-Inclusive MRP Calculation Engine (MODULE 2.13.3)
 *
 * Implements Indian Pharmacopeia & GST norms:
 * 1. Taxable Value = Line Net / (1 + GST% / 100)
 * 2. Total GST = Line Net - Taxable Value
 * 3. CGST = Total GST / 2, SGST = Total GST / 2 (Intra-state sales)
 *    IGST = Total GST (Inter-state sales)
 * 4. Discounts apply on the GST-inclusive MRP total before tax decomposition.
 */

import { numberToIndianWords } from "./numberToWords";

export interface GstTaxBreakdown {
  mrp: number;
  gstPercent: number;
  grossAmount: number;
  discountAmount: number;
  netInclusiveAmount: number;
  taxableValue: number;
  gstAmount: number;
  cgstPercent: number;
  cgstAmount: number;
  sgstPercent: number;
  sgstAmount: number;
  igstPercent: number;
  igstAmount: number;
}

/**
 * Calculates GST-inclusive backward breakdown for a single item line.
 *
 * @param unitMrp MRP per unit (inclusive of GST)
 * @param quantity Number of units sold
 * @param gstPercent GST slab (e.g. 0, 5, 12, 18, 28)
 * @param itemDiscountAmount Total discount deducted from this line item
 * @param isInterState Whether transaction is inter-state (IGST) vs intra-state (CGST + SGST)
 */
export function calculateGstInclusiveLine(
  unitMrp: number,
  quantity: number,
  gstPercent: number = 12,
  itemDiscountAmount: number = 0,
  isInterState: boolean = false
): GstTaxBreakdown {
  const grossAmount = Math.round(unitMrp * quantity * 100) / 100;
  const netInclusiveAmount = Math.max(0, Math.round((grossAmount - itemDiscountAmount) * 100) / 100);

  const safeGstPercent = Math.max(0, gstPercent);
  const divisor = 1 + safeGstPercent / 100;
  const taxableValue = Math.round((netInclusiveAmount / divisor) * 100) / 100;
  const gstAmount = Math.max(0, Math.round((netInclusiveAmount - taxableValue) * 100) / 100);

  if (isInterState) {
    return {
      mrp: unitMrp,
      gstPercent: safeGstPercent,
      grossAmount,
      discountAmount: itemDiscountAmount,
      netInclusiveAmount,
      taxableValue,
      gstAmount,
      cgstPercent: 0,
      cgstAmount: 0,
      sgstPercent: 0,
      sgstAmount: 0,
      igstPercent: safeGstPercent,
      igstAmount: gstAmount,
    };
  }

  const halfRate = safeGstPercent / 2;
  const halfGst = Math.round((gstAmount / 2) * 100) / 100;
  const remainderGst = Math.max(0, Math.round((gstAmount - halfGst) * 100) / 100);

  return {
    mrp: unitMrp,
    gstPercent: safeGstPercent,
    grossAmount,
    discountAmount: itemDiscountAmount,
    netInclusiveAmount,
    taxableValue,
    gstAmount,
    cgstPercent: halfRate,
    cgstAmount: halfGst,
    sgstPercent: halfRate,
    sgstAmount: remainderGst,
    igstPercent: 0,
    igstAmount: 0,
  };
}

/**
 * Aggregates HSN / GST rate slab-wise summaries for tax breakdown tables.
 */
export interface GstSlabSummary {
  gstPercent: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGst: number;
  totalAmount: number;
}

export function aggregateGstSlabs(
  lines: Array<{
    mrp: number;
    quantity: number;
    gstPercent: number;
    discount?: number;
    isInterState?: boolean;
  }>
): Record<number, GstSlabSummary> {
  const summary: Record<number, GstSlabSummary> = {};

  for (const line of lines) {
    const breakdown = calculateGstInclusiveLine(
      line.mrp,
      line.quantity,
      line.gstPercent,
      line.discount || 0,
      line.isInterState || false
    );

    const slab = breakdown.gstPercent;
    if (!summary[slab]) {
      summary[slab] = {
        gstPercent: slab,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalGst: 0,
        totalAmount: 0,
      };
    }

    summary[slab].taxableValue = Math.round((summary[slab].taxableValue + breakdown.taxableValue) * 100) / 100;
    summary[slab].cgstAmount = Math.round((summary[slab].cgstAmount + breakdown.cgstAmount) * 100) / 100;
    summary[slab].sgstAmount = Math.round((summary[slab].sgstAmount + breakdown.sgstAmount) * 100) / 100;
    summary[slab].igstAmount = Math.round((summary[slab].igstAmount + breakdown.igstAmount) * 100) / 100;
    summary[slab].totalGst = Math.round((summary[slab].totalGst + breakdown.gstAmount) * 100) / 100;
    summary[slab].totalAmount = Math.round((summary[slab].totalAmount + breakdown.netInclusiveAmount) * 100) / 100;
  }

  return summary;
}

/**
 * Returns formatted Indian Currency string and words.
 */
export function formatAmountWithWords(amount: number): {
  formatted: string;
  words: string;
} {
  const cleanAmount = Math.round(Number(amount || 0) * 100) / 100;
  return {
    formatted: `₹${cleanAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    words: numberToIndianWords(cleanAmount),
  };
}
