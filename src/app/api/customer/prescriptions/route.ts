import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCustomerTargetStore, verifyCustomerRequest } from "@/lib/auth";
import { parseOptionalPositiveInt, resolveVerifiedStoreBranch } from "@/lib/customerRouting";
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
  const { searchParams } = new URL(req.url);
  const storeIdParam = searchParams.get("storeId");
  const filterStoreId =
    storeIdParam && storeIdParam !== "all" && !isNaN(Number(storeIdParam))
      ? Number(storeIdParam)
      : null;

  const rxPortalGate = await requireCustomerPortalFeature(
    auth.session.customerId,
    "patientPortalAndRxQueue",
    { linkedCustomerIds: linkedIds, targetStoreId: filterStoreId }
  );
  if (!rxPortalGate.allowed) return rxPortalGate.response!;

  try {
    const records = await prisma.patientMessage.findMany({
      where: {
        customerId: { in: linkedIds },
        ...(filterStoreId
          ? { OR: [{ storeId: filterStoreId }, { storeId: null, customer: { storeId: filterStoreId } }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        store: { select: { id: true, storeName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      prescriptions: records.map((r) => ({
        id: r.id,
        storeId: r.storeId,
        storeName: r.store?.storeName || null,
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
    const linkedIds = auth.session.linkedCustomerIds ?? [auth.session.customerId];
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let notes = "";
    let doctorName = "";
    let fulfillmentMode = "pickup";
    let requestedStoreId: number | null = null;
    let requestedBranchId: number | null = null;
    let formFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      notes = String(form.get("message") || form.get("notes") || "").trim();
      doctorName = String(form.get("doctorName") || "").trim();
      fulfillmentMode = String(form.get("fulfillmentMode") || "pickup").trim();
      requestedStoreId = parseOptionalPositiveInt(form.get("storeId"));
      requestedBranchId = parseOptionalPositiveInt(form.get("branchId"));

      const fileField = form.get("file");
      if (fileField && typeof fileField === "object" && "arrayBuffer" in fileField) {
        const f = fileField as File;
        if (f.size > 0) formFile = f;
      }
    } else {
      const body = await req.json();
      notes = String(body.message || body.notes || "").trim();
      doctorName = String(body.doctorName || "").trim();
      fulfillmentMode = String(body.fulfillmentMode || "pickup").trim();
      requestedStoreId = parseOptionalPositiveInt(body.storeId);
      requestedBranchId = parseOptionalPositiveInt(body.branchId);
    }

    const resolvedStore = await resolveCustomerTargetStore(
      auth.session.customerId,
      linkedIds,
      requestedStoreId
    );
    const targetStoreId = resolvedStore.storeId;

    const branchResolution = await resolveVerifiedStoreBranch(targetStoreId, requestedBranchId);
    if (!branchResolution.ok) return branchResolution.response;
    const targetBranchId = branchResolution.branchId;

    const rxFeature = await requireStoreFeature(targetStoreId, "patientPortalAndRxQueue", {
      forExternalPortal: true,
    });
    if (!rxFeature.allowed) return rxFeature.response!;

    let storedRelativePath: string | null = null;
    let safeFileName: string | null = null;
    let normalizedMime: string | null = null;

    if (formFile) {
      const uploadMb = Math.max(0.01, formFile.size / (1024 * 1024));
      const rxStorageQuota = await checkStoreQuota(targetStoreId, "maxRxStorageMb", {
        incrementBy: uploadMb,
        forExternalPortal: true,
      });
      if (!rxStorageQuota.allowed) return rxStorageQuota.response!;

      const arrayBuf = await formFile.arrayBuffer();
      const saved = await savePrescriptionBuffer(
        resolvedStore.targetCustomerId,
        formFile.name || "prescription.jpg",
        formFile.type || "",
        Buffer.from(arrayBuf)
      );
      storedRelativePath = saved.storedRelativePath;
      safeFileName = saved.safeFileName;
      normalizedMime = saved.normalizedMime;
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
        storeId: targetStoreId,
        branchId: targetBranchId,
        customerId: resolvedStore.targetCustomerId,
        direction: "in",
        message: formattedMessageParts.join("\n") || "Prescription uploaded for billing review.",
        filePath: storedRelativePath,
        fileName: safeFileName,
        fileType: normalizedMime,
        isRead: false,
      },
    });

    // Notify originating pharmacy store email best-effort
    if (resolvedStore.storeEmail) {
      sendEmail({
        to: resolvedStore.storeEmail,
        subject: `[New Prescription Request] ${auth.session.name} (${auth.session.phone})`,
        html: `<p>Patient <strong>${escapeHtml(auth.session.name)}</strong> (${escapeHtml(auth.session.phone)}) submitted a prescription / order request.</p><p>${escapeHtml(created.message || "").replace(/\n/g, "<br/>")}</p>`,
        text: `New Prescription Request from ${auth.session.name} (${auth.session.phone}):\n${created.message || ""}`,
        storeId: targetStoreId,
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
