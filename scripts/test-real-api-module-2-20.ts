/**
 * Integration Test Suite for MODULE 2.20: Message Inboxes & Secure Prescription Files
 *
 * - 2.20.1: Patient Message Inbox (Admin/Staff per-patient conversations, in/out reply,
 *           unread counts, mark read, delete message/conversation + disk cleanup)
 * - 2.20.2: Supplier Message Inbox & Contact Form (/api/supplier/contact -> Admin Inbox
 *           unread status, reply, delete)
 * - 2.20.3: Secure Prescription File Delivery (HEIC/PNG/PDF outside public/, sanitized
 *           filenames blocking path traversal, 401/403 isolation, staff full access)
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { PRESCRIPTION_STORAGE_DIR } from "../src/lib/prescriptionFiles";
import { POST as customerAuthPost } from "../src/app/api/auth/customer/route";
import {
  GET as getAdminPatientMessages,
  POST as postAdminPatientMessage,
  PATCH as patchAdminPatientMessage,
  DELETE as deleteAdminPatientMessage,
} from "../src/app/api/admin/patient-messages/route";
import {
  GET as getCustomerMessages,
  POST as postCustomerMessage,
  PATCH as patchCustomerMessage,
} from "../src/app/api/customer/messages/route";
import { POST as postCustomerPrescription } from "../src/app/api/customer/prescriptions/route";
import { GET as getPrescriptionFile } from "../src/app/api/prescriptions/file/[id]/route";
import { POST as postSupplierContact } from "../src/app/api/supplier/contact/route";
import { GET as getAdminSupplierMessages } from "../src/app/api/admin/messages/route";
import {
  PATCH as patchAdminSupplierMessage,
  DELETE as deleteAdminSupplierMessage,
} from "../src/app/api/admin/messages/[id]/route";

let adminCookie = "";
let customerCookie = "";

function adminReq(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(adminCookie ? { cookie: `med_pos_admin_session=${adminCookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function customerReq(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(customerCookie ? { cookie: `med_pos_customer_session=${customerCookie}` } : {}),
    },
    ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✔ [PASS] ${desc}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failedTests++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log("INTEGRATION TEST SUITE: MODULE 2.20 (MESSAGE INBOXES & SECURE RX FILES)");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const storeRow = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = storeRow?.id || 1;

  let branchId = 0;
  let staffId = 0;
  let custAId = 0;
  let custBId = 0;
  let createdContactMsgId = 0;
  const diskFilesToCheck: string[] = [];

  try {
    const branch = await prisma.branch.create({
      data: {
        code: `M${runId.toString().slice(-4)}`,
        name: `Inbox Branch ${runId}`,
        storeId,
        active: true,
      },
    });
    branchId = branch.id;

    const pwHash = await hashPassword("Inbox@123");
    const staff = await prisma.user.create({
      data: {
        name: `Inbox Staff ${runId}`,
        username: `inbx_${runId}`,
        email: `inbx_${runId}@pharmacy.local`,
        password: pwHash,
        role: "pharmacist",
        permissions: JSON.stringify(["manage_customers"]),
        branchId,
        storeId,
        active: true,
      },
    });
    staffId = staff.id;

    const ts = Date.now();
    adminCookie = createSessionToken({
      userId: staff.id,
      storeId,
      username: staff.username,
      name: staff.name,
      email: staff.email,
      role: "pharmacist",
      branchId,
      permissions: ["manage_customers"],
      allowedPages: ["/admin/dashboard", "/admin/messages", "/admin/pos"],
      maxDiscountPercent: 10,
      issuedAt: ts,
      lastActive: ts,
    });

    const custA = await prisma.customer.create({
      data: {
        name: `Patient One ${runId}`,
        phone: `95${runId}01`,
        email: `p1_${runId}@patient.local`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });
    custAId = custA.id;

    const custB = await prisma.customer.create({
      data: {
        name: `Patient Two ${runId}`,
        phone: `95${runId}02`,
        email: `p2_${runId}@patient.local`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });
    custBId = custB.id;

    const loginARes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.1.1" },
        body: JSON.stringify({ identifier: custA.phone, password: "Inbox@123" }),
      })
    );
    const cookieA = loginARes.cookies.get("med_pos_customer_session")?.value || "";

    const loginBRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.1.2" },
        body: JSON.stringify({ identifier: custB.phone, password: "Inbox@123" }),
      })
    );
    const cookieB = loginBRes.cookies.get("med_pos_customer_session")?.value || "";

    // =========================================================================
    // [1] 2.20.3 SECURE PRESCRIPTION FILES OUTSIDE PUBLIC & TRAVERSAL GUARD
    // =========================================================================
    console.log("\n[1] Testing 2.20.3: Secure Prescription Storage, HEIC & Sanitization...");
    assert(
      !PRESCRIPTION_STORAGE_DIR.split(path.sep).includes("public"),
      `Storage dir is outside public/ web root (${PRESCRIPTION_STORAGE_DIR})`
    );

    customerCookie = cookieA;
    const traversalForm = new FormData();
    traversalForm.append("message", `Check Rx ${runId}`);
    const heicBytes = Buffer.from("\x00\x00\x00\x18ftypheic-fake-rx-bytes");
    traversalForm.append(
      "file",
      new File([heicBytes], "../../../etc/passwd;rm rx?.heic", { type: "image/heic" })
    );

    const upRes = await postCustomerPrescription(
      customerReq("http://localhost:3000/api/customer/prescriptions", "POST", traversalForm)
    );
    const upJson = await upRes.json();
    const rxMsgId = upJson.prescription?.id;
    const rxDb = rxMsgId ? await prisma.patientMessage.findUnique({ where: { id: rxMsgId } }) : null;
    const storedDiskPath = rxDb?.filePath
      ? path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(rxDb.filePath))
      : "";
    if (storedDiskPath) diskFilesToCheck.push(storedDiskPath);

    assert(
      upRes.status === 201 &&
        Boolean(rxDb?.filePath) &&
        !rxDb!.fileName!.includes("..") &&
        !rxDb!.fileName!.includes("/") &&
        storedDiskPath.startsWith(PRESCRIPTION_STORAGE_DIR + path.sep) &&
        fs.existsSync(storedDiskPath),
      `HEIC uploaded cleanly outside public/ with sanitized filename (${rxDb?.fileName})`
    );

    // Bug 10 regression: reject spoofed MIME on disallowed .html extension AND fake PNG magic bytes
    const spoofExtForm = new FormData();
    spoofExtForm.append("message", "Spoofed extension test");
    spoofExtForm.append("file", new File([Buffer.from("<script>alert(1)</script>")], "evil.html", { type: "image/png" }));
    const spoofExtRes = await postCustomerPrescription(
      customerReq("http://localhost:3000/api/customer/prescriptions", "POST", spoofExtForm)
    );

    const badMagicForm = new FormData();
    badMagicForm.append("message", "Spoofed magic bytes test");
    badMagicForm.append("file", new File([Buffer.from("NOT-A-REAL-PNG-HEADER")], "fake.png", { type: "image/png" }));
    const badMagicRes = await postCustomerPrescription(
      customerReq("http://localhost:3000/api/customer/prescriptions", "POST", badMagicForm)
    );
    assert(
      spoofExtRes.status === 400 && badMagicRes.status === 400,
      "Rejects spoofed MIME .html extension (400) and mismatched magic-byte PNG upload (400)"
    );

    // Access matrix: Unauth 401, Cust B 403, Cust A 200, Staff 200
    customerCookie = "";
    const fUnauth = await getPrescriptionFile(
      customerReq(`http://localhost:3000/api/prescriptions/file/${rxMsgId}`),
      { params: Promise.resolve({ id: String(rxMsgId) }) }
    );
    customerCookie = cookieB;
    const fWrongCust = await getPrescriptionFile(
      customerReq(`http://localhost:3000/api/prescriptions/file/${rxMsgId}`),
      { params: Promise.resolve({ id: String(rxMsgId) }) }
    );
    customerCookie = cookieA;
    const fOwner = await getPrescriptionFile(
      customerReq(`http://localhost:3000/api/prescriptions/file/${rxMsgId}`),
      { params: Promise.resolve({ id: String(rxMsgId) }) }
    );
    const fStaff = await getPrescriptionFile(
      adminReq(`http://localhost:3000/api/prescriptions/file/${rxMsgId}`),
      { params: Promise.resolve({ id: String(rxMsgId) }) }
    );

    assert(
      fUnauth.status === 401 && fWrongCust.status === 403 && fOwner.status === 200 && fStaff.status === 200,
      "File endpoint enforces Unauth=401, Other Customer=403, Owner=200, Staff=200"
    );

    // =========================================================================
    // [2] 2.20.1 PATIENT MESSAGE INBOX (ADMIN/STAFF & CUSTOMER PORTAL)
    // =========================================================================
    console.log("\n[2] Testing 2.20.1: Patient Message Inbox (Conversations, Reply, Mark Read, Delete)...");

    const savedAdmin = adminCookie;
    adminCookie = "";
    const unauthInboxRes = await getAdminPatientMessages(
      adminReq("http://localhost:3000/api/admin/patient-messages")
    );
    assert(unauthInboxRes.status === 401, "Unauthenticated request to admin patient inbox blocked (401)");
    adminCookie = savedAdmin;

    // Customer sends text follow-up inquiry
    const custSendRes = await postCustomerMessage(
      customerReq("http://localhost:3000/api/customer/messages", "POST", {
        message: `Do you have evening delivery? ${runId}`,
      })
    );
    assert(custSendRes.status === 201, "Customer sends follow-up support message");

    // Admin fetches inbox -> conversation grouped with unreadCount >= 2
    const inboxRes = await getAdminPatientMessages(
      adminReq(`http://localhost:3000/api/admin/patient-messages?customerId=${custAId}`)
    );
    const inboxJson = await inboxRes.json();
    const convA = (inboxJson.conversations || []).find((c: any) => c.customerId === custAId);
    assert(
      inboxRes.status === 200 &&
        convA?.unreadCount === 2 &&
        inboxJson.thread?.length === 2,
      `Admin inbox groups Patient One conversation with unreadCount=2 and 2 chronological messages`
    );

    // Admin replies -> direction="out" created & inbound marked read
    const replyRes = await postAdminPatientMessage(
      adminReq("http://localhost:3000/api/admin/patient-messages", "POST", {
        customerId: custAId,
        message: "Yes, we deliver between 6 PM and 8 PM.",
      })
    );
    const replyJson = await replyRes.json();
    const outPatientMsgId = replyJson.data?.id;
    const afterReplyInbox = await getAdminPatientMessages(
      adminReq(`http://localhost:3000/api/admin/patient-messages?customerId=${custAId}`)
    );
    const afterReplyJson = await afterReplyInbox.json();
    const convAAfterReply = (afterReplyJson.conversations || []).find((c: any) => c.customerId === custAId);
    assert(
      replyRes.status === 201 &&
        convAAfterReply?.unreadCount === 0 &&
        afterReplyJson.thread?.length === 3 &&
        afterReplyJson.thread[2]?.direction === "out",
      "Admin reply posts direction='out' message and clears inbound unreadCount"
    );

    // Bug 16 regression: admin cannot mark outbound staff message read via PATCH
    const patchOutPatientRes = await patchAdminPatientMessage(
      adminReq("http://localhost:3000/api/admin/patient-messages", "PATCH", {
        id: outPatientMsgId,
        isRead: true,
      })
    );
    assert(
      patchOutPatientRes.status === 400,
      "Admin cannot alter read status of outbound staff message (400)"
    );

    // Customer sees unread staff reply and marks read
    const custInboxRes = await getCustomerMessages(
      customerReq("http://localhost:3000/api/customer/messages")
    );
    const custInboxJson = await custInboxRes.json();
    const custMarkReadRes = await patchCustomerMessage(
      customerReq("http://localhost:3000/api/customer/messages", "PATCH", { markAllRead: true })
    );
    const custAfterMark = await getCustomerMessages(
      customerReq("http://localhost:3000/api/customer/messages")
    );
    const custAfterMarkJson = await custAfterMark.json();
    assert(
      custInboxRes.status === 200 &&
        custInboxJson.unreadFromPharmacyCount === 1 &&
        custMarkReadRes.status === 200 &&
        custAfterMarkJson.unreadFromPharmacyCount === 0,
      "Customer receives staff reply (unread=1) and marks read (unread=0)"
    );

    // Mark unread/read toggle via PATCH /api/admin/patient-messages
    const toggleRes = await patchAdminPatientMessage(
      adminReq("http://localhost:3000/api/admin/patient-messages", "PATCH", {
        customerId: custAId,
        isRead: true,
      })
    );
    assert(toggleRes.status === 200, "Admin marks conversation read via PATCH");

    // Delete single message + Delete whole conversation & confirm disk attachment deleted
    const delSingleRes = await deleteAdminPatientMessage(
      adminReq(`http://localhost:3000/api/admin/patient-messages?id=${rxMsgId}`, "DELETE")
    );
    assert(
      delSingleRes.status === 200 && !fs.existsSync(storedDiskPath),
      "Deleting message removes DB record AND unlinks prescription attachment file on disk"
    );

    const delConvRes = await deleteAdminPatientMessage(
      adminReq(`http://localhost:3000/api/admin/patient-messages?customerId=${custAId}`, "DELETE")
    );
    const remainingMsgs = await prisma.patientMessage.count({ where: { customerId: custAId } });
    assert(delConvRes.status === 200 && remainingMsgs === 0, "Deleting full conversation clears remaining thread");

    // =========================================================================
    // [3] 2.20.2 SUPPLIER CONTACT FORM -> ADMIN INBOX
    // =========================================================================
    console.log("\n[3] Testing 2.20.2: Supplier Contact Form -> Admin Inbox...");
    const contactEmail = `vendor_contact_${runId}@pharma.local`;
    const contactRes = await postSupplierContact(
      new NextRequest("http://localhost:3000/api/supplier/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: `Contact Pharma ${runId}`,
          senderEmail: contactEmail,
          phone: `94${runId}01`,
          subject: `Rate List Inquiry ${runId}`,
          message: "Please share your monthly procurement schedule.",
        }),
      })
    );
    const contactJson = await contactRes.json();
    const supMsgId = contactJson.data?.id || 0;
    createdContactMsgId = supMsgId;

    const bogusSupplierCount = await prisma.supplier.count({
      where: { name: `Contact Pharma ${runId}` },
    });
    const supInboxRes = await getAdminSupplierMessages(
      adminReq("http://localhost:3000/api/admin/messages")
    );
    const supInboxJson = await supInboxRes.json();
    assert(
      contactRes.status === 201 &&
        contactJson.data?.supplierId === null &&
        bogusSupplierCount === 0 &&
        supInboxJson.messages?.some(
          (m: any) =>
            m.id === supMsgId &&
            m.status === "unread" &&
            m.supplierName === `Contact Pharma ${runId}` &&
            m.senderEmail === contactEmail
        ),
      "Public Supplier Contact Form lands cleanly in Admin Supplier Inbox (supplierId=null, no Supplier master pollution)"
    );

    const supReplyRes = await patchAdminSupplierMessage(
      adminReq(`http://localhost:3000/api/admin/messages/${supMsgId}`, "PATCH", {
        action: "reply",
        reply: "Thank you, our purchasing team will contact you Friday.",
      }),
      { params: Promise.resolve({ id: String(supMsgId) }) }
    );
    const supReplyJson = await supReplyRes.json();
    const supDelRes = await deleteAdminSupplierMessage(
      adminReq(`http://localhost:3000/api/admin/messages/${supMsgId}`, "DELETE"),
      { params: Promise.resolve({ id: String(supMsgId) }) }
    );
    assert(
      supReplyRes.status === 200 && supReplyJson.data?.status === "replied" && supDelRes.status === 200,
      "Admin replies to supplier contact message and deletes thread cleanly"
    );
  } finally {
    console.log("\nCleaning up Module 2.20 test fixtures...");
    for (const fp of diskFilesToCheck) {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    if (custAId || custBId) {
      const cIds = [custAId, custBId].filter(Boolean);
      await prisma.patientMessage.deleteMany({ where: { customerId: { in: cIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: cIds } } });
    }
    if (createdContactMsgId) {
      await prisma.supplierMessage.deleteMany({ where: { id: createdContactMsgId } });
    }
    if (staffId) {
      await prisma.auditLog.deleteMany({ where: { userId: staffId } });
      await prisma.user.deleteMany({ where: { id: staffId } });
    }
    if (branchId) {
      await prisma.auditLog.deleteMany({ where: { branchId } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\nSUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
