import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest } from "@/lib/auth";
import { canAccessBranch, canAccessPage } from "@/lib/rbac";

/**
 * GET /api/admin/cash-drawer/closings
 * Lists historical Z-Reports and shift closures.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (!canAccessPage(auth.session, "/admin/financials") && !canAccessPage(auth.session, "/admin/reports")) {
    return NextResponse.json({ success: false, message: "Forbidden: Access to Z-Reports denied" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const branchIdParam = searchParams.get("branchId");
  const status = searchParams.get("status"); // "all" | "exact" | "excess" | "shortage"
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
  const skip = (page - 1) * limit;

  try {
    const whereClause: any = {};

    if (auth.session.storeId) {
      whereClause.storeId = auth.session.storeId;
    }

    if (auth.session.branchId) {
      whereClause.branchId = auth.session.branchId;
    } else if (branchIdParam && branchIdParam !== "all") {
      const bId = parseInt(branchIdParam, 10);
      if (!isNaN(bId) && canAccessBranch(auth.session, bId)) {
        whereClause.branchId = bId;
      }
    }

    if (status && status !== "all") {
      whereClause.status = status;
    }

    if (startDate || endDate) {
      whereClause.shiftEnd = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        whereClause.shiftEnd.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        whereClause.shiftEnd.lte = end;
      }
    }

    const [closings, totalCount, allMatching] = await Promise.all([
      prisma.cashDrawerClosing.findMany({
        where: whereClause,
        include: {
          branch: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, name: true, role: true } },
        },
        orderBy: { shiftEnd: "desc" },
        skip,
        take: limit,
      }),
      prisma.cashDrawerClosing.count({ where: whereClause }),
      prisma.cashDrawerClosing.findMany({
        where: whereClause,
        select: {
          expectedCash: true,
          countedCash: true,
          difference: true,
          status: true,
        },
      }),
    ]);

    let totalExpected = 0;
    let totalCounted = 0;
    let totalDifference = 0;
    let exactCount = 0;
    let excessCount = 0;
    let shortageCount = 0;

    for (const c of allMatching) {
      totalExpected += Number(c.expectedCash);
      totalCounted += Number(c.countedCash);
      totalDifference += Number(c.difference);
      if (c.status === "exact") exactCount++;
      else if (c.status === "excess") excessCount++;
      else if (c.status === "shortage") shortageCount++;
    }

    return NextResponse.json({
      success: true,
      closings,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      summary: {
        totalClosings: totalCount,
        totalExpected: Math.round(totalExpected * 100) / 100,
        totalCounted: Math.round(totalCounted * 100) / 100,
        netDifference: Math.round(totalDifference * 100) / 100,
        statusCounts: {
          exact: exactCount,
          excess: excessCount,
          shortage: shortageCount,
        },
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/cash-drawer/closings error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to list cash drawer closings" },
      { status: 500 }
    );
  }
}
