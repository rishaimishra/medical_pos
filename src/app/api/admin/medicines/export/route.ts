import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { parsePackMetadata } from "../route";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const branchParam = searchParams.get("branchId");
  const effectiveBranchId = auth.session.branchId
    ? auth.session.branchId
    : branchParam && branchParam !== "all"
    ? parseInt(branchParam, 10)
    : null;

  try {
    const medicines = await prisma.medicine.findMany({
      include: {
        batches: {
          where: effectiveBranchId ? { branchId: effectiveBranchId } : {},
          select: { quantity: true, mrp: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const headers = [
      "Medicine Name",
      "Generic Composition",
      "Manufacturer / Company",
      "Category",
      "HSN Code",
      "GST Percent",
      "Rack Location",
      "Schedule Type",
      "Pack Unit",
      "Loose Unit",
      "Units Per Pack",
      "Total In-Stock Units",
      "Max MRP",
      "Description",
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = medicines.map((m) => {
      const { cleanDesc, meta } = parsePackMetadata(m.description);
      const totalQty = m.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
      const maxMrp = m.batches.length > 0 ? Math.max(...m.batches.map((b) => Number(b.mrp))) : "";

      return [
        escapeCsv(m.name),
        escapeCsv(m.genericName || ""),
        escapeCsv(m.company),
        escapeCsv(m.category),
        escapeCsv(m.hsnCode || ""),
        escapeCsv(m.gstPercent),
        escapeCsv(m.rackLocation || ""),
        escapeCsv(m.scheduleType),
        escapeCsv(meta.packUnit || "Strip"),
        escapeCsv(meta.looseUnit || "Tablet"),
        escapeCsv(meta.unitsPerPack || 10),
        escapeCsv(totalQty),
        escapeCsv(maxMrp),
        escapeCsv(cleanDesc),
      ].join(",");
    });

    // UTF-8 BOM (\uFEFF) ensures Excel reads accented characters correctly
    const csvContent = "\uFEFF" + headers.map(escapeCsv).join(",") + "\n" + rows.join("\n");

    const dateStr = new Date().toISOString().split("T")[0];
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="medicine_catalog_export_${dateStr}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/admin/medicines/export error:", err);
    return NextResponse.json(
      { success: false, message: err.message || "Failed to export medicine catalog." },
      { status: 500 }
    );
  }
}
