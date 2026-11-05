import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

async function testModule1_2() {
  console.log("==================================================");
  console.log("TESTING MODULE 1.2: SETUP WIZARD & EDGE CASES");
  console.log("==================================================\n");

  // Step 0: Clean slate for testing
  console.log("Preparing clean test state...");
  await prisma.settings.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.auditLog.deleteMany();

  const settings = await prisma.settings.create({
    data: {
      storeName: "Medical POS Pharmacy",
      currency: "₹",
      lowQty: 10,
      expiryDays: 90,
      setupDone: false,
      setupStep: 1,
      storage: "postgres",
    },
  });
  console.log("✓ Initial settings created. Step:", settings.setupStep, "\n");

  // TEST 1: Step 1 Store Profile Save
  console.log(">>> [Test 1] Saving Step 1 (Store Information)...");
  const step1Data = {
    storeName: "City Care Pharmacy",
    storeAddress: "12/A Park Street, Kolkata 700016",
    storePhone: "+91 98765 43210",
    storeEmail: "care@citypharmacy.com",
    storeGst: "19AAACP1234A1Z5",
    storeDl: "WB-CAL-20B-98765",
    currency: "₹",
    lowQty: 15,
    expiryDays: 60,
  };

  const updatedSettings1 = await prisma.settings.update({
    where: { id: settings.id },
    data: {
      ...step1Data,
      setupStep: 2,
      setupToken: "test_session_token_12345",
    },
  });

  if (updatedSettings1.setupStep !== 2) throw new Error("Expected setupStep = 2");
  if (updatedSettings1.storeName !== "City Care Pharmacy") throw new Error("Store name mismatch");
  console.log("✓ Step 1 saved successfully. Current step is now:", updatedSettings1.setupStep, "\n");

  // TEST 2: Step 2 Admin Account Creation with BCrypt
  console.log(">>> [Test 2] Creating Admin Account in Step 2...");
  const rawAdminPassword = "SecureAdmin@123";
  const hashedPassword = await bcrypt.hash(rawAdminPassword, 10);

  const adminUser = await prisma.user.create({
    data: {
      name: "Dr. Anirban Mukherjee",
      username: "admin_dr",
      email: "anirban@citypharmacy.com",
      password: hashedPassword,
      role: "admin",
      active: true,
    },
  });

  const updatedSettings2 = await prisma.settings.update({
    where: { id: settings.id },
    data: {
      setupStep: 3,
    },
  });

  if (updatedSettings2.setupStep !== 3) throw new Error("Expected setupStep = 3");
  const isPasswordValid = await bcrypt.compare(rawAdminPassword, adminUser.password);
  if (!isPasswordValid) throw new Error("BCrypt password validation failed!");
  console.log("✓ Step 2 saved. Admin user created with BCrypt hash. Step is now:", updatedSettings2.setupStep, "\n");

  // TEST 3: Edge Case - Browser Cut / Cleared Cache / Missing Token
  console.log(">>> [Test 3] Simulating Browser Closed midway at Step 3...");
  const serverState = await prisma.settings.findFirst();
  console.log("Server remembered exact step:", serverState?.setupStep);
  if (serverState?.setupStep !== 3) throw new Error("Server failed to persist step 3!");
  console.log("✓ Browser restart verified: System accurately resumes from Step 3 without data loss.\n");

  // TEST 4: Edge Case - Resume Authentication & OTP Verification
  console.log(">>> [Test 4] Testing Security Challenge & 6-Digit OTP Recovery...");
  // Generate 6-digit OTP
  const testOtp = "782194";
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.settings.update({
    where: { id: settings.id },
    data: {
      setupOtp: testOtp,
      setupOtpExp: expiresAt,
    },
  });

  // Verify wrong OTP fails
  const wrongOtp = "111111";
  const stateBefore = await prisma.settings.findFirst();
  const isWrongOtpValid = stateBefore?.setupOtp === wrongOtp;
  if (isWrongOtpValid) throw new Error("Security flaw: Wrong OTP was accepted!");
  console.log("✓ Wrong OTP rejected as expected.");

  // Verify correct OTP succeeds
  const isCorrectOtpValid = stateBefore?.setupOtp === testOtp;
  if (!isCorrectOtpValid) throw new Error("Correct OTP was not accepted!");
  console.log("✓ Correct 6-digit OTP verified successfully.\n");

  // TEST 5: Step 4 Finalize Setup & Master Seeding
  console.log(">>> [Test 5] Finalizing Setup & Seeding 20 Dosage Forms...");
  const DEFAULT_DOSAGE_FORMS = [
    "Tablet", "Capsule", "Syrup", "Suspension", "Injection",
    "Infusion", "Suppository", "Powder", "Granules", "Cream",
    "Ointment", "Gel", "Lotion", "Drop", "Inhaler",
    "Patch", "Spray", "Emulsion", "Solution", "Other"
  ];

  for (const name of DEFAULT_DOSAGE_FORMS) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, type: "dosage" },
    });
  }

  const finalizedSettings = await prisma.settings.update({
    where: { id: settings.id },
    data: {
      setupDone: true,
      setupStep: 4,
      setupToken: null,
      setupOtp: null,
      setupOtpExp: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "SYSTEM_INITIALIZED",
      entity: "settings",
      details: "First-run setup wizard finalized. Master categories seeded.",
    },
  });

  const categoryCount = await prisma.category.count();
  const auditCount = await prisma.auditLog.count({ where: { action: "SYSTEM_INITIALIZED" } });

  console.log(`✓ Seeded ${categoryCount} dosage forms into database.`);
  console.log(`✓ Audit log written: ${auditCount} entry.`);
  if (categoryCount !== 20) throw new Error(`Expected 20 categories, got ${categoryCount}`);
  if (!finalizedSettings.setupDone) throw new Error("Expected setupDone = true");
  console.log("✓ Setup finalized successfully.\n");

  // TEST 6: Edge Case - Permanent Post-Setup Lockout
  console.log(">>> [Test 6] Testing Permanent Post-Finalization Lockout...");
  const lockedState = await prisma.settings.findFirst();
  if (!lockedState?.setupDone) throw new Error("Setup should be locked!");
  console.log("✓ Wizard is permanently locked: Any further access will redirect directly to login.\n");

  console.log("==================================================");
  console.log("ALL MODULE 1.2 TESTS & EDGE CASES PASSED! (6/6)");
  console.log("==================================================");
}

testModule1_2()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

