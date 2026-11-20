import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminRequest, verifyCustomerRequest } from "@/lib/auth";
import { canAccessPage } from "@/lib/rbac";
import { readPrescriptionBuffer, sanitizeFileName } from "@/lib/prescriptionFiles";
import { canStaffAccessPatientMessage } from "@/lib/customerRouting";

/**
 * Authenticated Prescription File Delivery Endpoint
 * - Pharmacy staff (/admin/pos or /admin/messages) may access any patient's file
 * - Authenticated customers may access ONLY their own uploaded prescription files
 * - Unauthenticated callers receive 401; wrong-customer callers receive 403
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (!id || isNaN(id)) {
    return NextResponse.json({ success: false, message: "Invalid prescription file ID" }, { status: 400 });
  }

  const adminAuth = await verifyAdminRequest(req);
  const custAuth = !adminAuth.authorized ? await verifyCustomerRequest(req) : null;

  const isAuthorizedStaff =
    adminAuth.authorized &&
    adminAuth.session &&
    (canAccessPage(adminAuth.session, "/admin/pos") ||
      canAccessPage(adminAuth.session, "/admin/messages"));

  const isAuthorizedCustomer = custAuth?.authorized && custAuth.session;

  if (!isAuthorizedStaff && !isAuthorizedCustomer) {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Authentication required to view prescription files" },
      { status: 401 }
    );
  }

  const msg = await prisma.patientMessage.findUnique({
    where: { id },
    include: { customer: { select: { storeId: true } } },
  });
  if (!msg || !msg.filePath) {
    return NextResponse.json({ success: false, message: "Prescription file not found" }, { status: 404 });
  }

  if (isAuthorizedStaff && adminAuth.session && !canStaffAccessPatientMessage(adminAuth.session, msg)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Prescription file belongs to another pharmacy store or branch" },
      { status: 403 }
    );
  }

  const linkedCustomerIds = custAuth?.session?.linkedCustomerIds ?? (custAuth?.session ? [custAuth.session.customerId] : []);
  if (!isAuthorizedStaff && isAuthorizedCustomer && !linkedCustomerIds.includes(msg.customerId)) {
    return NextResponse.json(
      { success: false, message: "Forbidden: You may only access your own prescription files" },
      { status: 403 }
    );
  }

  const fileData = await readPrescriptionBuffer(msg.filePath);
  if (!fileData) {
    return NextResponse.json({ success: false, message: "Stored file missing on disk" }, { status: 404 });
  }

  const downloadName = sanitizeFileName(msg.fileName || "prescription");
  const isDownload = new URL(req.url).searchParams.get("download") === "1";

  return new NextResponse(new Uint8Array(fileData.buffer), {
    status: 200,
    headers: {
      "Content-Type": msg.fileType || "application/octet-stream",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${downloadName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
