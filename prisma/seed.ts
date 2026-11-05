import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_DOSAGE_FORMS = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Suspension",
  "Injection",
  "Infusion",
  "Suppository",
  "Powder",
  "Granules",
  "Cream",
  "Ointment",
  "Gel",
  "Lotion",
  "Drop",
  "Inhaler",
  "Patch",
  "Spray",
  "Emulsion",
  "Solution",
  "Other",
];

async function main() {
  console.log("Seeding initial master data...");

  // 1. Seed 20 Dosage Forms into categories table
  for (const name of DEFAULT_DOSAGE_FORMS) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: {
        name,
        type: "dosage",
      },
    });
  }
  console.log(`✓ Seeded ${DEFAULT_DOSAGE_FORMS.length} dosage forms.`);

  // 2. Seed Default Settings
  const existingSettings = await prisma.settings.findFirst();
  if (!existingSettings) {
    await prisma.settings.create({
      data: {
        storeName: "Medical POS Pharmacy",
        currency: "₹",
        lowQty: 10,
        expiryDays: 90,
        setupDone: false,
        storage: "postgres",
      },
    });
    console.log("✓ Seeded default pharmacy settings.");
  }

  console.log("Seeding completed successfully.");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

