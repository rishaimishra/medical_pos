import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch } from "@/lib/rbac";

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req, { requiredPermission: "manage_stock_adjustments" });
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") || "").trim();
  const typeParam = searchParams.get("type");
  const branchParam = searchParams.get("branchId");
  const medicineIdParam = searchParams.get("medicineId");
  const batchIdParam = searchParams.get("batchId");
  const reasonParam = (searchParams.get("reason") || "").trim();
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const userStoreId = auth.session.storeId;
  const requestedBranchId =
    branchParam && branchParam !== "all" ? parseInt(branchParam, 10) : null;

  if (requestedBranchId !== null && !canAccessBranch(auth.session, requestedBranchId)) {
    return NextResponse.json(
      { success: false, message: "Security Violation: Access denied to other store branches." },
      { status: 403 }
    );
  }

  const targetBranchId = auth.session.branchId ? auth.session.branchId : requestedBranchId;

  try {
    const whereConditions: any[] = [];

    if (userStoreId) {
      whereConditions.push({
        OR: [
          { branch: { storeId: userStoreId } },
          { batch: { branch: { storeId: userStoreId } } },
        ],
      });
    }

    if (targetBranchId) {
      whereConditions.push({
        OR: [
          { branchId: targetBranchId },
          { batch: { branchId: targetBranchId } },
        ],
      });
    }

    if (medicineIdParam) {
      const medId = parseInt(medicineIdParam, 10);
      if (!isNaN(medId) && medId > 0) whereConditions.push({ medicineId: medId });
    }

    if (batchIdParam) {
      const bId = parseInt(batchIdParam, 10);
      if (!isNaN(bId) && bId > 0) whereConditions.push({ batchId: bId });
    }

    if (typeParam && typeParam !== "all") whereConditions.push({ type: typeParam });

    if (reasonParam && reasonParam !== "all") {
      whereConditions.push({ reason: { contains: reasonParam, mode: "insensitive" } });
    }

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) {
          start.setHours(0, 0, 0, 0);
          dateFilter.gte = start;
        }
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          dateFilter.lte = end;
        }
      }
      whereConditions.push({ createdAt: dateFilter });
    }

    if (search) {
      whereConditions.push({
        OR: [
          { batch: { batchNo: { contains: search, mode: "insensitive" } } },
          { medicine: { name: { contains: search, mode: "insensitive" } } },
          { medicine: { genericName: { contains: search, mode: "insensitive" } } },
          { reason: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { username: { contains: search, mode: "insensitive" } } },
        ],
      });
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    const adjustments = await prisma.stockAdjustment.findMany({
      where,
      include: {
        medicine: { select: { id: true, name: true, genericName: true, company: true } },
        batch: { select: { id: true, batchNo: true, expiryDate: true, mrp: true } },
        branch: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, username: true, name: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 2000,
    });

    const headers = [
      "Adjustment ID",
      "Timestamp",
      "Branch Code",
      "Branch Name",
      "Medicine Name",
      "Generic Formula",
      "Manufacturer",
      "Batch Number",
      "Expiry Date",
      "Type",
      "Units Adjusted",
      "Previous Stock",
      "New Stock",
      "Reason & Notes",
      "Authorized By (Username)",
      "Authorized By (Name)",
      "Role",
    ];

    const rows = adjustments.map((adj) => [
      adj.id,
      adj.createdAt.toISOString().replace("T", " ").slice(0, 19),
      adj.branch?.code || "",
      adj.branch?.name || "",
      adj.medicine?.name || "",
      adj.medicine?.genericName || "",
      adj.medicine?.company || "",
      adj.batch?.batchNo || "",
      adj.batch?.expiryDate ? adj.batch.expiryDate.toISOString().split("T")[0] : "",
      adj.type.toUpperCase(),
      adj.quantity > 0 ? `+${adj.quantity}` : `${adj.quantity}`,
      adj.oldQty,
      adj.newQty,
      adj.reason || "",
      adj.user?.username || "System",
      adj.user?.name || "System",
      adj.user?.role || "",
    ]);

    const csvContent =
      "\uFEFF" +
      [
        headers.map(escapeCsvField).join(","),
        ...rows.map((r) => r.map(escapeCsvField).join(",")),
      ].join("\r\n");

    const dateStr = new Date().toISOString().split("T")[0];
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stock_adjustments_${dateStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/adjustments/export error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to export stock adjustments." },
      { status: 500 }
    );
  }
}

