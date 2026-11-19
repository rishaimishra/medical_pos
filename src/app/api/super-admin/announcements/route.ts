import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySuperAdminRequest } from "@/lib/auth";
import { getClientIp, logPlatformAudit } from "@/lib/audit";

/**
 * MODULE 3.3.4: Platform Broadcast Announcements API (`/api/super-admin/announcements`)
 */
export async function GET(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const [announcements, stores, plans] = await Promise.all([
      prisma.platformAnnouncement.findMany({
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: { author: { select: { name: true, role: true } } },
      }),
      prisma.settings.findMany({
        orderBy: { id: "asc" },
        select: { id: true, storeName: true },
      }),
      prisma.subscriptionPlan.findMany({
        orderBy: { sortOrder: "asc" },
        select: { code: true, name: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      announcements,
      stores,
      plans,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to load announcements" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const title = String(body.title || "").trim().slice(0, 255);
    const message = String(body.message || "").trim();
    const severity = ["info", "warning", "urgent"].includes(String(body.severity || "").toLowerCase())
      ? String(body.severity).toLowerCase()
      : "info";
    const targetPlanCode = body.targetPlanCode ? String(body.targetPlanCode).trim() : null;
    const targetStoreId = body.targetStoreId ? parseInt(String(body.targetStoreId), 10) : null;
    const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;

    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (expiresAt && isNaN(expiresAt.getTime())) {
      return NextResponse.json({ success: false, message: "Invalid expiresAt timestamp." }, { status: 400 });
    }

    const created = await prisma.platformAnnouncement.create({
      data: {
        platformUserId: auth.session.platformUserId,
        title,
        message,
        severity,
        targetPlanCode,
        targetStoreId: targetStoreId && !isNaN(targetStoreId) ? targetStoreId : null,
        expiresAt,
        active: true,
      },
    });

    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      storeId: created.targetStoreId,
      action: "PLATFORM_ANNOUNCEMENT_PUBLISHED",
      entity: "platform_announcements",
      entityId: created.id,
      details: { title: created.title, severity: created.severity, targetStoreId: created.targetStoreId },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, announcement: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to publish announcement" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const id = parseInt(String(body.id || ""), 10);
    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: "Valid ID required" }, { status: 400 });
    }

    const updated = await prisma.platformAnnouncement.update({
      where: { id },
      data: { active: Boolean(body.active) },
    });

    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      action: updated.active ? "PLATFORM_ANNOUNCEMENT_ACTIVATED" : "PLATFORM_ANNOUNCEMENT_PAUSED",
      entity: "platform_announcements",
      entityId: id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, announcement: updated });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to update announcement" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifySuperAdminRequest(req, ["ceo", "platform_admin"]);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "", 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Valid id required" }, { status: 400 });
  }

  try {
    await prisma.platformAnnouncement.delete({ where: { id } });
    await logPlatformAudit({
      platformUserId: auth.session.platformUserId,
      action: "PLATFORM_ANNOUNCEMENT_DELETED",
      entity: "platform_announcements",
      entityId: id,
      ipAddress: getClientIp(req),
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || "Failed to delete announcement" },
      { status: 500 }
    );
  }
}
