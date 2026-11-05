import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_medicines" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const headers = "name,generic,company,category,hsn,gst,rack,schedule_type,pack_unit,loose_unit,units_per_pack,description";
  const rows = [
    [
      "Paracetamol 500mg",
      "Acetaminophen",
      "Sun Pharma",
      "Tablet",
      "30049099",
      "12",
      "Rack: A-1 • Shelf: 2 • Box: B-4",
      "normal",
      "Strip",
      "Tablet",
      "10",
      "Common analgesic and antipyretic for mild to moderate fever.",
    ],
    [
      "Amoxicillin 500mg",
      "Amoxicillin Trihydrate",
      "Cipla Ltd",
      "Capsule",
      "30041099",
      "12",
      "Rack: B-2 • Shelf: 1",
      "schedule_h",
      "Strip",
      "Capsule",
      "10",
      "Broad-spectrum antibiotic. Requires valid doctor prescription.",
    ],
    [
      "Azithromycin 500mg",
      "Azithromycin",
      "Mankind Pharma",
      "Tablet",
      "30042099",
      "12",
      "Rack: B-3 • Shelf: 3",
      "schedule_h1",
      "Strip",
      "Tablet",
      "3",
      "Macrolide antibiotic. Schedule H1 prescription register required.",
    ],
    [
      "Benadryl Cough Syrup 100ml",
      "Diphenhydramine HCl",
      "Johnson & Johnson",
      "Syrup",
      "30049080",
      "12",
      "Rack: S-1 • Shelf: 4",
      "normal",
      "Bottle",
      "ml",
      "100",
      "Cough relief syrup for productive and dry cough.",
    ],
    [
      "Pantoprazole 40mg",
      "Pantoprazole Sodium",
      "Alkem Labs",
      "Tablet",
      "30049099",
      "12",
      "Rack: P-1 • Shelf: 1",
      "normal",
      "Strip",
      "Tablet",
      "15",
      "Proton pump inhibitor for acidity and GERD.",
    ],
  ];

  const csvContent =
    "\uFEFF" +
    headers +
    "\n" +
    rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="medicines_sample_template.csv"',
    },
  });
}
