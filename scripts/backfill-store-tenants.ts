/**
 * Idempotent Tenant Backfill Script (Module 3.1.1)
 *
 * Associates pre-existing legacy rows (Medicine, Supplier, SupplierMessage, Customer,
 * PatientMessage) that currently have `storeId = null` with their owning Store Tenant (`Settings.id`),
 * and backfills `Settings.ownerName` / `ownerEmail` from the store's primary admin account when empty.
 *
 * Safe to run repeatedly (`npx tsx scripts/backfill-store-tenants.ts`).
 */

import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("================================================================================");
  console.log("MODULE 3.1.1: IDEMPOTENT STORE-TENANT (`storeId`) BACKFILL");
  console.log("================================================================================");

  const stores = await prisma.settings.findMany({
    orderBy: { id: "asc" },
    select: { id: true, storeName: true, storeEmail: true, ownerName: true, ownerEmail: true },
  });

  if (stores.length === 0) {
    console.log("No Store (Settings) rows found yet. Nothing to backfill.");
    return;
  }

  const primaryStoreId = stores[0].id;
  let updatedSettings = 0;
  let updatedMedicines = 0;
  let updatedSuppliers = 0;
  let updatedSupplierMessages = 0;
  let updatedCustomers = 0;
  let updatedPatientMessages = 0;

  // 1. Backfill Settings ownerName / ownerEmail from primary store admin user when missing
  for (const s of stores) {
    if (!s.ownerName || !s.ownerEmail) {
      const adminUser = await prisma.user.findFirst({
        where: { storeId: s.id, role: "admin" },
        orderBy: { id: "asc" },
        select: { name: true, email: true },
      });
      const nextOwnerName = s.ownerName || adminUser?.name || null;
      const nextOwnerEmail = s.ownerEmail || adminUser?.email || s.storeEmail || null;
      if (nextOwnerName !== s.ownerName || nextOwnerEmail !== s.ownerEmail) {
        await prisma.settings.update({
          where: { id: s.id },
          data: {
            ownerName: nextOwnerName,
            ownerEmail: nextOwnerEmail,
          },
        });
        updatedSettings++;
      }
    }
  }

  // 2. Backfill Medicine.storeId via Batch.branch.storeId -> SaleItem -> POItem -> primaryStoreId
  const legacyMedicines = await prisma.medicine.findMany({
    where: { storeId: null },
    select: { id: true },
  });
  for (const med of legacyMedicines) {
    let resolvedStoreId: number | null = null;
    const batch = await prisma.batch.findFirst({
      where: { medicineId: med.id, branch: { storeId: { not: null } } },
      select: { branch: { select: { storeId: true } } },
    });
    resolvedStoreId = batch?.branch?.storeId ?? null;

    if (!resolvedStoreId) {
      const saleItem = await prisma.saleItem.findFirst({
        where: { medicineId: med.id, sale: { branch: { storeId: { not: null } } } },
        select: { sale: { select: { branch: { select: { storeId: true } } } } },
      });
      resolvedStoreId = saleItem?.sale?.branch?.storeId ?? null;
    }

    if (!resolvedStoreId) {
      const poItem = await prisma.pOItem.findFirst({
        where: { medicineId: med.id, purchaseOrder: { branch: { storeId: { not: null } } } },
        select: { purchaseOrder: { select: { branch: { select: { storeId: true } } } } },
      });
      resolvedStoreId = poItem?.purchaseOrder?.branch?.storeId ?? null;
    }

    await prisma.medicine.update({
      where: { id: med.id },
      data: { storeId: resolvedStoreId ?? primaryStoreId },
    });
    updatedMedicines++;
  }

  // 3. Backfill Supplier.storeId via PurchaseOrder / Batch / SupplierPayment -> primaryStoreId
  const legacySuppliers = await prisma.supplier.findMany({
    where: { storeId: null },
    select: { id: true },
  });
  for (const sup of legacySuppliers) {
    let resolvedStoreId: number | null = null;
    const po = await prisma.purchaseOrder.findFirst({
      where: { supplierId: sup.id, branch: { storeId: { not: null } } },
      select: { branch: { select: { storeId: true } } },
    });
    resolvedStoreId = po?.branch?.storeId ?? null;

    if (!resolvedStoreId) {
      const batch = await prisma.batch.findFirst({
        where: { supplierId: sup.id, branch: { storeId: { not: null } } },
        select: { branch: { select: { storeId: true } } },
      });
      resolvedStoreId = batch?.branch?.storeId ?? null;
    }

    if (!resolvedStoreId) {
      const sp = await prisma.supplierPayment.findFirst({
        where: { supplierId: sup.id, branch: { storeId: { not: null } } },
        select: { branch: { select: { storeId: true } } },
      });
      resolvedStoreId = sp?.branch?.storeId ?? null;
    }

    await prisma.supplier.update({
      where: { id: sup.id },
      data: { storeId: resolvedStoreId ?? primaryStoreId },
    });
    updatedSuppliers++;
  }

  // 4. Backfill SupplierMessage.storeId via Supplier.storeId -> primaryStoreId
  const legacySupMsgs = await prisma.supplierMessage.findMany({
    where: { storeId: null },
    select: { id: true, supplier: { select: { storeId: true } } },
  });
  for (const sm of legacySupMsgs) {
    await prisma.supplierMessage.update({
      where: { id: sm.id },
      data: { storeId: sm.supplier?.storeId ?? primaryStoreId },
    });
    updatedSupplierMessages++;
  }

  // 5. Backfill Customer.storeId safely when linked to a store sale/payment/return without violating composite unique
  const legacyCustomers = await prisma.customer.findMany({
    where: { storeId: null },
    select: { id: true, phone: true, email: true },
  });
  for (const cust of legacyCustomers) {
    let resolvedStoreId: number | null = null;
    const sale = await prisma.sale.findFirst({
      where: { customerId: cust.id, branch: { storeId: { not: null } } },
      orderBy: { id: "asc" },
      select: { branch: { select: { storeId: true } } },
    });
    resolvedStoreId = sale?.branch?.storeId ?? null;

    if (!resolvedStoreId) {
      const payment = await prisma.customerPayment.findFirst({
        where: { customerId: cust.id, branch: { storeId: { not: null } } },
        select: { branch: { select: { storeId: true } } },
      });
      resolvedStoreId = payment?.branch?.storeId ?? null;
    }

    if (!resolvedStoreId) {
      const ret = await prisma.return.findFirst({
        where: { customerId: cust.id, branch: { storeId: { not: null } } },
        select: { branch: { select: { storeId: true } } },
      });
      resolvedStoreId = ret?.branch?.storeId ?? null;
    }

    const targetStoreId = resolvedStoreId;
    if (!targetStoreId) continue; // Keep store-agnostic portal self-registrants with storeId=null

    const phoneConflict = await prisma.customer.findFirst({
      where: { storeId: targetStoreId, phone: cust.phone, id: { not: cust.id } },
      select: { id: true },
    });
    const emailConflict = cust.email
      ? await prisma.customer.findFirst({
          where: { storeId: targetStoreId, email: cust.email, id: { not: cust.id } },
          select: { id: true },
        })
      : null;

    if (!phoneConflict && !emailConflict) {
      await prisma.customer.update({
        where: { id: cust.id },
        data: { storeId: targetStoreId },
      });
      updatedCustomers++;
    }
  }

  // 6. Backfill PatientMessage.storeId via creator.storeId or customer.storeId -> primaryStoreId
  const legacyPatientMsgs = await prisma.patientMessage.findMany({
    where: { storeId: null },
    select: {
      id: true,
      customer: { select: { storeId: true } },
      creator: { select: { storeId: true, branchId: true } },
    },
  });
  for (const pm of legacyPatientMsgs) {
    const resolvedStoreId = pm.creator?.storeId ?? pm.customer?.storeId ?? primaryStoreId;
    const resolvedBranchId = pm.creator?.branchId ?? null;
    await prisma.patientMessage.update({
      where: { id: pm.id },
      data: {
        storeId: resolvedStoreId,
        ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
      },
    });
    updatedPatientMessages++;
  }

  console.log(
    JSON.stringify(
      {
        storesCount: stores.length,
        updatedSettings,
        updatedMedicines,
        updatedSuppliers,
        updatedSupplierMessages,
        updatedCustomers,
        updatedPatientMessages,
      },
      null,
      2
    )
  );
  console.log("✔ Backfill completed cleanly.");
}

main()
  .catch((err) => {
    console.error("Backfill error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
