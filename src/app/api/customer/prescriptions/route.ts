import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCustomerRequest } from "@/lib/auth";
import { savePrescriptionBuffer } from "@/lib/prescriptionFiles";
import { escapeHtml, sendEmail } from "@/lib/email";
import { checkStoreQuota, requireCustomerPortalFeature, requireStoreFeature } from "@/lib/entitlements";

/**
 * MODULE 2.18.2: Digital Prescription Upload & Order Request (Customer Portal)
 * - GET: Lists patient's uploaded prescriptions & pharmacy responses
 * - POST: Uploads prescription image/PDF (stored outside public/) & creates PatientMessage order request
 */
export async function GET(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];

  const rxPortalGate = await requireCustomerPortalFeature(
    auth.session.customerId,
    "patientPortalAndRxQueue"
  );
  if (!rxPortalGate.allowed) return rxPortalGate.response!;

  try {
    const records = await prisma.patientMessage.findMany({
      where: { customerId: { in: linkedIds } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      prescriptions: records.map((r) => ({
        id: r.id,
        direction: r.direction,
        message: r.message,
        hasFile: Boolean(r.filePath),
        fileName: r.fileName,
        fileType: r.fileType,
        fileUrl: r.filePath ? `/api/prescriptions/file/${r.id}` : null,
        isRead: r.isRead,
        statusLabel: r.isRead ? "Verified / Reviewed by Pharmacy" : "Pending Pharmacist Review",
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    console.error("GET /api/customer/prescriptions error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch prescriptions" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyCustomerRequest(req);
  if (!auth.authorized || !auth.session) {
    return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
  }

  try {
    const cust = await prisma.customer.findUnique({
      where: { id: auth.session.customerId },
      select: { storeId: true },
    });
    const targetStoreId = cust?.storeId ?? null;

    const rxFeature = await requireStoreFeature(targetStoreId, "patientPortalAndRxQueue", {
      forExternalPortal: true,
    });
    if (!rxFeature.allowed) return rxFeature.response!;

    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let notes = "";
    let doctorName = "";
    let fulfillmentMode = "pickup";
    let storedRelativePath: string | null = null;
    let safeFileName: string | null = null;
    let normalizedMime: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      notes = String(form.get("message") || form.get("notes") || "").trim();
      doctorName = String(form.get("doctorName") || "").trim();
      fulfillmentMode = String(form.get("fulfillmentMode") || "pickup").trim();

      const fileField = form.get("file");
      if (fileField && typeof fileField === "object" && "arrayBuffer" in fileField) {
        const f = fileField as File;
        if (f.size > 0) {
          const uploadMb = Math.max(0.01, f.size / (1024 * 1024));
          const rxStorageQuota = await checkStoreQuota(targetStoreId, "maxRxStorageMb", {
            incrementBy: uploadMb,
            forExternalPortal: true,
          });
          if (!rxStorageQuota.allowed) return rxStorageQuota.response!;

          const arrayBuf = await f.arrayBuffer();
          const saved = await savePrescriptionBuffer(
            auth.session.customerId,
            f.name || "prescription.jpg",
            f.type || "",
            Buffer.from(arrayBuf)
          );
          storedRelativePath = saved.storedRelativePath;
          safeFileName = saved.safeFileName;
          normalizedMime = saved.normalizedMime;
        }
      }
    } else {
      const body = await req.json();
      notes = String(body.message || body.notes || "").trim();
      doctorName = String(body.doctorName || "").trim();
      fulfillmentMode = String(body.fulfillmentMode || "pickup").trim();
    }

    if (!storedRelativePath && !notes) {
      return NextResponse.json(
        { success: false, message: "Please attach a prescription file (PDF/JPG/PNG/HEIC) or enter medicine notes." },
        { status: 400 }
      );
    }

    const formattedMessageParts = [
      doctorName ? `Prescribing Doctor: ${doctorName}` : "",
      fulfillmentMode ? `Order Preference: ${fulfillmentMode === "delivery" ? "Home Delivery" : "Counter Pickup"}` : "",
      notes,
    ].filter(Boolean);

    const created = await prisma.patientMessage.create({
      data: {
        customerId: auth.session.customerId,
        direction: "in",
        message: formattedMessageParts.join("\n") || "Prescription uploaded for billing review.",
        filePath: storedRelativePath,
        fileName: safeFileName,
        fileType: normalizedMime,
        isRead: false,
      },
    });

    // Notify pharmacy store email best-effort
    const store = await prisma.settings.findFirst({
      orderBy: { id: "asc" },
      select: { storeEmail: true, storeName: true },
    });
    if (store?.storeEmail) {
      sendEmail({
        to: store.storeEmail,
        subject: `[New Prescription Request] ${auth.session.name} (${auth.session.phone})`,
        html: `<p>Patient <strong>${escapeHtml(auth.session.name)}</strong> (${escapeHtml(auth.session.phone)}) submitted a prescription / order request.</p><p>${escapeHtml(created.message || "").replace(/\n/g, "<br/>")}</p>`,
        text: `New Prescription Request from ${auth.session.name} (${auth.session.phone}):\n${created.message || ""}`,
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        message: "Prescription uploaded! The pharmacist has been notified to prepare your bill.",
        prescription: {
          id: created.id,
          message: created.message,
          hasFile: Boolean(created.filePath),
          fileName: created.fileName,
          fileType: created.fileType,
          fileUrl: created.filePath ? `/api/prescriptions/file/${created.id}` : null,
          isRead: created.isRead,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/customer/prescriptions error:", error);
    const isValidation =
      error?.message?.includes("Unsupported file") ||
      error?.message?.includes("exceeds maximum") ||
      error?.message?.includes("empty");
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to upload prescription" },
      { status: isValidation ? 400 : 500 }
    );
  }
}
