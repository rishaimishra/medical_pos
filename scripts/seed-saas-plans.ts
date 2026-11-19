/**
 * CLI Seeder for Module 3.4.2 Recommended 4-Tier SaaS Subscription Plans
 * Usage: node ./node_modules/tsx/dist/cli.mjs scripts/seed-saas-plans.ts
 */

import { prisma } from "../src/lib/prisma";
import { ensureDefaultPlansSeeded } from "../src/lib/saasFeatures";

async function main() {
  console.log("================================================================================");
  console.log("MODULE 3.4.2: SEEDING RECOMMENDED 4-TIER SAAS PLANS");
  console.log("================================================================================");

  const result = await ensureDefaultPlansSeeded();
  console.log(JSON.stringify(result, null, 2));
  console.log("✔ SaaS Plans check/seeding complete.");
}

main()
  .catch((err) => {
    console.error("SaaS plan seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
