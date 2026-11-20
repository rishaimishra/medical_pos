import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { buildCsvContent } from "@/lib/csv";
import { buildXlsxBuffer } from "@/lib/excel";

/**
 * MODULE 3.10.2: Global Platform & Cross-Store Forensic Audit Trail API
 * (`GET /api/super-admin/audit-logs`)
 * Combines `PlatformAuditLog` (CEO/Super Admin actions) and `AuditLog` (Store Tenant security events),
 * filterable by `source`, `storeId`, `branchId`, `action`, `search`, `startDate`, `endDate`, and supports `format=csv|xlsx`.
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const source = (searchParams.get("source") || "all").toLowerCase(); // all | platform | store
  const storeIdParam = searchParams.get("storeId");
  const branchIdParam = searchParams.get("branchId");
  const actionParam = (searchParams.get("action") || "").trim();
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const format = (searchParams.get("format") || "json").toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get("limit") || "50", 10)));

  try {
    const storeIdFilter =
      storeIdParam && storeIdParam !== "all" && !isNaN(Number(storeIdParam))
        ? Number(storeIdParam)
        : null;
    const branchIdFilter =
      branchIdParam && branchIdParam !== "all" && !isNaN(Number(branchIdParam))
        ? Number(branchIdParam)
        : null;

    const createdAtFilter: any = {};
    if (startDate) createdAtFilter.gte = new Date(`${startDate}T00:00:00.000Z`);
    if (endDate) createdAtFilter.lte = new Date(`${endDate}T23:59:59.999Z`);
    const hasDateFilter = Boolean(createdAtFilter.gte || createdAtFilter.lte);

    const platformWhere: any = {};
    if (storeIdFilter) platformWhere.storeId = storeIdFilter;
    if (actionParam && actionParam !== "all") platformWhere.action = actionParam;
    if (hasDateFilter) platformWhere.createdAt = createdAtFilter;
    if (search) {
      platformWhere.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entity: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
        { platformUser: { name: { contains: search, mode: "insensitive" } } },
        { platformUser: { username: { contains: search, mode: "insensitive" } } },
      ];
    }

    const storeWhere: any = {};
    if (storeIdFilter) storeWhere.storeId = storeIdFilter;
    if (branchIdFilter) storeWhere.branchId = branchIdFilter;
    if (actionParam && actionParam !== "all") storeWhere.action = actionParam;
    if (hasDateFilter) storeWhere.createdAt = createdAtFilter;
    if (search) {
      storeWhere.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { entity: { contains: search, mode: "insensitive" } },
        { details: { contains: search, mode: "insensitive" } },
        { ipAddress: { contains: search, mode: "insensitive" } },
        { store: { storeName: { contains: search, mode: "insensitive" } } },
        { branch: { name: { contains: search, mode: "insensitive" } } },
        { branch: { code: { contains: search, mode: "insensitive" } } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { username: { contains: search, mode: "insensitive" } } },
      ];
    }

    const isExport = format === "csv" || format === "xlsx" || format === "excel";
    const fetchTake = isExport ? 1000 : 300;

    const [platformLogs, storeLogs, stores, branches] = await Promise.all([
      source === "store" || branchIdFilter
        ? Promise.resolve([])
        : prisma.platformAuditLog.findMany({
            where: platformWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: fetchTake,
            include: {
              platformUser: { select: { id: true, name: true, username: true, role: true } },
            },
          }),
      source === "platform"
        ? Promise.resolve([])
        : prisma.auditLog.findMany({
            where: storeWhere,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: fetchTake,
            include: {
              store: { select: { id: true, storeName: true } },
              branch: { select: { id: true, code: true, name: true } },
              user: { select: { id: true, name: true, username: true, role: true } },
            },
          }),
      prisma.settings.findMany({
        where: { OR: [{ setupDone: true }, { branches: { some: {} } }] },
        orderBy: { id: "asc" },
        select: { id: true, storeName: true },
      }),
      prisma.branch.findMany({
        ...(storeIdFilter ? { where: { storeId: storeIdFilter } } : {}),
        orderBy: [{ storeId: "asc" }, { id: "asc" }],
        select: { id: true, storeId: true, code: true, name: true },
      }),
    ]);

    const storeNameMap = new Map(stores.map((s) => [s.id, s.storeName || `Store #${s.id}`]));

    const unified = [
      ...platformLogs.map((l) => ({
        uid: `platform-${l.id}`,
        id: l.id,
        source: "platform" as const,
        storeId: l.storeId,
        storeName: l.storeId ? storeNameMap.get(l.storeId) || `Store #${l.storeId}` : "Platform Global",
        branchId: null as number | null,
        branchName: null as string | null,
        actorName: l.platformUser?.name || "System / Webhook",
        actorRole: l.platformUser?.role || "system",
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        details: l.details,
        ipAddress: l.ipAddress || "127.0.0.1",
        createdAt: l.createdAt.toISOString(),
      })),
      ...storeLogs.map((l) => ({
        uid: `store-${l.id}`,
        id: l.id,
        source: "store" as const,
        storeId: l.storeId,
        storeName: l.store?.storeName || (l.storeId ? `Store #${l.storeId}` : "Unlinked Store"),
        branchId: l.branchId,
        branchName: l.branch ? `[${l.branch.code}] ${l.branch.name}` : null,
        actorName: l.user?.name || "Portal / System",
        actorRole: l.user?.role || "portal",
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        details: l.details,
        ipAddress: l.ipAddress || "127.0.0.1",
        createdAt: l.createdAt.toISOString(),
      })),
    ]
      .filter((row) => {
        if (!search) return true;
        const hay = [
          row.action,
          row.entity,
          row.actorName,
          row.actorRole,
          row.storeName,
          row.branchName,
          row.details,
          row.ipAddress,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(search);
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));

    if (format === "xlsx" || format === "excel") {
      const headers = [
        "Timestamp",
        "Source",
        "Store Tenant",
        "Branch",
        "Actor",
        "Role",
        "Action",
        "Entity",
        "Entity ID",
        "IP Address",
        "Details",
      ];
      const rows = unified.map((r) => [
        r.createdAt,
        r.source.toUpperCase(),
        r.storeName,
        r.branchName || "-",
        r.actorName,
        r.actorRole,
        r.action,
        r.entity,
        r.entityId ?? "",
        r.ipAddress,
        r.details || "",
      ]);

      const buf = buildXlsxBuffer([{ name: "Forensic Audit Trail", headers, rows }]);
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="platform_audit_logs_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    if (format === "csv") {
      const headers = [
        "Timestamp",
        "Source",
        "Store",
        "Branch",
        "Actor",
        "Role",
        "Action",
        "Entity",
        "Entity ID",
        "IP Address",
        "Details",
      ];
      const rows = unified.map((r) => [
        r.createdAt,
        r.source.toUpperCase(),
        r.storeName,
        r.branchName || "",
        r.actorName,
        r.actorRole,
        r.action,
        r.entity,
        r.entityId ?? "",
        r.ipAddress,
        r.details || "",
      ]);
      const csv = buildCsvContent(headers, rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="platform_audit_logs_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const totalCount = unified.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const offset = (page - 1) * limit;
    const paginated = unified.slice(offset, offset + limit);
    const distinctActions = Array.from(new Set(unified.map((u) => u.action))).sort();

    return NextResponse.json({
      success: true,
      logs: paginated,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
      summary: {
        totalEvents: totalCount,
        platformEvents: unified.filter((u) => u.source === "platform").length,
        storeEvents: unified.filter((u) => u.source === "store").length,
      },
      filterOptions: {
        stores,
        branches,
        actions: distinctActions,
      },
    });
  } catch (err: any) {
    console.error("[GET /api/super-admin/audit-logs Error]:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to query unified audit logs" },
      { status: 500 }
    );
  }
}
