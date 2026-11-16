import { NextRequest, NextResponse } from "next/server";
import { prisma, runInTransaction } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { hasPermission, canAccessBranch } from "@/lib/rbac";
import { sendSupplierPoEmail } from "@/lib/email";

/**
 * MODULE 1.11.1 & 1.11.2: PURCHASE ORDERS GENERATION & LIFECYCLE
 * 
 * Endpoints:
 * - GET: Fetch paginated POs with search, status filters, and summary KPIs.
 * - POST: Create new Purchase Order with sequential PO number, line items, and supplier notification.
 */

export async function GET(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    auth.session.role !== "pharmacist" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to view purchase orders" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "25", 10)));
  const search = (searchParams.get("search") || "").trim();
  const statusParam = (searchParams.get("status") || "all").toLowerCase();
  const supplierIdParam = searchParams.get("supplierId");
  const branchIdParam = searchParams.get("branchId");

  try {
    const whereClause: any = {};

    // Branch scoping with IDOR protection
    let targetBranchId: number | undefined;
    if (branchIdParam && branchIdParam !== "all") {
      const parsedBranch = parseInt(branchIdParam, 10);
      if (!isNaN(parsedBranch)) {
        if (!canAccessBranch(auth.session, parsedBranch)) {
          return NextResponse.json({ success: false, message: "Forbidden: Cannot access requested branch" }, { status: 403 });
        }
        targetBranchId = parsedBranch;
      }
    } else if (auth.session.role !== "admin" && auth.session.branchId) {
      targetBranchId = auth.session.branchId;
    }

    if (targetBranchId) {
      whereClause.branchId = targetBranchId;
    }

    if (supplierIdParam && supplierIdParam !== "all") {
      whereClause.supplierId = parseInt(supplierIdParam, 10);
    }

    if (statusParam && statusParam !== "all") {
      whereClause.status = statusParam;
    }

    if (search) {
      whereClause.OR = [
        { poNumber: { contains: search, mode: "insensitive" } },
        { invoiceNo: { contains: search, mode: "insensitive" } },
        { supplier: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [totalPOs, purchaseOrders] = await Promise.all([
      prisma.purchaseOrder.count({ where: whereClause }),
      prisma.purchaseOrder.findMany({
        where: whereClause,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: "desc" },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              contact: true,
              phone: true,
              email: true,
              gstNo: true,
              dlNo: true,
            },
          },
          branch: {
            select: { id: true, code: true, name: true },
          },
          creator: {
            select: { id: true, name: true, username: true },
          },
          items: {
            include: {
              medicine: {
                select: {
                  id: true,
                  name: true,
                  genericName: true,
                  category: true,
                  company: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Calculate Summary Stats (scoped to branch if filtered)
    const statsWhere: any = {};
    if (whereClause.branchId) {
      statsWhere.branchId = whereClause.branchId;
    }
    const allForStats = await prisma.purchaseOrder.findMany({
      where: statsWhere,
      select: { status: true, total: true },
    });

    let pendingCount = 0;
    let confirmedCount = 0;
    let shippedCount = 0;
    let receivedCount = 0;
    let cancelledCount = 0;
    let totalSpend = 0;

    for (const po of allForStats) {
      if (po.status === "pending" || po.status === "price_updated" || po.status === "draft") pendingCount++;
      else if (po.status === "confirmed") confirmedCount++;
      else if (po.status === "shipped") shippedCount++;
      else if (po.status === "received") {
        receivedCount++;
        totalSpend += Number(po.total || 0);
      } else if (po.status === "cancelled") cancelledCount++;
    }

    return NextResponse.json({
      success: true,
      purchaseOrders,
      pagination: {
        page,
        limit,
        total: totalPOs,
        totalPages: Math.ceil(totalPOs / limit) || 1,
      },
      summary: {
        totalPOs: allForStats.length,
        pendingCount,
        confirmedCount,
        shippedCount,
        receivedCount,
        cancelledCount,
        totalSpend: Math.round(totalSpend * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error("GET /api/admin/purchases error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch purchase orders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  if (
    auth.session.role !== "admin" &&
    auth.session.role !== "manager" &&
    auth.session.role !== "pharmacist" &&
    !hasPermission(auth.session, "manage_purchases")
  ) {
    return NextResponse.json({ success: false, message: "Forbidden: Insufficient privileges to create purchase orders" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const supplierId = parseInt(body.supplierId, 10);
    const branchId = body.branchId ? parseInt(body.branchId, 10) : auth.session.branchId;
    const poDateStr = body.poDate || new Date().toISOString().slice(0, 10);
    const requestedStatus = (body.status || "pending").toLowerCase();
    if (requestedStatus === "received") {
      return NextResponse.json(
        {
          success: false,
          message: "Cannot create Purchase Order directly as 'received'. Physical goods must be inwarded via the GRN desk.",
        },
        { status: 400 }
      );
    }
    const status = requestedStatus === "draft" ? "draft" : "pending";
    const notes = (body.notes || "").trim() || null;
    const items = Array.isArray(body.items) ? body.items : [];

    if (!supplierId || isNaN(supplierId)) {
      return NextResponse.json({ success: false, message: "Supplier selection is required" }, { status: 400 });
    }

    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      return NextResponse.json({ success: false, message: "Selected supplier not found" }, { status: 404 });
    }

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: "Purchase order must contain at least one medicine item" }, { status: 400 });
    }

    // Validate each line item
    const validatedItems: Array<{
      medicineId: number;
      quantity: number;
      price: number;
      mrp: number;
    }> = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const medId = parseInt(it.medicineId, 10);
      const qty = parseInt(it.quantity, 10);
      const price = parseFloat(it.price);
      const mrp = parseFloat(it.mrp);

      if (!medId || isNaN(medId)) {
        return NextResponse.json({ success: false, message: `Item #${i + 1}: Medicine selection is required` }, { status: 400 });
      }
      if (isNaN(qty) || qty <= 0) {
        return NextResponse.json({ success: false, message: `Item #${i + 1}: Order quantity must be greater than zero` }, { status: 400 });
      }
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ success: false, message: `Item #${i + 1}: Purchase price cannot be negative` }, { status: 400 });
      }
      if (isNaN(mrp) || mrp < 0) {
        return NextResponse.json({ success: false, message: `Item #${i + 1}: MRP cannot be negative` }, { status: 400 });
      }

      validatedItems.push({ medicineId: medId, quantity: qty, price, mrp });
    }

    // Compute grand total
    const total = validatedItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const currentUserId = auth.session.userId;

    // Execute atomic creation with concurrency-safe sequential PO numbering
    const newPO = await runInTransaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const poPrefix = `PO-${currentYear}-`;

      let createdPO: any = null;
      let attempts = 0;

      while (!createdPO && attempts < 5) {
        attempts++;
        const lastPO = await tx.purchaseOrder.findFirst({
          where: { poNumber: { startsWith: poPrefix } },
          orderBy: { id: "desc" },
          select: { poNumber: true },
        });

        let nextSeq = 1;
        if (lastPO?.poNumber) {
          const parts = lastPO.poNumber.split("-");
          const lastNum = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(lastNum)) nextSeq = lastNum + (attempts === 1 ? 1 : attempts);
        }
        const poNumber = `${poPrefix}${String(nextSeq).padStart(5, "0")}`;

        try {
          createdPO = await tx.purchaseOrder.create({
            data: {
              poNumber,
              supplierId,
              branchId: branchId || null,
              poDate: new Date(poDateStr),
              status,
              total,
              notes,
              createdBy: currentUserId,
              items: {
                create: validatedItems.map((it) => ({
                  medicineId: it.medicineId,
                  quantity: it.quantity,
                  price: it.price,
                  mrp: it.mrp,
                  receivedQty: 0,
                })),
              },
            },
            include: {
              supplier: true,
              branch: true,
              items: {
                include: { medicine: true },
              },
            },
          });
        } catch (err: any) {
          if (err?.code === "P2002" && attempts < 5) {
            continue;
          }
          throw err;
        }
      }

      return createdPO;
    });

    await logAudit({
      userId: auth.session.userId,
      branchId: branchId || auth.session.branchId,
      action: "PO_CREATED",
      entity: "purchase_order",
      entityId: newPO.id,
      details: {
        poNumber: newPO.poNumber,
        supplierName: supplier.name,
        total: newPO.total,
        itemCount: validatedItems.length,
        status: newPO.status,
      },
      ipAddress: getClientIp(req),
    });

    if (supplier.email && status !== "draft") {
      sendSupplierPoEmail({
        type: "created",
        poNumber: newPO.poNumber,
        supplierName: supplier.name,
        supplierEmail: supplier.email,
        totalAmount: Number(newPO.total),
        itemsCount: validatedItems.length,
        branchName: newPO.branch?.name,
        notes: newPO.notes || undefined,
      }).catch((err) => console.error("Supplier PO create email error:", err));
    }

    return NextResponse.json({
      success: true,
      message: `Purchase Order ${newPO.poNumber} created successfully`,
      purchaseOrder: newPO,
    });
  } catch (error: any) {
    console.error("POST /api/admin/purchases error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to create purchase order" }, { status: 500 });
  }
}
