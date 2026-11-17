/**
 * Integration Test Suite for MODULE 2.18: Patient & Customer Portal
 *
 * - 2.18.1: Customer Account & Purchase Archive (login, itemized order history, Rx filter,
 *           printable invoice detail with store tax info, strict cross-customer IDOR isolation)
 * - 2.18.2: Digital Prescription Upload & Order Request (safe outside-public storage, MIME/extension validation,
 *           authenticated file delivery RBAC, admin notification bell, pharmacist Rx queue & mark-verified)
 */

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { PRESCRIPTION_STORAGE_DIR } from "../src/lib/prescriptionFiles";
import { POST as customerAuthPost } from "../src/app/api/auth/customer/route";
import { GET as getCustomerOrders } from "../src/app/api/customer/orders/route";
import { GET as getCustomerOrderDetail } from "../src/app/api/customer/orders/[id]/route";
import {
  GET as getCustomerPrescriptions,
  POST as postCustomerPrescription,
} from "../src/app/api/customer/prescriptions/route";
import { GET as getPrescriptionFile } from "../src/app/api/prescriptions/file/[id]/route";
import {
  GET as getAdminPrescriptions,
  PATCH as patchAdminPrescription,
} from "../src/app/api/admin/prescriptions/route";
import { GET as getAdminNotifications } from "../src/app/api/admin/notifications/route";

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
  console.log("INTEGRATION TEST SUITE: MODULE 2.18 (CUSTOMER PURCHASE ARCHIVE & RX UPLOAD)");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const storeRow = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = storeRow?.id || 1;

  let branchId = 0;
  let adminUserId = 0;
  let custAId = 0;
  let custBId = 0;
  const createdMedIds: number[] = [];
  const createdBatchIds: number[] = [];
  const createdSaleIds: number[] = [];
  const createdMsgIds: number[] = [];
  const savedDiskFiles: string[] = [];

  try {
    const branch = await prisma.branch.create({
      data: {
        code: `C${runId.toString().slice(-4)}`,
        name: `Patient Portal Branch ${runId}`,
        storeId,
        active: true,
      },
    });
    branchId = branch.id;

    const pwHash = await hashPassword("PatientPass@123");
    const adminUser = await prisma.user.create({
      data: {
        name: `Pharmacist 2.18 ${runId}`,
        username: `ph218_${runId}`,
        email: `ph218_${runId}@pharmacy.local`,
        password: pwHash,
        role: "pharmacist",
        permissions: JSON.stringify(["manage_medicines"]),
        branchId,
        storeId,
        active: true,
      },
    });
    adminUserId = adminUser.id;

    const ts = Date.now();
    adminCookie = createSessionToken({
      userId: adminUser.id,
      storeId,
      username: adminUser.username,
      name: adminUser.name,
      email: adminUser.email,
      role: "pharmacist",
      branchId,
      permissions: ["manage_medicines"],
      allowedPages: ["/admin/dashboard", "/admin/pos", "/admin/messages"],
      maxDiscountPercent: 10,
      issuedAt: ts,
      lastActive: ts,
    });

    const custA = await prisma.customer.create({
      data: {
        name: `Patient Alpha ${runId}`,
        phone: `97${runId}01`,
        email: `pt_a_${runId}@patient.local`,
        address: "123 Park Street",
        password: pwHash,
        active: true,
        verified: true,
        isChronic: true,
        chronicDiseases: "Diabetes",
      },
    });
    custAId = custA.id;

    const custB = await prisma.customer.create({
      data: {
        name: `Patient Beta ${runId}`,
        phone: `97${runId}02`,
        email: `pt_b_${runId}@patient.local`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });
    custBId = custB.id;

    const medOtc = await prisma.medicine.create({
      data: {
        name: `OtcMed ${runId}`,
        company: "HealthCo",
        category: "Tablet",
        hsnCode: "3004",
        gstPercent: 12,
        scheduleType: "normal",
      },
    });
    const medRx = await prisma.medicine.create({
      data: {
        name: `RxMed ${runId}`,
        company: "HealthCo",
        category: "Tablet",
        hsnCode: "3004",
        gstPercent: 12,
        scheduleType: "schedule_h",
      },
    });
    createdMedIds.push(medOtc.id, medRx.id);

    const bOtc = await prisma.batch.create({
      data: {
        medicineId: medOtc.id,
        batchNo: `BOTC-${runId}`,
        expiryDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
        quantity: 50,
        purchasePrice: 40,
        mrp: 100,
        branchId,
      },
    });
    const bRx = await prisma.batch.create({
      data: {
        medicineId: medRx.id,
        batchNo: `BRX-${runId}`,
        expiryDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
        quantity: 50,
        purchasePrice: 80,
        mrp: 200,
        branchId,
      },
    });
    createdBatchIds.push(bOtc.id, bRx.id);

    const todayUtc = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

    // Sale 1 for Customer A (Rx order ₹400)
    const saleARx = await prisma.sale.create({
      data: {
        invoiceNo: `INV-218A1-${runId}`,
        customerId: custAId,
        saleDate: todayUtc,
        totalAmount: 357.14,
        gstAmount: 42.86,
        grandTotal: 400,
        paymentMethod: "upi",
        doctorName: "Dr. R. Gupta",
        doctorRegNo: "WBMC-4421",
        branchId,
        items: {
          create: {
            medicineId: medRx.id,
            batchId: bRx.id,
            quantity: 2,
            mrp: 200,
            taxableBase: 357.14,
            gstPercent: 12,
            gstAmount: 42.86,
            price: 400,
          },
        },
      },
    });
    // Sale 2 for Customer A (OTC ₹100)
    const saleAOtc = await prisma.sale.create({
      data: {
        invoiceNo: `INV-218A2-${runId}`,
        customerId: custAId,
        saleDate: todayUtc,
        totalAmount: 89.29,
        gstAmount: 10.71,
        grandTotal: 100,
        paymentMethod: "cash",
        branchId,
        items: {
          create: {
            medicineId: medOtc.id,
            batchId: bOtc.id,
            quantity: 1,
            mrp: 100,
            taxableBase: 89.29,
            gstPercent: 12,
            gstAmount: 10.71,
            price: 100,
          },
        },
      },
    });
    // Sale 3 for Customer B (must remain strictly isolated!)
    const saleB = await prisma.sale.create({
      data: {
        invoiceNo: `INV-218B-${runId}`,
        customerId: custBId,
        saleDate: todayUtc,
        totalAmount: 178.57,
        gstAmount: 21.43,
        grandTotal: 200,
        paymentMethod: "cash",
        branchId,
        items: {
          create: {
            medicineId: medOtc.id,
            batchId: bOtc.id,
            quantity: 2,
            mrp: 100,
            taxableBase: 178.57,
            gstPercent: 12,
            gstAmount: 21.43,
            price: 200,
          },
        },
      },
    });
    createdSaleIds.push(saleARx.id, saleAOtc.id, saleB.id);

    // =========================================================================
    // [1] AUTHENTICATION & 2.18.1 PURCHASE ARCHIVE
    // =========================================================================
    console.log("\n[1] Testing Customer Login & Purchase Archive (2.18.1)...");
    const unauthRes = await getCustomerOrders(
      customerReq("http://localhost:3000/api/customer/orders")
    );
    assert(unauthRes.status === 401, "Unauthenticated request to /api/customer/orders rejected (401)");

    const loginARes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: custA.phone, password: "PatientPass@123" }),
      })
    );
    const cookieA = loginARes.cookies.get("med_pos_customer_session")?.value || "";
    customerCookie = cookieA;
    assert(loginARes.status === 200 && cookieA.includes("."), "Customer A authenticated with session cookie");

    const ordersRes = await getCustomerOrders(
      customerReq("http://localhost:3000/api/customer/orders")
    );
    const ordersJson = await ordersRes.json();
    assert(
      ordersRes.status === 200 &&
        ordersJson.orders?.length === 2 &&
        ordersJson.summary?.totalOrders === 2 &&
        ordersJson.summary?.rxOrdersCount === 1 &&
        ordersJson.summary?.netSpent === 500,
      "Customer A sees all 2 own invoices (₹500 net spent, 1 Rx order; Customer B hidden)"
    );

    const rxFilterRes = await getCustomerOrders(
      customerReq("http://localhost:3000/api/customer/orders?filter=rx")
    );
    const rxFilterJson = await rxFilterRes.json();
    assert(
      rxFilterRes.status === 200 &&
        rxFilterJson.orders?.length === 1 &&
        rxFilterJson.orders[0].invoiceNo === `INV-218A1-${runId}`,
      "Rx filter returns strictly prescription invoices"
    );

    const detailRes = await getCustomerOrderDetail(
      customerReq(`http://localhost:3000/api/customer/orders/${saleARx.id}`),
      { params: Promise.resolve({ id: String(saleARx.id) }) }
    );
    const detailJson = await detailRes.json();
    assert(
      detailRes.status === 200 &&
        detailJson.invoice?.doctorName === "Dr. R. Gupta" &&
        Boolean(detailJson.invoice?.store?.name) &&
        detailJson.invoice?.items?.length === 1,
      "Single Invoice API returns full printable tax invoice with store & doctor metadata"
    );

    const crossCustDetailRes = await getCustomerOrderDetail(
      customerReq(`http://localhost:3000/api/customer/orders/${saleB.id}`),
      { params: Promise.resolve({ id: String(saleB.id) }) }
    );
    assert(crossCustDetailRes.status === 404, "Customer A cannot access Customer B's invoice (404)");

    // =========================================================================
    // [2] 2.18.2 DIGITAL PRESCRIPTION UPLOAD, FILE SECURITY & PHARMACIST QUEUE
    // =========================================================================
    console.log("\n[2] Testing Digital Prescription Upload & Pharmacist Notification/POS Queue (2.18.2)...");
    const badForm = new FormData();
    badForm.append(
      "file",
      new File([Buffer.from("MZ...")], "../../evil.exe", { type: "application/x-msdownload" })
    );
    const badUploadRes = await postCustomerPrescription(
      customerReq("http://localhost:3000/api/customer/prescriptions", "POST", badForm)
    );
    assert(badUploadRes.status === 400, "Disallowed file extension (.exe) blocked with 400");

    const samplePdfBytes = Buffer.from("%PDF-1.4\n%Test Prescription Document\n%%EOF");
    const goodForm = new FormData();
    goodForm.append("doctorName", "Dr. Sen");
    goodForm.append("fulfillmentMode", "delivery");
    goodForm.append("message", `Please deliver Metformin 500mg (${runId})`);
    goodForm.append(
      "file",
      new File([samplePdfBytes], "../my rx scan.pdf", { type: "application/pdf" })
    );

    const uploadRes = await postCustomerPrescription(
      customerReq("http://localhost:3000/api/customer/prescriptions", "POST", goodForm)
    );
    const uploadJson = await uploadRes.json();
    const rxId = uploadJson.prescription?.id;
    if (rxId) createdMsgIds.push(rxId);

    const dbMsg = rxId ? await prisma.patientMessage.findUnique({ where: { id: rxId } }) : null;
    if (dbMsg?.filePath) {
      savedDiskFiles.push(path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(dbMsg.filePath)));
    }
    assert(
      uploadRes.status === 201 &&
        Boolean(dbMsg?.filePath) &&
        !dbMsg?.fileName?.includes("..") &&
        fs.existsSync(path.resolve(PRESCRIPTION_STORAGE_DIR, path.basename(dbMsg!.filePath!))),
      "Valid PDF prescription uploaded outside public/ with sanitized filename & saved to disk"
    );

    // File delivery authorization checks
    const savedCookieA = customerCookie;
    customerCookie = "";
    const noAuthFileRes = await getPrescriptionFile(
      customerReq(`http://localhost:3000/api/prescriptions/file/${rxId}`),
      { params: Promise.resolve({ id: String(rxId) }) }
    );
    assert(noAuthFileRes.status === 401, "Unauthenticated access to prescription file blocked (401)");

    // Customer B attempts to download Customer A's prescription
    const loginBRes = await customerAuthPost(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: custB.phone, password: "PatientPass@123" }),
      })
    );
    customerCookie = loginBRes.cookies.get("med_pos_customer_session")?.value || "";
    const wrongCustFileRes = await getPrescriptionFile(
      customerReq(`http://localhost:3000/api/prescriptions/file/${rxId}`),
      { params: Promise.resolve({ id: String(rxId) }) }
    );
    assert(wrongCustFileRes.status === 403, "Customer B blocked (403) from viewing Customer A's prescription file");

    // Customer A downloads own file
    customerCookie = savedCookieA;
    const ownerFileRes = await getPrescriptionFile(
      customerReq(`http://localhost:3000/api/prescriptions/file/${rxId}`),
      { params: Promise.resolve({ id: String(rxId) }) }
    );
    const ownerFileBuf = Buffer.from(await ownerFileRes.arrayBuffer());
    assert(
      ownerFileRes.status === 200 &&
        ownerFileRes.headers.get("x-content-type-options") === "nosniff" &&
        ownerFileBuf.equals(samplePdfBytes),
      "Customer A downloads own prescription PDF intact with nosniff header"
    );

    // Pharmacist views prescription file & receives dashboard notification
    const notifRes = await getAdminNotifications(
      adminReq(`http://localhost:3000/api/admin/notifications?branchId=${branchId}`)
    );
    const notifJson = await notifRes.json();
    assert(
      notifRes.status === 200 &&
        (notifJson.notifications || []).some(
          (n: any) =>
            n.type === "prescription" &&
            n.href === `/admin/pos?rxCustomerId=${custAId}&rxMessageId=${rxId}`
        ),
      "Admin Notification Bell surfaces new patient prescription linking straight to POS"
    );

    const staffFileRes = await getPrescriptionFile(
      adminReq(`http://localhost:3000/api/prescriptions/file/${rxId}`),
      { params: Promise.resolve({ id: String(rxId) }) }
    );
    assert(staffFileRes.status === 200, "Pharmacist can view uploaded prescription file (200 OK)");

    const queueRes = await getAdminPrescriptions(
      adminReq("http://localhost:3000/api/admin/prescriptions?filter=unread")
    );
    const queueJson = await queueRes.json();
    assert(
      queueRes.status === 200 &&
        queueJson.unreadCount >= 1 &&
        (queueJson.prescriptions || []).some((p: any) => p.id === rxId),
      "Pharmacist Rx Queue lists Customer A's pending prescription"
    );

    // Pharmacist marks Rx verified -> Patient portal sees updated status label
    const verifyRes = await patchAdminPrescription(
      adminReq("http://localhost:3000/api/admin/prescriptions", "PATCH", {
        id: rxId,
        isRead: true,
      })
    );
    const custRxRes = await getCustomerPrescriptions(
      customerReq("http://localhost:3000/api/customer/prescriptions")
    );
    const custRxJson = await custRxRes.json();
    const matchedRx = (custRxJson.prescriptions || []).find((p: any) => p.id === rxId);
    assert(
      verifyRes.status === 200 &&
        matchedRx?.isRead === true &&
        matchedRx?.statusLabel === "Verified / Reviewed by Pharmacy",
      "Marking Rx verified updates customer portal status to 'Verified / Reviewed by Pharmacy'"
    );
  } finally {
    console.log("\nCleaning up Module 2.18 test fixtures...");
    for (const f of savedDiskFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    if (createdMsgIds.length) {
      await prisma.patientMessage.deleteMany({ where: { id: { in: createdMsgIds } } });
    }
    if (createdSaleIds.length) {
      await prisma.saleItem.deleteMany({ where: { saleId: { in: createdSaleIds } } });
      await prisma.sale.deleteMany({ where: { id: { in: createdSaleIds } } });
    }
    if (createdBatchIds.length) {
      await prisma.batch.deleteMany({ where: { id: { in: createdBatchIds } } });
    }
    if (createdMedIds.length) {
      await prisma.medicine.deleteMany({ where: { id: { in: createdMedIds } } });
    }
    if (custAId || custBId) {
      await prisma.customer.deleteMany({ where: { id: { in: [custAId, custBId].filter(Boolean) } } });
    }
    if (adminUserId) {
      await prisma.user.deleteMany({ where: { id: adminUserId } });
    }
    if (branchId) {
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
