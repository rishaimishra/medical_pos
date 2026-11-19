/**
 * Integration Test Suite for MODULES 3.1 & 3.2:
 * - 3.1.1: Multi-store customer privacy (`uk_store_customer_phone`) + unregistered customer
 *          purchases across Store 1, Store 2, Store 3 -> single portal registration links
 *          all 3 bills (`GET /api/customer/orders` & `/orders/[id]`), routes returns to
 *          originating store (`POST /api/customer/returns`), and auto-links Store 4 afterward.
 * - 3.2.1: Isolated Super Admin Auth (`med_pos_super_admin_session`), Store Admin blocked (401),
 *          disabled account blocked (403), brute-force lockout (429), role RBAC (403).
 * - 3.2.2: Global Super Admin Quick Search (`/api/super-admin/search`).
 * - 3.2.3: Guarded 30-min CEO Store Support Impersonation (`/api/super-admin/impersonate`) +
 *          dual audit logs (`PlatformAuditLog` & Store `AuditLog`) + clean exit.
 */

import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  createSessionToken,
  hashPassword,
  verifyAdminRequest,
  verifySessionToken,
} from "../src/lib/auth";
import {
  GET as getSuperAdminSession,
  POST as postSuperAdminAuth,
  PATCH as patchSuperAdminAuth,
} from "../src/app/api/auth/super-admin/route";
import { GET as getSuperAdminSearch } from "../src/app/api/super-admin/search/route";
import {
  POST as startImpersonation,
  DELETE as exitImpersonation,
} from "../src/app/api/super-admin/impersonate/route";
import { POST as postCustomerAuth } from "../src/app/api/auth/customer/route";
import { GET as verifyCustomerLink } from "../src/app/api/auth/customer/verify/route";
import { GET as getCustomerOrders } from "../src/app/api/customer/orders/route";
import { GET as getCustomerSingleOrder } from "../src/app/api/customer/orders/[id]/route";
import { POST as postCustomerReturn } from "../src/app/api/customer/returns/route";
import { POST as postCustomerPrescription } from "../src/app/api/customer/prescriptions/route";
import { POST as postCustomerMessage } from "../src/app/api/customer/messages/route";
import { GET as getAdminAuth } from "../src/app/api/auth/admin/route";
import { GET as getAdminCustomers, POST as postAdminCustomer } from "../src/app/api/admin/customers/route";
import { GET as getAdminSingleCustomer } from "../src/app/api/admin/customers/[id]/route";
import { GET as getAdminMedicines } from "../src/app/api/admin/medicines/route";
import { GET as getAdminSuppliers } from "../src/app/api/admin/suppliers/route";
import { GET as getAdminUsers } from "../src/app/api/admin/users/route";
import { GET as getAdminNotifications } from "../src/app/api/admin/notifications/route";
import { GET as getAdminPatientMsgs } from "../src/app/api/admin/patient-messages/route";
import { GET as getAdminSupplierMsgs } from "../src/app/api/admin/messages/route";
import { GET as getAdminPrescriptions } from "../src/app/api/admin/prescriptions/route";

let superCookie = "";
let adminCookie = "";
let customerCookie = "";

function superReq(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(superCookie ? { cookie: `med_pos_super_admin_session=${superCookie}` } : {}),
      ...(adminCookie ? { cookie: `${superCookie ? `med_pos_super_admin_session=${superCookie}; ` : ""}med_pos_admin_session=${adminCookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

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

function custReq(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(customerCookie ? { cookie: `med_pos_customer_session=${customerCookie}` } : {}),
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
  console.log("INTEGRATION TEST SUITE: MODULES 3.1 & 3.2 (SAAS TENANCY & CEO CONTROL TOWER)");
  console.log("================================================================================");

  const runId = Math.floor(Math.random() * 900000) + 100000;
  const createdStoreIds: number[] = [];
  const createdBranchIds: number[] = [];
  const createdUserIds: number[] = [];
  const createdMedIds: number[] = [];
  const createdBatchIds: number[] = [];
  const createdCustIds: number[] = [];
  const createdSupplierIds: number[] = [];
  const createdPatientMsgIds: number[] = [];
  const createdSupplierMsgIds: number[] = [];
  const createdSaleIds: number[] = [];
  const createdReturnIds: number[] = [];
  const createdPlatformUserIds: number[] = [];

  try {
    const pwHash = await hashPassword("Pass@12345");

    // Seed 4 independent Pharmacy Stores (Settings + Branch + Admin/Medicine/Batch)
    const stores: Array<{ storeId: number; branchId: number; adminId: number; medId: number; batchId: number; name: string }> = [];
    for (let idx = 1; idx <= 4; idx++) {
      const store = await prisma.settings.create({
        data: {
          storeName: `TestPharmacy-${idx}-${runId}`,
          storeGst: `27TEST${runId}Z${idx}`,
          storeDl: `DL-${idx}-${runId}`,
          storeEmail: `store${idx}_${runId}@pharma.local`,
          storeStatus: "active",
          setupDone: true,
        },
      });
      createdStoreIds.push(store.id);

      const br = await prisma.branch.create({
        data: {
          storeId: store.id,
          code: `MAIN`,
          name: `Main Outlet S${idx}`,
          isMain: true,
          active: true,
        },
      });
      createdBranchIds.push(br.id);

      const adm = await prisma.user.create({
        data: {
          storeId: store.id,
          branchId: br.id,
          name: `Store${idx} Admin`,
          username: `s${idx}_adm_${runId}`,
          email: `s${idx}_adm_${runId}@pharma.local`,
          password: pwHash,
          role: "admin",
          active: true,
        },
      });
      createdUserIds.push(adm.id);

      const med = await prisma.medicine.create({
        data: {
          storeId: store.id,
          name: `Dolo-S${idx}-${runId}`,
          company: "MicroLabs",
          category: "Tablet",
          gstPercent: 12,
        },
      });
      createdMedIds.push(med.id);

      const batch = await prisma.batch.create({
        data: {
          medicineId: med.id,
          branchId: br.id,
          batchNo: `B-${idx}-${runId}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          quantity: 50,
          purchasePrice: 20,
          mrp: 30,
        },
      });
      createdBatchIds.push(batch.id);

      stores.push({ storeId: store.id, branchId: br.id, adminId: adm.id, medId: med.id, batchId: batch.id, name: store.storeName });
    }

    // =========================================================================
    // [1] MODULE 3.1.1: N-STORE WALK-IN CUSTOMER PRIVACY & AGGREGATED PORTAL BILLS
    // =========================================================================
    console.log("\n[1] Testing Module 3.1.1: Unregistered N-Store Purchases -> Single Portal Registration...");
    const sharedPhone = `99${runId}01`;

    // Unregistered customer buys at Store 1, Store 2, Store 3 with same phone (distinct store-scoped Customer rows)
    const saleByStoreIdx: any[] = [];
    for (let i = 0; i < 3; i++) {
      const sMeta = stores[i];
      const storeCust = await prisma.customer.create({
        data: {
          storeId: sMeta.storeId,
          name: `Rahul S${i + 1} ${runId}`,
          phone: sharedPhone,
          active: true,
        },
      });
      createdCustIds.push(storeCust.id);

      const sale = await prisma.sale.create({
        data: {
          invoiceNo: `INV-31-S${i + 1}-${runId}`,
          customerId: storeCust.id,
          branchId: sMeta.branchId,
          createdBy: sMeta.adminId,
          saleDate: new Date(),
          totalAmount: 90,
          gstAmount: 0,
          discountAmount: 0,
          grandTotal: 90 + i * 30,
          paymentMethod: "cash",
          items: {
            create: {
              medicineId: sMeta.medId,
              batchId: sMeta.batchId,
              quantity: 3,
              mrp: 30 + i * 10,
              taxableBase: 90 + i * 30,
              gstPercent: 0,
              gstAmount: 0,
              price: 90 + i * 30,
            },
          },
        },
        include: { items: true },
      });
      createdSaleIds.push(sale.id);
      saleByStoreIdx.push({ sale, cust: storeCust, sMeta });
    }
    assert(createdCustIds.length === 3, "Store 1, Store 2 & Store 3 independently store same phone (uk_store_customer_phone)");

    // Customer now registers ONCE with sharedPhone + email and verifies email
    const custEmail = `rahul_${runId}@patient.local`;
    const regRes = await postCustomerAuth(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: `Rahul Unified ${runId}`,
          phone: sharedPhone,
          email: custEmail,
          password: "CustPass@123",
        }),
      })
    );
    const claimedRow = await prisma.customer.findFirst({ where: { id: createdCustIds[0] } });
    const verLinkRes = await verifyCustomerLink(
      new NextRequest(
        `http://localhost:3000/api/auth/customer/verify?token=${encodeURIComponent(claimedRow?.verifyToken || "")}`,
        { headers: { accept: "application/json" } }
      )
    );
    const loginRes = await postCustomerAuth(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: sharedPhone, password: "CustPass@123" }),
      })
    );
    customerCookie = loginRes.cookies.get("med_pos_customer_session")?.value || "";
    assert(
      regRes.status === 201 && verLinkRes.status === 200 && loginRes.status === 200 && Boolean(customerCookie),
      "Customer registers once with phone, verifies email, and signs in cleanly"
    );

    // Portal Orders shows all 3 separate store invoices with exact Store Name
    const ordersRes = await getCustomerOrders(custReq("http://localhost:3000/api/customer/orders"));
    const ordersJson = await ordersRes.json();
    const orderStoreIds = new Set((ordersJson.orders || []).map((o: any) => o.storeId));
    assert(
      ordersRes.status === 200 &&
        ordersJson.orders?.length === 3 &&
        orderStoreIds.has(stores[0].storeId) &&
        orderStoreIds.has(stores[1].storeId) &&
        orderStoreIds.has(stores[2].storeId),
      "Customer Portal aggregates all 3 separate Store invoices (Store 1, Store 2, Store 3) under one account"
    );

    // Download single invoice from Store 3 (different customer row id = createdCustIds[2]) + print Store 3 GSTIN
    const s3Sale = saleByStoreIdx[2].sale;
    const inv3Res = await getCustomerSingleOrder(
      custReq(`http://localhost:3000/api/customer/orders/${s3Sale.id}`),
      { params: Promise.resolve({ id: String(s3Sale.id) }) }
    );
    const inv3Json = await inv3Res.json();
    assert(
      inv3Res.status === 200 &&
        inv3Json.invoice?.store?.name === stores[2].name &&
        inv3Json.invoice?.store?.gstNo === `27TEST${runId}Z3`,
      "Customer downloads branded Store 3 invoice cleanly via linkedCustomerIds"
    );

    // Return request on Store 2 invoice attaches to Store 2's customerId & branchId
    const s2Sale = saleByStoreIdx[1].sale;
    const ret2Res = await postCustomerReturn(
      custReq("http://localhost:3000/api/customer/returns", "POST", {
        saleId: s2Sale.id,
        reason: "Wrong strength",
        items: [{ saleItemId: s2Sale.items[0].id, quantity: 1 }],
      })
    );
    const ret2Json = await ret2Res.json();
    if (ret2Json.return?.id) createdReturnIds.push(ret2Json.return.id);
    const ret2Db = ret2Json.return?.id
      ? await prisma.return.findUnique({ where: { id: ret2Json.return.id } })
      : null;
    assert(
      ret2Res.status === 201 &&
        ret2Db?.branchId === stores[1].branchId &&
        ret2Db?.customerId === createdCustIds[1],
      "Customer return request on Store 2 invoice routes strictly to Store 2 branch & customer record"
    );

    // Future purchase at Store 4 AFTER registration -> auto-appears in customer portal!
    const cust4 = await prisma.customer.create({
      data: { storeId: stores[3].storeId, name: "Rahul Late Visit", phone: sharedPhone, active: true },
    });
    createdCustIds.push(cust4.id);
    const sale4 = await prisma.sale.create({
      data: {
        invoiceNo: `INV-31-S4-${runId}`,
        customerId: cust4.id,
        branchId: stores[3].branchId,
        createdBy: stores[3].adminId,
        saleDate: new Date(),
        totalAmount: 30,
        gstAmount: 0,
        discountAmount: 0,
        grandTotal: 30,
        paymentMethod: "upi",
        items: {
          create: {
            medicineId: stores[3].medId,
            batchId: stores[3].batchId,
            quantity: 1,
            mrp: 30,
            taxableBase: 30,
            gstPercent: 0,
            gstAmount: 0,
            price: 30,
          },
        },
      },
    });
    createdSaleIds.push(sale4.id);
    const ordersAfterS4 = await getCustomerOrders(custReq("http://localhost:3000/api/customer/orders"));
    const ordersAfterS4Json = await ordersAfterS4.json();
    assert(
      ordersAfterS4.status === 200 && ordersAfterS4Json.orders?.length === 4,
      "Subsequent walk-in purchase at Store 4 automatically appears as 4th invoice in Customer Portal"
    );

    // =========================================================================
    // [2] MODULE 3.2: ISOLATED SUPER ADMIN AUTH, SEARCH & STORE IMPERSONATION
    // =========================================================================
    console.log("\n[2] Testing Module 3.2: Isolated Super Admin Auth, Search & CEO Support Mode...");

    const ceoUser = await prisma.platformUser.create({
      data: {
        name: `Test CEO ${runId}`,
        username: `ceo_${runId}`,
        email: `ceo_${runId}@platform.local`,
        password: pwHash,
        role: "ceo",
        active: true,
      },
    });
    const viewerUser = await prisma.platformUser.create({
      data: {
        name: `Viewer ${runId}`,
        username: `viewer_${runId}`,
        email: `viewer_${runId}@platform.local`,
        password: pwHash,
        role: "support_viewer",
        active: true,
      },
    });
    createdPlatformUserIds.push(ceoUser.id, viewerUser.id);

    // Store Admin cookie must be REJECTED (401) on Super Admin APIs
    const s1AdminToken = createSessionToken({
      userId: stores[0].adminId,
      storeId: stores[0].storeId,
      username: `s1_adm_${runId}`,
      name: "Store1 Admin",
      email: `s1_adm_${runId}@pharma.local`,
      role: "admin",
      branchId: stores[0].branchId,
      permissions: ["manage_settings", "manage_users"],
      allowedPages: ["/admin/dashboard"],
      maxDiscountPercent: 100,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });
    adminCookie = s1AdminToken;
    const storeAdminSpoofSearch = await getSuperAdminSearch(
      adminReq(`http://localhost:3000/api/super-admin/search?q=TestPharmacy`)
    );
    assert(
      storeAdminSpoofSearch.status === 401,
      "Store Admin session is strictly rejected (401) on /api/super-admin/* endpoints"
    );
    adminCookie = "";

    // Support viewer signs in cleanly, gets 403 when attempting Impersonation
    const viewerLoginRes = await postSuperAdminAuth(
      new NextRequest("http://localhost:3000/api/auth/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.3.99" },
        body: JSON.stringify({ identifier: viewerUser.username, password: "Pass@12345" }),
      })
    );
    superCookie = viewerLoginRes.cookies.get("med_pos_super_admin_session")?.value || "";
    const viewerImpRes = await startImpersonation(
      superReq("http://localhost:3000/api/super-admin/impersonate", "POST", {
        storeId: stores[0].storeId,
        reason: "Checking viewer block",
      })
    );
    assert(
      viewerLoginRes.status === 200 && viewerImpRes.status === 403,
      "support_viewer role signs in cleanly but receives 403 when attempting Store Impersonation"
    );

    // Brute force protection on Super Admin login ("super_admin" context) on viewerUser
    for (let a = 1; a <= 5; a++) {
      await postSuperAdminAuth(
        new NextRequest("http://localhost:3000/api/auth/super-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.3.2" },
          body: JSON.stringify({ identifier: viewerUser.username, password: "WrongPassword!" }),
        })
      );
    }
    const lockedLogin = await postSuperAdminAuth(
      new NextRequest("http://localhost:3000/api/auth/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.3.2" },
        body: JSON.stringify({ identifier: viewerUser.username, password: "Pass@12345" }),
      })
    );
    assert(
      lockedLogin.status === 429,
      "Super Admin login enforces brute-force lockout after 5 wrong attempts (429)"
    );

    // CEO signs in, checks GET session, Global Search (Ctrl+K), and starts + exits Store Support Impersonation
    const ceoLoginRes = await postSuperAdminAuth(
      new NextRequest("http://localhost:3000/api/auth/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.3.88" },
        body: JSON.stringify({ identifier: ceoUser.email, password: "Pass@12345" }),
      })
    );
    superCookie = ceoLoginRes.cookies.get("med_pos_super_admin_session")?.value || "";

    const sesRes = await getSuperAdminSession(superReq("http://localhost:3000/api/auth/super-admin"));
    const sesJson = await sesRes.json();
    assert(
      sesRes.status === 200 && sesJson.authenticated === true && sesJson.platformUser?.role === "ceo",
      "Authenticated CEO session returns authenticated=true with role='ceo'"
    );

    const searchRes = await getSuperAdminSearch(
      superReq(`http://localhost:3000/api/super-admin/search?q=TestPharmacy-2-${runId}`)
    );
    const searchJson = await searchRes.json();
    assert(
      searchRes.status === 200 &&
        searchJson.stores?.some((s: any) => s.id === stores[1].storeId),
      "Global CEO Quick Search finds exact target store across platform"
    );

    const impRes = await startImpersonation(
      superReq("http://localhost:3000/api/super-admin/impersonate", "POST", {
        storeId: stores[0].storeId,
        reason: "Assisting Store 1 with initial POS setup",
      })
    );
    const impCookieVal = impRes.cookies.get("med_pos_admin_session")?.value || "";
    const impTokenCheck = verifySessionToken(impCookieVal);
    adminCookie = impCookieVal;
    const admAuthCheck = await getAdminAuth(adminReq("http://localhost:3000/api/auth/admin"));
    const admAuthJson = await admAuthCheck.json();

    const [platAudCount, storeAudCount] = await Promise.all([
      prisma.platformAuditLog.count({
        where: { platformUserId: ceoUser.id, action: "SUPPORT_IMPERSONATION_STARTED" },
      }),
      prisma.auditLog.count({
        where: { storeId: stores[0].storeId, action: "CEO_SUPPORT_SESSION_STARTED" },
      }),
    ]);

    assert(
      impRes.status === 200 &&
        impTokenCheck.valid &&
        impTokenCheck.session?.impersonatedByPlatformUserId === ceoUser.id &&
        admAuthJson.session?.impersonatorName === ceoUser.name &&
        platAudCount === 1 &&
        storeAudCount === 1,
      "CEO Store Support Impersonation issues audited 30m Store Admin cookie & logs both PlatformAuditLog and Store AuditLog"
    );

    const exitRes = await exitImpersonation(
      superReq("http://localhost:3000/api/super-admin/impersonate", "DELETE")
    );
    const exitPlatAudCount = await prisma.platformAuditLog.count({
      where: { platformUserId: ceoUser.id, action: "SUPPORT_IMPERSONATION_ENDED" },
    });
    assert(
      exitRes.status === 200 && exitPlatAudCount === 1,
      "Exiting CEO Support View clears store cookie and writes SUPPORT_IMPERSONATION_ENDED audit log"
    );

    // Password change check on CEO account
    const pwRes = await patchSuperAdminAuth(
      superReq("http://localhost:3000/api/auth/super-admin", "PATCH", {
        currentPassword: "Pass@12345",
        newPassword: "NewCeoPass@99",
      })
    );
    assert(pwRes.status === 200, "CEO updates own password cleanly via PATCH /api/auth/super-admin");

    // =========================================================================
    // [3] REGRESSION CHECKS FOR FIXED BUGS (3.1-A, 3.1-B, 3.1-C, 3.2-A, 3.2-B)
    // =========================================================================
    console.log("\n[3] Testing Multi-Tenant Admin Isolation, Cross-Store Sync & Impersonation Hardening...");

    // BUG-3.1-A: Seed Store 1 private Supplier, PatientMessage, SupplierMessage & verify Store 2 cannot see ANY Store 1 data
    const sup1 = await prisma.supplier.create({
      data: {
        storeId: stores[0].storeId,
        name: `Store1 Only Vendor ${runId}`,
        phone: `911${String(runId).slice(-6)}`,
      },
    });
    createdSupplierIds.push(sup1.id);

    const pm1 = await prisma.patientMessage.create({
      data: {
        storeId: stores[0].storeId,
        customerId: createdCustIds[0],
        direction: "in",
        message: `Store1 Private Rx ${runId}`,
        isRead: false,
      },
    });
    createdPatientMsgIds.push(pm1.id);

    const sm1 = await prisma.supplierMessage.create({
      data: {
        storeId: stores[0].storeId,
        supplierId: sup1.id,
        supplierName: sup1.name,
        subject: `Store1 Private Vendor Thread ${runId}`,
        message: "Confidential pricing quote",
        direction: "in",
        status: "unread",
      },
    });
    createdSupplierMsgIds.push(sm1.id);

    const s2AdminToken = createSessionToken({
      userId: stores[1].adminId,
      storeId: stores[1].storeId,
      username: `s2_adm_${runId}`,
      name: "Store2 Admin",
      email: `s2_adm_${runId}@pharma.local`,
      role: "admin",
      branchId: stores[1].branchId,
      permissions: ["manage_customers", "manage_medicines", "manage_purchases", "manage_users"],
      allowedPages: ["*"],
      maxDiscountPercent: 100,
      issuedAt: Date.now(),
      lastActive: Date.now(),
    });
    adminCookie = s2AdminToken;

    const [
      s2CustRes,
      s2SingleCustRes,
      s2MedRes,
      s2SupRes,
      s2UsersCustRes,
      s2NotifRes,
      s2PmRes,
      s2SmRes,
      s2RxRes,
    ] = await Promise.all([
      getAdminCustomers(adminReq("http://localhost:3000/api/admin/customers?limit=50")),
      getAdminSingleCustomer(
        adminReq(`http://localhost:3000/api/admin/customers/${createdCustIds[0]}`),
        { params: Promise.resolve({ id: String(createdCustIds[0]) }) }
      ),
      getAdminMedicines(adminReq("http://localhost:3000/api/admin/medicines?branchId=all&limit=50")),
      getAdminSuppliers(adminReq("http://localhost:3000/api/admin/suppliers?limit=50")),
      getAdminUsers(adminReq("http://localhost:3000/api/admin/users?tab=patients")),
      getAdminNotifications(adminReq("http://localhost:3000/api/admin/notifications")),
      getAdminPatientMsgs(adminReq("http://localhost:3000/api/admin/patient-messages")),
      getAdminSupplierMsgs(adminReq("http://localhost:3000/api/admin/messages")),
      getAdminPrescriptions(adminReq("http://localhost:3000/api/admin/prescriptions")),
    ]);

    const [
      s2CustJson,
      s2MedJson,
      s2SupJson,
      s2UsersCustJson,
      s2NotifJson,
      s2PmJson,
      s2SmJson,
      s2RxJson,
    ] = await Promise.all([
      s2CustRes.json(),
      s2MedRes.json(),
      s2SupRes.json(),
      s2UsersCustRes.json(),
      s2NotifRes.json(),
      s2PmRes.json(),
      s2SmRes.json(),
      s2RxRes.json(),
    ]);

    assert(
      !(s2CustJson.customers || []).some((c: any) => c.id === createdCustIds[0]) &&
        s2SingleCustRes.status === 404,
      "BUG-3.1-A: Store 2 /admin/customers & /[id] strictly exclude Store 1 customer records"
    );
    assert(
      !(s2MedJson.medicines || []).some((m: any) => m.id === stores[0].medId),
      "BUG-3.1-A: Store 2 /admin/medicines (all branches) excludes Store 1 medicine catalog"
    );
    assert(
      !(s2SupJson.suppliers || []).some((s: any) => s.id === sup1.id) &&
        !(s2UsersCustJson.data || []).some((c: any) => c.id === createdCustIds[0]),
      "BUG-3.1-A: Store 2 /admin/suppliers & /admin/users exclude Store 1 suppliers and patients"
    );
    assert(
      !(s2NotifJson.notifications || []).some((n: any) => String(n.message || "").includes(sup1.name)) &&
        !(s2PmJson.conversations || []).some((c: any) => c.customerId === createdCustIds[0]) &&
        !(s2SmJson.messages || []).some((m: any) => m.id === sm1.id) &&
        !(s2RxJson.prescriptions || []).some((p: any) => p.id === pm1.id),
      "BUG-3.1-A: Store 2 notifications, inboxes & Rx queue do not leak Store 1 private threads"
    );
    adminCookie = "";

    // BUG-3.1-B: Conflicting unverified cashier emails on walk-in phone across 2 stores must NOT deadlock self-registration
    const conflictPhone = `98${runId}02`;
    const cConflict1 = await prisma.customer.create({
      data: {
        storeId: stores[0].storeId,
        name: "Walk-in Store1",
        phone: conflictPhone,
        email: `typo1_${runId}@mail.local`,
        verified: false,
      },
    });
    const cConflict2 = await prisma.customer.create({
      data: {
        storeId: stores[1].storeId,
        name: "Walk-in Store2",
        phone: conflictPhone,
        email: `typo2_${runId}@mail.local`,
        verified: false,
      },
    });
    createdCustIds.push(cConflict1.id, cConflict2.id);

    const conflictRegRes = await postCustomerAuth(
      new NextRequest("http://localhost:3000/api/auth/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name: `Real Patient ${runId}`,
          phone: conflictPhone,
          email: `real_${runId}@patient.local`,
          password: "CustPass@123",
        }),
      })
    );
    const updatedPrimaryConflict = await prisma.customer.findUnique({ where: { id: cConflict1.id } });
    assert(
      conflictRegRes.status === 201 && updatedPrimaryConflict?.name === `Real Patient ${runId}`,
      "BUG-3.1-B: Customer self-registration succeeds (201) despite differing unverified cashier emails & updates name"
    );

    // BUG-3.1-C: Store-level Chronic Refill aggregation + Store filter dropdown API + Rx store routing
    await prisma.customer.update({
      where: { id: createdCustIds[1] },
      data: {
        isChronic: true,
        chronicDiseases: "Hypertension",
        refillDays: 30,
        nextRefillDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });
    const custStoreFilterRes = await getCustomerOrders(
      custReq(`http://localhost:3000/api/customer/orders?storeId=${stores[1].storeId}`)
    );
    const custStoreFilterJson = await custStoreFilterRes.json();
    assert(
      custStoreFilterRes.status === 200 &&
        custStoreFilterJson.orders?.length === 1 &&
        custStoreFilterJson.orders[0].storeId === stores[1].storeId &&
        (custStoreFilterJson.availableStores || []).length === 4 &&
        custStoreFilterJson.customer?.isChronic === true &&
        custStoreFilterJson.customer?.chronicDiseases?.includes("Hypertension"),
      "BUG-3.1-C: Customer Orders filters by storeId, returns availableStores, and merges Store 2 chronic schedule"
    );

    const rxRouteRes = await postCustomerPrescription(
      custReq("http://localhost:3000/api/customer/prescriptions", "POST", {
        storeId: stores[2].storeId,
        message: `Refill order for Store 3 ${runId}`,
      })
    );
    const rxRouteJson = await rxRouteRes.json();
    const rxRouteDb = rxRouteJson.prescription?.id
      ? await prisma.patientMessage.findUnique({ where: { id: rxRouteJson.prescription.id } })
      : null;
    if (rxRouteDb?.id) createdPatientMsgIds.push(rxRouteDb.id);

    const msgRouteRes = await postCustomerMessage(
      custReq("http://localhost:3000/api/customer/messages", "POST", {
        storeId: stores[2].storeId,
        message: `Inquiry for Store 3 ${runId}`,
      })
    );
    const msgRouteJson = await msgRouteRes.json();
    if (msgRouteJson.data?.id) createdPatientMsgIds.push(msgRouteJson.data.id);
    assert(
      rxRouteRes.status === 201 &&
        rxRouteDb?.storeId === stores[2].storeId &&
        msgRouteRes.status === 201 &&
        msgRouteJson.data?.storeId === stores[2].storeId,
      "BUG-3.1-C: Customer Rx upload & support messages store-route explicitly to Store 3 instead of Store 1"
    );

    // BUG-3.2-A & 3.2-B: Accountant alphabetical tie-break + verifyAdminRequest preserving impersonation fields
    const accUser = await prisma.user.create({
      data: {
        storeId: stores[0].storeId,
        branchId: stores[0].branchId,
        name: "Store1 Accountant",
        username: `s1_acc_${runId}`,
        email: `s1_acc_${runId}@pharma.local`,
        password: pwHash,
        role: "accountant",
        active: true,
      },
    });
    createdUserIds.push(accUser.id);

    const impAdminRes = await startImpersonation(
      superReq("http://localhost:3000/api/super-admin/impersonate", "POST", {
        storeId: stores[0].storeId,
        reason: "Verifying admin priority over accountant",
      })
    );
    const impAdminJson = await impAdminRes.json();
    const impAdminCookie = impAdminRes.cookies.get("med_pos_admin_session")?.value || "";
    adminCookie = impAdminCookie;
    const verifiedAdm = await verifyAdminRequest(adminReq("http://localhost:3000/api/admin/customers"));
    const refreshedAuthRes = await getAdminAuth(adminReq("http://localhost:3000/api/auth/admin"));
    const refreshedCookie = refreshedAuthRes.cookies.get("med_pos_admin_session");
    assert(
      impAdminRes.status === 200 &&
        impAdminJson.impersonatedAs === `s1_adm_${runId}` &&
        verifiedAdm.authorized &&
        verifiedAdm.session?.impersonatedByPlatformUserId === ceoUser.id &&
        Boolean(refreshedCookie?.maxAge && refreshedCookie.maxAge <= 1800),
      "BUG-3.2-A/B: Impersonation picks admin over accountant, preserves metadata in verifyAdminRequest, and caps refresh TTL at 30m"
    );
    await exitImpersonation(superReq("http://localhost:3000/api/super-admin/impersonate", "DELETE"));
    adminCookie = "";
  } finally {
    console.log("\nCleaning up Modules 3.1 & 3.2 test fixtures...");
    if (createdPatientMsgIds.length) {
      await prisma.patientMessage.deleteMany({ where: { id: { in: createdPatientMsgIds } } });
    }
    if (createdSupplierMsgIds.length) {
      await prisma.supplierMessage.deleteMany({ where: { id: { in: createdSupplierMsgIds } } });
    }
    if (createdSupplierIds.length) {
      await prisma.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
    }
    if (createdPlatformUserIds.length) {
      await prisma.platformAuditLog.deleteMany({
        where: { platformUserId: { in: createdPlatformUserIds } },
      });
      await prisma.platformUser.deleteMany({ where: { id: { in: createdPlatformUserIds } } });
    }
    if (createdReturnIds.length) {
      await prisma.returnItem.deleteMany({ where: { returnId: { in: createdReturnIds } } });
      await prisma.return.deleteMany({ where: { id: { in: createdReturnIds } } });
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
    if (createdCustIds.length) {
      await prisma.customer.deleteMany({ where: { id: { in: createdCustIds } } });
    }
    if (createdStoreIds.length) {
      await prisma.auditLog.deleteMany({ where: { storeId: { in: createdStoreIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (createdBranchIds.length) {
      await prisma.branch.deleteMany({ where: { id: { in: createdBranchIds } } });
    }
    if (createdStoreIds.length) {
      await prisma.settings.deleteMany({ where: { id: { in: createdStoreIds } } });
    }
    await prisma.loginAttempt.deleteMany({
      where: {
        OR: [{ context: "super_admin" }, { context: { contains: String(runId) } }],
      },
    });
    await prisma.$disconnect();
  }

  console.log(`\nSUMMARY: ${passedTests} Passed, ${failedTests} Failed`);
  if (failedTests > 0) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL TEST ERROR:", err);
  process.exit(1);
});
