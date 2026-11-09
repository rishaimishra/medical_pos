import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifySupplierRequest } from "@/lib/auth";

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

    const [total, orders] = await Promise.all([
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
    ]);

    return NextResponse.json({
      success: true,
      orders,
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

