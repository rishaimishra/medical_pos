import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifySupplierRequest } from "@/lib/auth";
import { requireSupplierPortalFeature } from "@/lib/entitlements";

/**
 * MODULE 1.12.2: SUPPLIER PORTAL ORDERS API
 * 
 * Allows authenticated suppliers to view Purchase Orders issued to their vendor account.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySupplierRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const gate = await requireSupplierPortalFeature(auth.session.supplierId, "supplierPortalAndGrn");
  if (!gate.allowed) return gate.response!;

  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get("status") || "all").toLowerCase();
  const search = (searchParams.get("search") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));

  try {
    const whereClause: any = {
      supplierId: auth.session.supplierId,
      status: { not: "draft" },
    };

    if (statusParam && statusParam !== "all") {
      if (statusParam === "draft") {
        return NextResponse.json({
          success: true,
          orders: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        });
      }
      whereClause.status = statusParam;
    }

    if (search) {
      whereClause.OR = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { invoiceNo: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, orders, allStatusGroups, totalValueAgg] = await Promise.all([
      prisma.purchaseOrder.count({ where: whereClause }),
      prisma.purchaseOrder.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: "desc" },
        include: {
          branch: { select: { id: true, code: true, name: true, phone: true } },
          items: {
            include: {
              medicine: {
                select: { id: true, name: true, genericName: true, company: true, hsnCode: true },
              },
            },
          },
        },
      }),
      prisma.purchaseOrder.groupBy({
        by: ["status"],
        where: { supplierId: auth.session.supplierId, status: { not: "draft" } },
        _count: { _all: true },
      }),
      prisma.purchaseOrder.aggregate({
        where: { supplierId: auth.session.supplierId, status: { notIn: ["draft", "cancelled"] } },
        _sum: { total: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      all: 0,
      pending: 0,
      price_updated: 0,
      confirmed: 0,
      shipped: 0,
      received: 0,
      cancelled: 0,
    };
    for (const g of allStatusGroups) {
      statusCounts.all += g._count._all;
      statusCounts[g.status] = (statusCounts[g.status] || 0) + g._count._all;
    }

    return NextResponse.json({
      success: true,
      orders,
      summary: {
        statusCounts,
        totalActiveValue: Number(totalValueAgg._sum.total || 0),
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error("GET /api/supplier/orders error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch orders" }, { status: 500 });
  }
}

