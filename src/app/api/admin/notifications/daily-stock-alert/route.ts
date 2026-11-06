import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-transaction";
import { verifyAdminRequest } from "@/lib/auth";
import { logAudit, getClientIp } from "@/lib/audit";
import { sendDailyStockAlertEmail } from "@/lib/email";

/**
 * MODULE 1.12.6: DAILY STOCK-ALERT EMAIL
 * 
 * Aggregates low-stock medicines and batches approaching expiry,
 * and sends an alert email to the store administrator at most once per 24 hours.
 */
export async function GET(req: NextRequest) {
  return handleDailyStockAlert(req);
}

export async function POST(req: NextRequest) {
  return handleDailyStockAlert(req);
}

async function handleDailyStockAlert(req: NextRequest) {
  const auth = await verifyAdminRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";

  try {
    const settings = await prisma.settings.findFirst({
      orderBy: { id: "asc" },
    });

    const storeName = settings?.storeName || "Medical POS Pharmacy";
    const recipientEmail = settings?.storeEmail || auth.session.email || "admin@example.com";
    const lowQtyThreshold = settings?.lowQty || 10;
    const expiryDaysThreshold = settings?.expiryDays || 90;

    // Rate-limit: At most once per 24 hours (unless force=true)
    const now = new Date();
    if (settings?.lastStockAlertSentAt && !force) {
      const elapsedHours = (now.getTime() - new Date(settings.lastStockAlertSentAt).getTime()) / (1000 * 60 * 60);
      if (elapsedHours < 24) {
        return NextResponse.json({
          success: true,
          skipped: true,
          message: `Daily stock alert already dispatched within the last 24 hours (${Math.round(elapsedHours)} hours ago). Use ?force=true to override.`,
          lastStockAlertSentAt: settings.lastStockAlertSentAt,
        });
      }
    }

    // 1. Calculate sellable (unexpired) stock per medicine to find low-stock items
    const medicines = await prisma.medicine.findMany({
      include: {
        batches: {
          where: { expiryDate: { gt: now } },
          select: { quantity: true },
        },
      },
    });

    const lowStockItems: Array<{ name: string; stock: number; threshold: number }> = [];
    for (const med of medicines) {
      const totalStock = med.batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
      if (totalStock <= lowQtyThreshold) {
        lowStockItems.push({
          name: med.name,
          stock: totalStock,
          threshold: lowQtyThreshold,
        });
      }
    }

    // 2. Find batches expiring within expiry threshold
    const expiryCutoff = new Date();
    expiryCutoff.setDate(expiryCutoff.getDate() + expiryDaysThreshold);

    const expiringBatchesRaw = await prisma.batch.findMany({
      where: {
        quantity: { gt: 0 },
        expiryDate: { lte: expiryCutoff },
      },
      include: { medicine: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
      take: 50,
    });

    const todayMs = new Date().setHours(0, 0, 0, 0);
    const expiringBatches = expiringBatchesRaw.map((b) => {
      const expMs = new Date(b.expiryDate).setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil((expMs - todayMs) / (1000 * 60 * 60 * 24));
      return {
        name: b.medicine.name,
        batchNo: b.batchNo,
        expiryDate: new Date(b.expiryDate).toISOString().slice(0, 10),
        daysLeft,
        stock: b.quantity,
      };
    });

    // 3. Dispatch email
    const emailResult = await sendDailyStockAlertEmail({
      adminEmail: recipientEmail,
      storeName,
      lowStockItems,
      expiringBatches,
    });

    // 4. Update lastStockAlertSentAt
    if (settings) {
      await prisma.settings.update({
        where: { id: settings.id },
        data: { lastStockAlertSentAt: now },
      });
    }

    await logAudit({
      userId: auth.session.userId,
      branchId: auth.session.branchId,
      action: "DAILY_STOCK_ALERT_SENT",
      entity: "inventory",
      details: {
        recipient: recipientEmail,
        lowStockCount: lowStockItems.length,
        expiringCount: expiringBatches.length,
        emailSuccess: emailResult.success,
      },
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      message: `Daily stock alert email sent to ${recipientEmail}`,
      lowStockCount: lowStockItems.length,
      expiringCount: expiringBatches.length,
      lastStockAlertSentAt: now.toISOString(),
      emailResult,
    });
  } catch (error: any) {
    console.error("Daily stock alert error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to send stock alert" }, { status: 500 });
  }
}
