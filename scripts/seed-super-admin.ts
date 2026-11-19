/**
 * CLI Seed Script for Initial Platform CEO (`PlatformUser`) & Default `PlatformConfig` (Module 3.2.1)
 *
 * Usage:
 *   node ./node_modules/tsx/dist/cli.mjs scripts/seed-super-admin.ts
 * Optional overrides via env:
 *   SEED_CEO_NAME, SEED_CEO_USERNAME, SEED_CEO_EMAIL, SEED_CEO_PASSWORD
 */

import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

async function main() {
  console.log("================================================================================");
  console.log("MODULE 3.2.1: PLATFORM CEO BOOTSTRAP SEEDER");
  console.log("================================================================================");

  const existingCeo = await prisma.platformUser.findFirst({
    where: { role: "ceo" },
    select: { id: true, username: true, email: true, active: true },
  });

  if (existingCeo) {
    console.log(
      `Platform CEO already exists (username="${existingCeo.username}", email="${existingCeo.email}", active=${existingCeo.active}). No changes made.`
    );
  } else {
    const name = (process.env.SEED_CEO_NAME || "Platform CEO").trim();
    const username = (process.env.SEED_CEO_USERNAME || "ceo").trim().toLowerCase();
    const email = (process.env.SEED_CEO_EMAIL || "ceo@medicalpos.local").trim().toLowerCase();
    const password = process.env.SEED_CEO_PASSWORD || "CeoAdmin@2026!";

    const passwordHash = await hashPassword(password);
    const created = await prisma.platformUser.create({
      data: {
        name,
        username,
        email,
        password: passwordHash,
        role: "ceo",
        active: true,
      },
    });

    await prisma.platformAuditLog.create({
      data: {
        platformUserId: created.id,
        action: "PLATFORM_CEO_SEEDED_CLI",
        entity: "platform_users",
        entityId: created.id,
        details: JSON.stringify({ username: created.username, email: created.email }),
        ipAddress: "127.0.0.1",
      },
    });

    console.log(
      `✔ Created initial Platform CEO: username="${created.username}", email="${created.email}"`
    );
  }

  const configCount = await prisma.platformConfig.count();
  if (configCount === 0) {
    await prisma.platformConfig.create({
      data: {
        platformName: "Medical POS Cloud",
        sacCode: "998314",
        defaultTrialDays: 14,
        gracePeriodDays: 7,
        razorpayMode: "test",
      },
    });
    console.log("✔ Seeded default PlatformConfig row.");
  } else {
    console.log("PlatformConfig already exists.");
  }
}

main()
  .catch((err) => {
    console.error("CEO seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
