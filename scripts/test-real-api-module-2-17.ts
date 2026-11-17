/**
 * Integration Test Suite for MODULE 2.17: Supplier Self-Service Portal
 *
 * - 2.17.1: Supplier Order Tracking Dashboard (Portal login, multi-supplier + draft isolation,
 *           price quote update, admin confirmation, supplier dispatch/shipped & challan update, supplied batches)
 * - 2.17.2: Supplier Two-Way Messaging Channel (Supplier -> Admin inbox, Notification bell,
 *           Admin Mark Read / Reply / Outbound compose / Delete, Supplier Mark Read & cross-tenant isolation)
 */

import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import { createSessionToken, hashPassword } from "../src/lib/auth";
import { POST as supplierAuthPost } from "../src/app/api/auth/supplier/route";
import { GET as getSupplierOrders } from "../src/app/api/supplier/orders/route";
import {
  GET as getSupplierOrderDetail,
  PUT as updateSupplierOrderPrice,
  PATCH as dispatchSupplierOrder,
} from "../src/app/api/supplier/orders/[id]/route";
import { GET as getSupplierBatches } from "../src/app/api/supplier/batches/route";
import {
  GET as getSupplierMessages,
  POST as postSupplierMessage,
  PATCH as patchSupplierMessage,
} from "../src/app/api/supplier/messages/route";
import {
  GET as getAdminMessages,
  POST as postAdminMessage,
} from "../src/app/api/admin/messages/route";
import {
  PATCH as patchAdminMessage,
  DELETE as deleteAdminMessage,
} from "../src/app/api/admin/messages/[id]/route";
import { PUT as updateAdminPo } from "../src/app/api/admin/purchases/[id]/route";
import { GET as getAdminNotifications } from "../src/app/api/admin/notifications/route";

let adminCookie = "";
let supplierCookie = "";

function adminRequest(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(adminCookie ? { cookie: `med_pos_admin_session=${adminCookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function supplierRequest(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(supplierCookie ? { cookie: `med_pos_supplier_session=${supplierCookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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
  console.log("INTEGRATION TEST SUITE: MODULE 2.17 (SUPPLIER PORTAL TRACKING & MESSAGING)");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const storeRow = await prisma.settings.findFirst({ orderBy: { id: "asc" } });
  const storeId = storeRow?.id || 1;

  let branchId = 0;
  let adminUserId = 0;
  let supplierAId = 0;
  let supplierBId = 0;
  let medicineId = 0;
  const createdBatchIds: number[] = [];
  const createdPoIds: number[] = [];
  const createdMsgIds: number[] = [];

  try {
    const branch = await prisma.branch.create({
      data: {
        code: `S${runId.toString().slice(-4)}`,
        name: `Supplier Test Branch ${runId}`,
        storeId,
        active: true,
      },
    });
    branchId = branch.id;

    const pwHash = await hashPassword("SupPass@123");
    const adminUser = await prisma.user.create({
      data: {
        name: `Admin 2.17 ${runId}`,
        username: `adm217_${runId}`,
        email: `adm217_${runId}@pharmacy.local`,
        password: pwHash,
        role: "admin",
        permissions: JSON.stringify(["manage_purchases", "manage_settings"]),
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
      role: "admin",
      branchId,
      permissions: ["manage_purchases", "manage_settings"],
      allowedPages: ["/admin/dashboard", "/admin/purchases", "/admin/messages", "/admin/suppliers"],
      maxDiscountPercent: 100,
      issuedAt: ts,
      lastActive: ts,
    });

    const supA = await prisma.supplier.create({
      data: {
        name: `Alpha Med Distributors ${runId}`,
        phone: `91${runId}01`,
        email: `alpha_${runId}@vendor.local`,
      },
    });
    supplierAId = supA.id;

    const supAUser = await prisma.supplierUser.create({
      data: {
        supplierId: supA.id,
        name: "Alpha Rep",
        username: `alpha_u_${runId}`,
        email: `alpha_u_${runId}@vendor.local`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });

    const supB = await prisma.supplier.create({
      data: {
        name: `Beta Med Distributors ${runId}`,
        phone: `91${runId}02`,
        email: `beta_${runId}@vendor.local`,
      },
    });
    supplierBId = supB.id;

    const supBUser = await prisma.supplierUser.create({
      data: {
        supplierId: supB.id,
        name: "Beta Rep",
        username: `beta_u_${runId}`,
        email: `beta_u_${runId}@vendor.local`,
        password: pwHash,
        active: true,
        verified: true,
      },
    });

    const med = await prisma.medicine.create({
      data: {
        name: `SupTestDrug ${runId}`,
        company: "Alpha Labs",
        category: "Tablet",
        hsnCode: "3004",
        gstPercent: 12,
      },
    });
    medicineId = med.id;

    const batchA = await prisma.batch.create({
      data: {
        medicineId,
        batchNo: `B217-${runId}`,
        expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        quantity: 40,
        purchasePrice: 55,
        mrp: 90,
        supplierId: supplierAId,
        branchId,
      },
    });
    createdBatchIds.push(batchA.id);

    // Seed PO 1 for Supplier A (pending), PO 2 for Supplier A (draft - must stay hidden), PO 3 for Supplier B (must stay isolated)
    const poA = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-217A-${runId}`,
        supplierId: supplierAId,
        branchId,
        status: "pending",
        total: 500,
        items: {
          create: {
            medicineId,
            quantity: 10,
            price: 50,
            mrp: 90,
          },
        },
      },
      include: { items: true },
    });
    const poADraft = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-217D-${runId}`,
        supplierId: supplierAId,
        branchId,
        status: "draft",
        total: 100,
      },
    });
    const poB = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-217B-${runId}`,
        supplierId: supplierBId,
        branchId,
        status: "confirmed",
        total: 900,
      },
    });
    createdPoIds.push(poA.id, poADraft.id, poB.id);

    // =========================================================================
    // [1] SUPPLIER LOGIN & AUTHENTICATION
    // =========================================================================
    console.log("\n[1] Testing Supplier Portal Login & Authentication...");
    const badLoginRes = await supplierAuthPost(
      new NextRequest("http://localhost:3000/api/auth/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: supAUser.username, password: "WrongPassword!" }),
      })
    );
    assert(badLoginRes.status === 401, "Wrong supplier password rejected with 401");

    const loginRes = await supplierAuthPost(
      new NextRequest("http://localhost:3000/api/auth/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: supAUser.username, password: "SupPass@123" }),
      })
    );
    const loginJson = await loginRes.json();
    const rawCookie = loginRes.cookies.get("med_pos_supplier_session")?.value || "";
    supplierCookie = rawCookie;
    assert(
      loginRes.status === 200 && loginJson.authenticated === true && rawCookie.includes("."),
      "Supplier A logged in and received HMAC session cookie"
    );

    // =========================================================================
    // [2] 2.17.1: ORDER TRACKING, ISOLATION, QUOTE, CONFIRMATION & DISPATCH
    // =========================================================================
    console.log("\n[2] Testing Module 2.17.1: Order Tracking, Quote & Shipment Dispatch...");
    const listRes = await getSupplierOrders(
      supplierRequest("http://localhost:3000/api/supplier/orders")
    );
    const listJson = await listRes.json();
    assert(
      listRes.status === 200 &&
        listJson.orders.length === 1 &&
        listJson.orders[0].id === poA.id &&
        listJson.summary?.statusCounts?.pending === 1,
      "Supplier A sees only its non-draft POs with accurate status summary (draft & Supplier B hidden)"
    );

    const otherPoRes = await getSupplierOrderDetail(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poB.id}`),
      { params: Promise.resolve({ id: String(poB.id) }) }
    );
    assert(otherPoRes.status === 404, "Cross-supplier PO access returns 404 Not Found");

    // Cannot dispatch unconfirmed pending PO
    const earlyDispatchRes = await dispatchSupplierOrder(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poA.id}`, "PATCH", {
        status: "shipped",
        invoiceNo: "CHL-EARLY",
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    assert(earlyDispatchRes.status === 400, "Cannot mark unconfirmed pending PO as shipped (400)");

    // Bug 8 regression: reject zero/negative unit price and non-numeric NaN MRP on quote update
    const zeroPriceRes = await updateSupplierOrderPrice(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poA.id}`, "PUT", {
        items: [{ itemId: poA.items[0].id, price: 0, mrp: 95 }],
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    const nanMrpRes = await updateSupplierOrderPrice(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poA.id}`, "PUT", {
        items: [{ itemId: poA.items[0].id, price: 55, mrp: "not-a-number" }],
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    assert(
      zeroPriceRes.status === 400 && nanMrpRes.status === 400,
      "Rejects zero unit price (400) and invalid non-numeric MRP (400) on supplier PO quote"
    );

    // Supplier updates price quote -> status becomes 'price_updated'
    const quoteRes = await updateSupplierOrderPrice(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poA.id}`, "PUT", {
        items: [{ itemId: poA.items[0].id, price: 55, mrp: 95 }],
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    const quoteJson = await quoteRes.json();
    assert(
      quoteRes.status === 200 &&
        quoteJson.purchaseOrder?.status === "price_updated" &&
        Number(quoteJson.purchaseOrder?.total) === 550,
      "Supplier quote update transitions PO to price_updated and recalculates total (₹550)"
    );

    // Admin confirms PO -> locks prices
    const confirmRes = await updateAdminPo(
      adminRequest(`http://localhost:3000/api/admin/purchases/${poA.id}`, "PUT", {
        action: "update_status",
        status: "confirmed",
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    assert(confirmRes.status === 200, "Pharmacy admin confirms PO and locks prices");

    // Supplier cannot set invalid status 'received'
    const recvAttemptRes = await dispatchSupplierOrder(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poA.id}`, "PATCH", {
        status: "received",
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    assert(recvAttemptRes.status === 400, "Supplier cannot bypass GRN to mark order as received (400)");

    // Supplier marks confirmed PO as shipped with challan invoiceNo
    const dispatchRes = await dispatchSupplierOrder(
      supplierRequest(`http://localhost:3000/api/supplier/orders/${poA.id}`, "PATCH", {
        status: "shipped",
        invoiceNo: `CHL-${runId}`,
        notes: "Dispatched via Express Logistics",
      }),
      { params: Promise.resolve({ id: String(poA.id) }) }
    );
    const dispatchJson = await dispatchRes.json();
    assert(
      dispatchRes.status === 200 &&
        dispatchJson.purchaseOrder?.status === "shipped" &&
        dispatchJson.purchaseOrder?.invoiceNo === `CHL-${runId}` &&
        Boolean(dispatchJson.purchaseOrder?.shippedAt),
      "Confirmed PO transitions cleanly to 'shipped' with Challan No and shippedAt timestamp"
    );

    // Supplied Batches live API check
    const batchRes = await getSupplierBatches(
      supplierRequest("http://localhost:3000/api/supplier/batches")
    );
    const batchJson = await batchRes.json();
    assert(
      batchRes.status === 200 &&
        batchJson.batches?.length === 1 &&
        batchJson.summary?.totalStockUnits === 40,
      "Supplied Batches API returns live batch count & 40 stock units for Supplier A"
    );

    // =========================================================================
    // [3] 2.17.2: TWO-WAY SUPPLIER MESSAGING CHANNEL
    // =========================================================================
    console.log("\n[3] Testing Module 2.17.2: Two-Way Supplier Messaging Channel...");
    const savedSupplierCookie = supplierCookie;
    supplierCookie = "";
    const unauthMsgRes = await getSupplierMessages(
      supplierRequest("http://localhost:3000/api/supplier/messages")
    );
    assert(unauthMsgRes.status === 401, "Unauthenticated supplier message fetch blocked (401)");
    supplierCookie = savedSupplierCookie;

    // Supplier A sends inquiry
    const sendMsgRes = await postSupplierMessage(
      supplierRequest("http://localhost:3000/api/supplier/messages", "POST", {
        subject: `Dispatch Notice ${runId}`,
        message: "Challan attached. ETA tomorrow morning.",
      })
    );
    const sendMsgJson = await sendMsgRes.json();
    const inboundMsgId = sendMsgJson.data?.id;
    if (inboundMsgId) createdMsgIds.push(inboundMsgId);
    assert(
      sendMsgRes.status === 201 &&
        sendMsgJson.data?.direction === "in" &&
        sendMsgJson.data?.status === "unread",
      "Supplier A sends inbound message cleanly (direction='in', status='unread')"
    );

    // Admin Notifications surfaces unread supplier message
    const notifRes = await getAdminNotifications(
      adminRequest(`http://localhost:3000/api/admin/notifications?branchId=${branchId}`)
    );
    const notifJson = await notifRes.json();
    assert(
      notifRes.status === 200 &&
        (notifJson.notifications || []).some(
          (n: any) => n.type === "message" && n.href === "/admin/messages" && n.message.includes(`Dispatch Notice ${runId}`)
        ),
      "Admin Notification Bell surfaces unread supplier message linking to /admin/messages"
    );

    // Admin inbox lists message, marks read, then replies
    const admInboxRes = await getAdminMessages(
      adminRequest(`http://localhost:3000/api/admin/messages?supplierId=${supplierAId}`)
    );
    const admInboxJson = await admInboxRes.json();
    assert(
      admInboxRes.status === 200 &&
        admInboxJson.messages.some((m: any) => m.id === inboundMsgId) &&
        admInboxJson.unreadCount >= 1,
      "Admin inbox receives Supplier A inquiry with unreadCount >= 1"
    );

    const markReadRes = await patchAdminMessage(
      adminRequest(`http://localhost:3000/api/admin/messages/${inboundMsgId}`, "PATCH", {
        status: "read",
      }),
      { params: Promise.resolve({ id: String(inboundMsgId) }) }
    );
    const markReadJson = await markReadRes.json();
    assert(markReadRes.status === 200 && markReadJson.data?.status === "read", "Admin marks message as read");

    const replyRes = await patchAdminMessage(
      adminRequest(`http://localhost:3000/api/admin/messages/${inboundMsgId}`, "PATCH", {
        action: "reply",
        reply: "Thank you, GRN counter is ready at 9 AM.",
      }),
      { params: Promise.resolve({ id: String(inboundMsgId) }) }
    );
    const replyJson = await replyRes.json();
    assert(
      replyRes.status === 200 &&
        replyJson.data?.status === "replied" &&
        replyJson.data?.reply?.includes("9 AM") &&
        Boolean(replyJson.data?.repliedAt),
      "Admin reply updates status to 'replied' with timestamp"
    );

    // Admin initiates direct outbound message to Supplier A
    const outRes = await postAdminMessage(
      adminRequest("http://localhost:3000/api/admin/messages", "POST", {
        supplierId: supplierAId,
        subject: `Stock Request ${runId}`,
        message: "Please confirm availability for 50 boxes next week.",
      })
    );
    const outJson = await outRes.json();
    const outboundMsgId = outJson.data?.id;
    if (outboundMsgId) createdMsgIds.push(outboundMsgId);
    assert(
      outRes.status === 201 && outJson.data?.direction === "out" && outJson.data?.status === "unread",
      "Admin initiates outbound message to Supplier A (direction='out', status='unread')"
    );

    // Bug 9 regression: admin cannot mark/reply to its own outbound message
    const outMarkReadRes = await patchAdminMessage(
      adminRequest(`http://localhost:3000/api/admin/messages/${outboundMsgId}`, "PATCH", {
        status: "read",
      }),
      { params: Promise.resolve({ id: String(outboundMsgId) }) }
    );
    const outSelfReplyRes = await patchAdminMessage(
      adminRequest(`http://localhost:3000/api/admin/messages/${outboundMsgId}`, "PATCH", {
        action: "reply",
        reply: "Cannot self reply",
      }),
      { params: Promise.resolve({ id: String(outboundMsgId) }) }
    );
    assert(
      outMarkReadRes.status === 400 && outSelfReplyRes.status === 400,
      "Blocks admin from marking read or replying to direction='out' supplier message (400)"
    );

    // Supplier A views inbox: sees reply on original + 1 unread outbound message from admin
    const supInboxRes = await getSupplierMessages(
      supplierRequest("http://localhost:3000/api/supplier/messages")
    );
    const supInboxJson = await supInboxRes.json();
    assert(
      supInboxRes.status === 200 &&
        supInboxJson.unreadFromAdminCount === 1 &&
        supInboxJson.messages.some((m: any) => m.id === inboundMsgId && m.reply?.includes("9 AM")) &&
        supInboxJson.messages.some((m: any) => m.id === outboundMsgId && m.direction === "out"),
      "Supplier A inbox shows admin's reply AND 1 unread outbound inquiry from admin"
    );

    // Supplier B isolation check on messages
    const loginBRes = await supplierAuthPost(
      new NextRequest("http://localhost:3000/api/auth/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: supBUser.username, password: "SupPass@123" }),
      })
    );
    supplierCookie = loginBRes.cookies.get("med_pos_supplier_session")?.value || "";
    const supBMsgRes = await getSupplierMessages(
      supplierRequest("http://localhost:3000/api/supplier/messages")
    );
    const supBMsgJson = await supBMsgRes.json();
    const supBTamperRes = await patchSupplierMessage(
      supplierRequest("http://localhost:3000/api/supplier/messages", "PATCH", { id: outboundMsgId }),
      );
    assert(
      supBMsgRes.status === 200 && supBMsgJson.messages.length === 0 && supBTamperRes.status === 404,
      "Cross-supplier messaging strictly isolated (Supplier B sees 0 messages, cannot mark Supplier A's message -> 404)"
    );

    // Switch back to Supplier A and mark admin outbound read
    supplierCookie = rawCookie;
    const markSupReadRes = await patchSupplierMessage(
      supplierRequest("http://localhost:3000/api/supplier/messages", "PATCH", { markAllRead: true })
    );
    const afterMarkRes = await getSupplierMessages(
      supplierRequest("http://localhost:3000/api/supplier/messages")
    );
    const afterMarkJson = await afterMarkRes.json();
    assert(
      markSupReadRes.status === 200 && afterMarkJson.unreadFromAdminCount === 0,
      "Supplier A marks inbound admin messages as read (unreadFromAdminCount = 0)"
    );

    // Admin deletes test message
    const delRes = await deleteAdminMessage(
      adminRequest(`http://localhost:3000/api/admin/messages/${inboundMsgId}`, "DELETE"),
      { params: Promise.resolve({ id: String(inboundMsgId) }) }
    );
    const checkGone = await prisma.supplierMessage.findUnique({ where: { id: inboundMsgId } });
    assert(delRes.status === 200 && !checkGone, "Admin deletes supplier message cleanly");

    // Bug 7 regression: deactivating SupplierUser invalidates existing cookie (401) and blocks login (403)
    await prisma.supplierUser.update({
      where: { id: supAUser.id },
      data: { active: false },
    });
    const staleSessRes = await getSupplierOrders(
      supplierRequest("http://localhost:3000/api/supplier/orders")
    );
    const deactivatedLoginRes = await supplierAuthPost(
      new NextRequest("http://localhost:3000/api/auth/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: supAUser.username, password: "SupPass@123" }),
      })
    );
    assert(
      staleSessRes.status === 401 && deactivatedLoginRes.status === 403,
      "Deactivated SupplierUser rejects existing cookie (401) and blocks fresh login (403)"
    );
  } finally {
    console.log("\nCleaning up Module 2.17 test fixtures...");
    if (createdMsgIds.length) {
      await prisma.supplierMessage.deleteMany({ where: { id: { in: createdMsgIds } } });
    }
    if (supplierAId || supplierBId) {
      const sIds = [supplierAId, supplierBId].filter(Boolean);
      await prisma.supplierMessage.deleteMany({ where: { supplierId: { in: sIds } } });
      await prisma.supplierUser.deleteMany({ where: { supplierId: { in: sIds } } });
    }
    if (createdPoIds.length) {
      await prisma.pOItem.deleteMany({ where: { poId: { in: createdPoIds } } });
      await prisma.purchaseOrder.deleteMany({ where: { id: { in: createdPoIds } } });
    }
    if (createdBatchIds.length) {
      await prisma.batch.deleteMany({ where: { id: { in: createdBatchIds } } });
    }
    if (medicineId) {
      await prisma.medicine.deleteMany({ where: { id: medicineId } });
    }
    if (supplierAId || supplierBId) {
      await prisma.supplier.deleteMany({ where: { id: { in: [supplierAId, supplierBId].filter(Boolean) } } });
    }
    if (adminUserId) {
      await prisma.auditLog.deleteMany({ where: { userId: adminUserId } });
      await prisma.user.deleteMany({ where: { id: adminUserId } });
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
