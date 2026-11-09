-- ============================================================================
-- MEDICAL POS & PHARMACY MANAGEMENT SYSTEM
-- Full SQL Database Backup (.sql)
-- App Version: 0.1.0
-- Exported At: 2026-11-06T13:20:09.168Z
-- Mode: Multi-Store Relational Schema
-- Format: Standard PostgreSQL / MySQL / phpMyAdmin compatible SQL
-- ============================================================================

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ----------------------------------------------------------------------------
-- Table: settings (2 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "settings" ("id", "store_name", "store_address", "store_phone", "store_email", "store_gst", "store_dl", "currency", "low_qty", "expiry_days", "email_provider", "sendgrid_key", "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_name", "smtp_secure", "setup_done", "setup_step", "setup_token", "setup_otp", "setup_otp_exp", "storage", "last_stock_alert_sent_at", "updated_at", "created_at") VALUES
  (4, 'Jeet Store Med Shop', 'kolkata,123 road', '+91 8420863609', 'jeetbasak54@gmail.com', '19aahhyuah', 'wb-cal-12345', '₹', 0, 60, 'sendgrid', NULL, NULL, 587, NULL, NULL, NULL, NULL, 'tls', TRUE, 4, NULL, NULL, NULL, 'postgres', NULL, '2026-11-03 07:17:20.013', '2026-10-30 15:45:40.645'),
  (3, '', NULL, NULL, NULL, NULL, NULL, '₹', 10, 90, 'sendgrid', NULL, NULL, 587, NULL, NULL, NULL, NULL, 'tls', FALSE, 1, NULL, NULL, NULL, 'postgres', '2026-11-06 12:32:09.040', '2026-11-06 12:32:14.096', '2026-10-30 15:14:14.416');

-- ----------------------------------------------------------------------------
-- Table: branches (2 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "branches" ("id", "store_id", "code", "name", "tagline", "address", "phone", "email", "gst_no", "dl_no", "is_main", "active", "updated_at", "created_at") VALUES
  (7, 4, 'BE-02', 'city hospital store', NULL, 'test address 1234 road', '8877665544', NULL, NULL, 'jhf786', FALSE, TRUE, '2026-10-30 16:21:49.488', '2026-10-30 16:19:56.230'),
  (6, 4, 'MAIN', 'Jeet Store Med Shop', NULL, 'kolkata,123 road', '+91 8420863609', 'jeetbasak54@gmail.com', '19aahhyuah', 'wb-cal-12345', TRUE, TRUE, '2026-11-03 07:17:21.096', '2026-10-30 16:06:12.696');

-- ----------------------------------------------------------------------------
-- Table: categories (23 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "categories" ("id", "name", "type") VALUES
  (3, 'Tablet', 'dosage'),
  (4, 'Capsule', 'dosage'),
  (5, 'Syrup', 'dosage'),
  (6, 'Suspension', 'dosage'),
  (7, 'Injection', 'dosage'),
  (8, 'Infusion', 'dosage'),
  (9, 'Suppository', 'dosage'),
  (10, 'Powder', 'dosage'),
  (11, 'Granules', 'dosage'),
  (12, 'Cream', 'dosage'),
  (13, 'Ointment', 'dosage'),
  (14, 'Gel', 'dosage'),
  (15, 'Lotion', 'dosage'),
  (16, 'Drop', 'dosage'),
  (17, 'Inhaler', 'dosage'),
  (18, 'Patch', 'dosage'),
  (19, 'Spray', 'dosage'),
  (20, 'Emulsion', 'dosage'),
  (21, 'Solution', 'dosage'),
  (22, 'Other', 'dosage'),
  (54, 'Test Category 999', 'dosage'),
  (55, 'phpMyAdmin Cat', 'dosage'),
  (56, 'Inhalers & Sprays', 'dosage');

-- ----------------------------------------------------------------------------
-- Table: suppliers (11 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "suppliers" ("id", "name", "contact", "phone", "email", "address", "gst_no", "dl_no", "payment_terms", "updated_at", "created_at") VALUES
  (1, 'Cipla Pharmaceuticals Test', NULL, '022-2482-1000', 'distributor_test@cipla.com', NULL, '27AAAC1234F1Z5', NULL, 30, '2026-11-02 06:35:23.102', '2026-11-02 06:35:23.102'),
  (2, 'Medex Pharma Distributors 920701', 'Subhashis Roy (Senior Manager)', '989207011234', 'contact_920701@medexpharma.com', '42 Park Street, Kolkata - 700016', '19ABCDE920701Z5', 'DL-20B-WB-920701', 45, '2026-11-06 07:42:12.287', '2026-11-06 07:42:07.679'),
  (3, 'Medex Pharma Distributors 994991', 'Subhashis Roy (Senior Manager)', '989949911234', 'contact_994991@medexpharma.com', '42 Park Street, Kolkata - 700016', '19ABCDE994991Z5', 'DL-20B-WB-994991', 45, '2026-11-06 07:43:26.172', '2026-11-06 07:43:22.029'),
  (4, 'Medex Pharma Distributors 010307', 'Subhashis Roy (Senior Manager)', '980103071234', 'contact_010307@medexpharma.com', '42 Park Street, Kolkata - 700016', '19ABCDE010307Z5', 'DL-20B-WB-010307', 45, '2026-11-06 08:00:22.640', '2026-11-06 08:00:18.576'),
  (5, 'Medex Pharma Distributors 454804', 'Subhashis Roy (Senior Manager)', '984548041234', 'contact_454804@medexpharma.com', '42 Park Street, Kolkata - 700016', '19ABCDE454804Z5', 'DL-20B-WB-454804', 45, '2026-11-06 08:41:07.009', '2026-11-06 08:41:02.610'),
  (6, 'Test Pharma Logistics 886175', 'Alok Mukherjee', '9830886175', 'supplier_886175@pharma.test', NULL, NULL, NULL, 30, '2026-11-06 09:27:43.436', '2026-11-06 09:27:43.436'),
  (7, 'Test Pharma Logistics 190838', 'Alok Mukherjee', '9830190838', 'supplier_190838@pharma.test', NULL, NULL, NULL, 30, '2026-11-06 09:30:02.457', '2026-11-06 09:30:02.457'),
  (8, 'Test Pharma Logistics 613747', 'Alok Mukherjee', '9830613747', 'supplier_613747@pharma.test', NULL, NULL, NULL, 30, '2026-11-06 10:12:39.406', '2026-11-06 10:12:39.406'),
  (9, 'Test Pharma Logistics 341721', 'Alok Mukherjee', '9830341721', 'supplier_341721@pharma.test', NULL, NULL, NULL, 30, '2026-11-06 12:26:04.439', '2026-11-06 12:26:04.439'),
  (10, 'Test Pharma Logistics 254584', 'Alok Mukherjee', '9830254584', 'supplier_254584@pharma.test', NULL, NULL, NULL, 30, '2026-11-06 12:30:23.350', '2026-11-06 12:30:23.350'),
  (11, 'Legacy Apex Pharma', NULL, '9876500001', 'apex@legacypharma.com', '77 Old Market Road', '19ABCDE1234F1Z5', NULL, 30, '2026-11-06 13:11:46.763', '2026-11-06 13:11:46.763');

-- ----------------------------------------------------------------------------
-- Table: customers (5 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "customers" ("id", "name", "phone", "email", "address", "dob", "gender", "medical_notes", "is_chronic", "chronic_diseases", "refill_days", "next_refill_date", "last_refill_date", "credit_limit", "password", "active", "verified", "verify_token", "verify_sent_at", "verified_at", "last_login", "updated_at", "created_at") VALUES
  (10, 'Ramesh Sen 886175', '9876886175', 'ramesh_886175@patient.test', '12 Lake Road, Kolkata', '1971-01-01 00:00:00.000', 'male', 'Diabetic, allergic to sulfa drugs', TRUE, 'Diabetes, Hypertension', 30, '2026-12-06 00:00:00.000', '2026-11-06 00:00:00.000', 3000, NULL, TRUE, FALSE, NULL, NULL, NULL, NULL, '2026-11-06 09:28:52.937', '2026-11-06 09:28:41.737'),
  (11, 'Ramesh Sen 190838', '9876190838', 'ramesh_190838@patient.test', '12 Lake Road, Kolkata', '1971-01-01 00:00:00.000', 'male', 'Diabetic, allergic to sulfa drugs', TRUE, 'Diabetes, Hypertension', 30, '2026-12-06 00:00:00.000', '2026-11-06 00:00:00.000', 3000, NULL, TRUE, FALSE, NULL, NULL, NULL, NULL, '2026-11-06 09:32:09.112', '2026-11-06 09:32:09.112'),
  (12, 'Ramesh Sen 341721', '9876341721', 'ramesh_341721@patient.test', '12 Lake Road, Kolkata', '1971-01-01 00:00:00.000', 'male', 'Diabetic, allergic to sulfa drugs', TRUE, 'Diabetes, Hypertension', 30, '2026-12-06 00:00:00.000', '2026-11-06 00:00:00.000', 3000, NULL, TRUE, FALSE, NULL, NULL, NULL, NULL, '2026-11-06 12:28:28.683', '2026-11-06 12:28:00.411'),
  (13, 'Ramesh Sen 254584', '9876254584', 'ramesh_254584@patient.test', '12 Lake Road, Kolkata', '1971-01-01 00:00:00.000', 'male', 'Diabetic, allergic to sulfa drugs', TRUE, 'Diabetes, Hypertension', 30, '2026-12-06 00:00:00.000', '2026-11-06 00:00:00.000', 3000, NULL, TRUE, FALSE, NULL, NULL, NULL, NULL, '2026-11-06 12:32:59.672', '2026-11-06 12:32:26.297'),
  (14, 'Legacy Patient John', '9876543299', 'patient.john@example.com', NULL, NULL, 'male', 'Hypertensive since 2021', FALSE, NULL, NULL, NULL, NULL, 5000, NULL, TRUE, FALSE, NULL, NULL, NULL, NULL, '2026-11-06 13:19:50.839', '2026-11-06 13:11:48.018');

-- ----------------------------------------------------------------------------
-- Table: users (6 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "users" ("id", "store_id", "name", "username", "email", "password", "role", "permissions", "branch_id", "active", "last_login", "updated_at", "created_at") VALUES
  (48, NULL, 'Counter Cashier', 'cashier_1793687330647', 'cashier_1793687330647@test.com', '$2b$12$BlYXyZfSJzJ9Ci5FMsrG4OmrZipHpKF9hk4KeWulk6RsaCg.kTJ32', 'cashier', '{"revokedPermissions":["view_cost_price"]}', 6, TRUE, NULL, '2026-11-03 06:28:55.484', '2026-11-03 06:28:55.484'),
  (49, NULL, 'Counter Cashier', 'cashier_1793687845944', 'cashier_1793687845944@test.com', '$2b$12$Yl8cbB49vmv9JMt8hrGQK.FB7gR6nBxsaKhosLS66nbRqZKAYTgZK', 'cashier', '{"revokedPermissions":["view_cost_price"]}', 6, TRUE, NULL, '2026-11-03 06:37:30.525', '2026-11-03 06:37:30.525'),
  (50, NULL, 'Counter Cashier', 'cashier_1793688591774', 'cashier_1793688591774@test.com', '$2b$12$A15Nj.s1Bi41M7milLG46.I.J6slPlkNPlhgivnS6e3VyyFknY..W', 'cashier', '{"revokedPermissions":["view_cost_price"]}', 6, TRUE, NULL, '2026-11-03 06:49:56.207', '2026-11-03 06:49:56.207'),
  (66, NULL, 'Counter Cashier', 'cashier_1793693798319', 'cashier_1793693798319@test.com', '$2b$12$YrxDYEif/.4ZMPLOlQg68uE9YyD5U29ib2HcCp706pqaoOalzi8aK', 'cashier', '{"revokedPermissions":["view_cost_price"]}', 6, TRUE, NULL, '2026-11-03 08:16:42.524', '2026-11-03 08:16:42.524'),
  (74, NULL, 'PO Test Admin', 'test_admin_po_112', 'admin_po_886175@example.com', '$2b$12$YwvUyYthRoCA100GbJ9h.OtlZpNhMjQCcHmvciH7L.HvWV.LFdY9u', 'admin', NULL, NULL, TRUE, NULL, '2026-11-06 12:30:21.711', '2026-11-06 09:27:42.785'),
  (3, 4, 'jeet basak owner', 'jeetbasak54@gmail.com', 'jeetbasak54@gmail.com', '$2b$12$e9ZeRWZhlLA0HqXX/Twg3eAMLxrLJxWtYW.q/.J2nb0RQ8eMyCEpm', 'admin', NULL, NULL, TRUE, '2026-11-06 12:38:20.961', '2026-11-06 12:38:20.962', '2026-10-30 15:55:50.941');

-- ----------------------------------------------------------------------------
-- Table: supplier_users (8 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "supplier_users" ("id", "supplier_id", "name", "username", "email", "phone", "password", "active", "verified", "last_login", "updated_at", "created_at") VALUES
  (10, 3, 'Subhashis Roy (Senior Manager)', 'sup_994991', 'portal_994991@medexpharma.com', '989949911234', '$2b$12$znDYy2jtqq.j2iz3kO2MmeL7gzvSxLr48kEe7/ZpdgxplrC8pDUFq', TRUE, TRUE, NULL, '2026-11-06 07:43:48.995', '2026-11-06 07:43:46.174'),
  (11, 4, 'Subhashis Roy (Senior Manager)', 'sup_010307', 'portal_010307@medexpharma.com', '980103071234', '$2b$12$xpSF78b4oL1ySYvmuVVa0O8DwFjxO0uLPh7fSbYbVScCee9Yt4c7a', TRUE, TRUE, NULL, '2026-11-06 08:00:45.163', '2026-11-06 08:00:42.442'),
  (12, 5, 'Subhashis Roy (Senior Manager)', 'sup_454804', 'portal_454804@medexpharma.com', '984548041234', '$2b$12$QQ//VIau5EEwyFRWQ2WSCeTqVS9rln.DHw5AVmwZl5z3arTcKlvwy', TRUE, TRUE, NULL, '2026-11-06 08:41:30.685', '2026-11-06 08:41:27.839'),
  (13, 6, 'Alok Supplier Portal', 'sup_886175', 'supplier_portal_886175@pharma.test', '9830886175', '$2b$12$AvhtOW/CzZGTKmJqNR4itu6hr0DYt7dOLjzMhFNMMeaeHJOB5Mh7u', TRUE, FALSE, NULL, '2026-11-06 09:27:44.279', '2026-11-06 09:27:44.279'),
  (14, 7, 'Alok Supplier Portal', 'sup_190838', 'supplier_portal_190838@pharma.test', '9830190838', '$2b$12$8GBT4Vly6uymqnD7ChMTheVpKgRF34dQXMTpqmiPPWvDgOGsZCzwy', TRUE, FALSE, NULL, '2026-11-06 09:30:03.328', '2026-11-06 09:30:03.328'),
  (15, 8, 'Alok Supplier Portal', 'sup_613747', 'supplier_portal_613747@pharma.test', '9830613747', '$2b$12$V3psvnlRLXCYDQpE1GlB1eY28IcoTYRIfY.za18uW98hEfOr3Mz.a', TRUE, FALSE, NULL, '2026-11-06 10:12:40.299', '2026-11-06 10:12:40.299'),
  (16, 9, 'Alok Supplier Portal', 'sup_341721', 'supplier_portal_341721@pharma.test', '9830341721', '$2b$12$0nj47as4tRl.wy5ajb5OK.gDtgy6Gz4OVoF9TY/3e59oZ9Mpn8/rW', TRUE, FALSE, NULL, '2026-11-06 12:26:06.202', '2026-11-06 12:26:06.202'),
  (17, 10, 'Alok Supplier Portal', 'sup_254584', 'supplier_portal_254584@pharma.test', '9830254584', '$2b$12$uTWUIsHBN92/LTV1h8taZuXJetTT7mKPSr3yGwKFSYwkde/rBzagu', TRUE, FALSE, NULL, '2026-11-06 12:30:25.204', '2026-11-06 12:30:25.204');

-- ----------------------------------------------------------------------------
-- Table: medicines (19 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "medicines" ("id", "name", "generic_name", "company", "category", "custom_category", "hsn_code", "gst_percent", "description", "rack_location", "schedule_type", "updated_at", "created_at") VALUES
  (34, 'Paracetamol Test 1793687330647', 'Acetaminophen 500mg', 'Apex Labs', 'Tablet', NULL, NULL, 12, '<!--PACK_META:{"packUnit":"Strip","looseUnit":"Tablet","unitsPerPack":10,"minStockLevel":10}-->', 'Rack: A-1 • Shelf: 2 • Box: B-4', 'normal', '2026-11-03 06:28:56.081', '2026-11-03 06:28:56.081'),
  (35, 'Paracetamol Test 1793687845944', 'Acetaminophen 500mg', 'Apex Labs', 'Tablet', NULL, NULL, 12, '<!--PACK_META:{"packUnit":"Strip","looseUnit":"Tablet","unitsPerPack":10,"minStockLevel":10}-->', 'Rack: A-1 • Shelf: 2 • Box: B-4', 'normal', '2026-11-03 06:37:33.291', '2026-11-03 06:37:33.291'),
  (36, 'Paracetamol Test 1793688591774', 'Acetaminophen 500mg', 'Apex Labs', 'Tablet', NULL, NULL, 12, '<!--PACK_META:{"packUnit":"Strip","looseUnit":"Tablet","unitsPerPack":10,"minStockLevel":10}-->', 'Rack: A-1 • Shelf: 2 • Box: B-4', 'normal', '2026-11-03 06:49:58.631', '2026-11-03 06:49:58.631'),
  (47, 'Paracetamol Test 1793693798319', 'Acetaminophen 500mg', 'Apex Labs', 'Tablet', NULL, NULL, 12, '<!--PACK_META:{"packUnit":"Strip","looseUnit":"Tablet","unitsPerPack":10,"minStockLevel":10}-->', 'Rack: A-1 • Shelf: 2 • Box: B-4', 'normal', '2026-11-03 08:16:44.782', '2026-11-03 08:16:44.782'),
  (50, 'Cefixime 200mg 920701', 'Cefixime Trihydrate', 'Apex Laboratories 920701', 'Tablet', NULL, NULL, 12, NULL, 'Rack: B-1 • Shelf: 2', 'normal', '2026-11-06 07:42:04.796', '2026-11-06 07:42:04.796'),
  (51, 'Cefixime 200mg 994991', 'Cefixime Trihydrate', 'Apex Laboratories 994991', 'Tablet', NULL, NULL, 12, NULL, 'Rack: B-1 • Shelf: 2', 'normal', '2026-11-06 07:43:19.164', '2026-11-06 07:43:19.164'),
  (52, 'Cefixime 200mg 010307', 'Cefixime Trihydrate', 'Apex Laboratories 010307', 'Tablet', NULL, NULL, 12, NULL, 'Rack: B-1 • Shelf: 2', 'normal', '2026-11-06 08:00:15.104', '2026-11-06 08:00:15.104'),
  (53, 'Cefixime 200mg 454804', 'Cefixime Trihydrate', 'Apex Laboratories 454804', 'Tablet', NULL, NULL, 12, NULL, 'Rack: B-1 • Shelf: 2', 'normal', '2026-11-06 08:40:59.781', '2026-11-06 08:40:59.781'),
  (54, 'Metformin 500mg 886175', 'Metformin Hydrochloride', 'Sun Pharma', 'Antidiabetic', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 09:27:44.893', '2026-11-06 09:27:44.893'),
  (55, 'Telmisartan 40mg 886175', 'Telmisartan', 'Cipla', 'Antihypertensive', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 09:27:45.509', '2026-11-06 09:27:45.509'),
  (56, 'Metformin 500mg 190838', 'Metformin Hydrochloride', 'Sun Pharma', 'Antidiabetic', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 09:30:03.971', '2026-11-06 09:30:03.971'),
  (57, 'Telmisartan 40mg 190838', 'Telmisartan', 'Cipla', 'Antihypertensive', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 09:30:04.611', '2026-11-06 09:30:04.611'),
  (58, 'Metformin 500mg 613747', 'Metformin Hydrochloride', 'Sun Pharma', 'Antidiabetic', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 10:12:40.966', '2026-11-06 10:12:40.966'),
  (59, 'Telmisartan 40mg 613747', 'Telmisartan', 'Cipla', 'Antihypertensive', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 10:12:41.632', '2026-11-06 10:12:41.632'),
  (60, 'Metformin 500mg 341721', 'Metformin Hydrochloride', 'Sun Pharma', 'Antidiabetic', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 12:26:07.759', '2026-11-06 12:26:07.759'),
  (61, 'Telmisartan 40mg 341721', 'Telmisartan', 'Cipla', 'Antihypertensive', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 12:26:09.313', '2026-11-06 12:26:09.313'),
  (62, 'Metformin 500mg 254584', 'Metformin Hydrochloride', 'Sun Pharma', 'Antidiabetic', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 12:30:26.834', '2026-11-06 12:30:26.834'),
  (63, 'Telmisartan 40mg 254584', 'Telmisartan', 'Cipla', 'Antihypertensive', NULL, NULL, 12, NULL, NULL, 'normal', '2026-11-06 12:30:28.494', '2026-11-06 12:30:28.494'),
  (64, 'AsthmaCare Inhaler 50mcg', 'Salbutamol', 'Legacy Apex Pharma', 'Inhaler', NULL, '30049099', 12, NULL, 'RACK-IN-01', 'normal', '2026-11-06 13:11:49.883', '2026-11-06 13:11:49.883');

-- ----------------------------------------------------------------------------
-- Table: batches (23 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "batches" ("id", "medicine_id", "batch_no", "mfg_date", "expiry_date", "quantity", "purchase_price", "mrp", "supplier_id", "branch_id", "updated_at", "created_at") VALUES
  (53, 47, 'BATCH-EXPIRED-YEST-1793693798319', NULL, '2026-11-02 00:00:00.000', 15, 50, 80, NULL, 6, '2026-11-03 08:17:02.556', '2026-11-03 08:17:02.556'),
  (50, 47, 'BATCH-ZERO-TEST', NULL, '2027-05-02 00:00:00.000', 0, 0, 145, NULL, 6, '2026-11-03 08:17:20.557', '2026-11-03 08:16:47.765'),
  (51, 47, 'BATCH-CRITICAL-10D-1793693798319', NULL, '2026-11-13 00:00:00.000', 20, 40, 60, NULL, 6, '2026-11-03 08:17:30.338', '2026-11-03 08:16:56.386'),
  (19, 35, 'BATCH-ZERO-TEST', NULL, '2027-05-02 00:00:00.000', 0, 0, 120.5, NULL, 6, '2026-11-03 06:37:38.470', '2026-11-03 06:37:38.470'),
  (20, 35, 'BATCH-CRITICAL-10D-1793687845944', NULL, '2026-11-13 00:00:00.000', 25, 40, 60, NULL, 6, '2026-11-03 06:37:46.270', '2026-11-03 06:37:46.270'),
  (21, 35, 'BATCH-WARNING-60D-1793687845944', NULL, '2027-01-02 00:00:00.000', 50, 35, 55, NULL, 6, '2026-11-03 06:37:49.242', '2026-11-03 06:37:49.242'),
  (22, 35, 'BATCH-EXPIRED-YEST-1793687845944', NULL, '2026-11-02 00:00:00.000', 15, 50, 80, NULL, 6, '2026-11-03 06:37:52.970', '2026-11-03 06:37:52.970'),
  (24, 36, 'BATCH-CRITICAL-10D-1793688591774', NULL, '2026-11-13 00:00:00.000', 25, 40, 60, NULL, 6, '2026-11-03 06:50:11.306', '2026-11-03 06:50:11.306'),
  (25, 36, 'BATCH-WARNING-60D-1793688591774', NULL, '2027-01-02 00:00:00.000', 50, 35, 55, NULL, 6, '2026-11-03 06:50:14.418', '2026-11-03 06:50:14.418'),
  (26, 36, 'BATCH-EXPIRED-YEST-1793688591774', NULL, '2026-11-02 00:00:00.000', 15, 50, 80, NULL, 6, '2026-11-03 06:50:17.562', '2026-11-03 06:50:17.562'),
  (23, 36, 'BATCH-ZERO-TEST', NULL, '2027-05-02 00:00:00.000', 0, 0, 145, NULL, 6, '2026-11-03 06:50:34.687', '2026-11-03 06:50:03.560'),
  (60, 51, 'B-PART-994991', NULL, '2027-11-06 00:00:00.000', 107, 75.5, 120, 3, 6, '2026-11-06 07:45:04.814', '2026-11-06 07:44:54.430'),
  (61, 52, 'B-PART-010307', NULL, '2027-11-06 00:00:00.000', 107, 75.5, 120, 4, 6, '2026-11-06 08:01:26.158', '2026-11-06 08:01:14.954'),
  (62, 53, 'B-PART-454804', NULL, '2027-11-06 00:00:00.000', 107, 75.5, 120, 5, 6, '2026-11-06 08:42:15.564', '2026-11-06 08:42:04.548'),
  (63, 54, 'B-TEST-886175-A', NULL, '2028-12-31 00:00:00.000', 50, 12, 18, 6, NULL, '2026-11-06 09:28:24.029', '2026-11-06 09:28:24.029'),
  (64, 55, 'B-TEST-886175-B', NULL, '2028-12-31 00:00:00.000', 30, 22, 30, 6, NULL, '2026-11-06 09:28:27.023', '2026-11-06 09:28:27.023'),
  (65, 56, 'B-TEST-190838-A', NULL, '2028-12-31 00:00:00.000', 50, 12, 18, 7, NULL, '2026-11-06 09:31:52.685', '2026-11-06 09:31:52.685'),
  (66, 57, 'B-TEST-190838-B', NULL, '2028-12-31 00:00:00.000', 30, 22, 30, 7, NULL, '2026-11-06 09:31:55.565', '2026-11-06 09:31:55.565'),
  (68, 61, 'B-TEST-341721-B', NULL, '2028-12-31 00:00:00.000', 30, 22, 30, 9, NULL, '2026-11-06 12:27:29.106', '2026-11-06 12:27:29.106'),
  (67, 60, 'B-TEST-341721-A', NULL, '2028-12-31 00:00:00.000', 40, 12, 18, 9, NULL, '2026-11-06 12:28:37.577', '2026-11-06 12:27:25.856'),
  (70, 63, 'B-TEST-254584-B', NULL, '2028-12-31 00:00:00.000', 30, 22, 30, 10, NULL, '2026-11-06 12:31:52.916', '2026-11-06 12:31:52.916'),
  (69, 62, 'B-TEST-254584-A', NULL, '2028-12-31 00:00:00.000', 40, 12, 18, 10, NULL, '2026-11-06 12:33:09.205', '2026-11-06 12:31:49.489'),
  (71, 64, 'LEG-INH-2026', NULL, '2028-12-31 00:00:00.000', 150, 120, 180, NULL, 6, '2026-11-06 13:19:53.297', '2026-11-06 13:11:51.119');

-- ----------------------------------------------------------------------------
-- Table: purchase_orders (15 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "purchase_orders" ("id", "po_number", "supplier_id", "branch_id", "po_date", "status", "total", "notes", "invoice_no", "paid_amount", "created_by", "shipped_at", "received_at", "confirmed_at", "updated_at", "created_at") VALUES
  (2, 'PO-2026-00002', 3, 6, '2026-11-06 00:00:00.000', 'pending', 7550, 'Reorder cloned from PO-2026-00001', NULL, 0, NULL, NULL, NULL, NULL, '2026-11-06 07:44:13.032', '2026-11-06 07:44:13.032'),
  (1, 'PO-2026-00001', 3, 6, '2026-11-06 00:00:00.000', 'received', 7550, 'Monthly bulk order for antibacterial stock', 'CHALLAN-FINAL-994991', 0, NULL, '2026-11-06 07:44:07.507', '2026-11-06 07:45:06.924', '2026-11-06 07:44:03.266', '2026-11-06 07:45:06.925', '2026-11-06 07:43:52.555'),
  (4, 'PO-2026-00004', 4, 6, '2026-11-06 00:00:00.000', 'pending', 7550, 'Reorder cloned from PO-2026-00003', NULL, 0, 3, NULL, NULL, NULL, '2026-11-06 08:01:08.753', '2026-11-06 08:01:08.753'),
  (3, 'PO-2026-00003', 4, 6, '2026-11-06 00:00:00.000', 'received', 7550, 'Monthly bulk order for antibacterial stock', 'CHALLAN-FINAL-010307', 0, 3, '2026-11-06 08:01:03.473', '2026-11-06 08:01:28.342', '2026-11-06 08:00:59.442', '2026-11-06 08:01:28.343', '2026-11-06 08:00:48.578'),
  (6, 'PO-2026-00006', 5, 6, '2026-11-06 00:00:00.000', 'pending', 7550, 'Reorder cloned from PO-2026-00005', NULL, 0, 3, NULL, NULL, NULL, '2026-11-06 08:41:57.116', '2026-11-06 08:41:57.116'),
  (5, 'PO-2026-00005', 5, 6, '2026-11-06 00:00:00.000', 'received', 7550, 'Monthly bulk order for antibacterial stock', 'CHALLAN-FINAL-454804', 0, 3, '2026-11-06 08:41:51.297', '2026-11-06 08:42:17.550', '2026-11-06 08:41:47.047', '2026-11-06 08:42:17.551', '2026-11-06 08:41:34.282'),
  (8, 'PO-2026-00008', 6, NULL, '2026-11-06 00:00:00.000', 'cancelled', 1260, 'Reorder cloned from PO-2026-00007', NULL, 0, 74, NULL, NULL, NULL, '2026-11-06 09:28:18.369', '2026-11-06 09:28:14.265'),
  (7, 'PO-2026-00007', 6, NULL, '2026-11-06 00:00:00.000', 'received', 1260, 'Test Initial Order', 'INV-VEND-886175', 0, 74, NULL, '2026-11-06 09:28:28.913', '2026-11-06 09:28:06.713', '2026-11-06 09:28:28.914', '2026-11-06 09:27:48.255'),
  (10, 'PO-2026-00010', 7, NULL, '2026-11-06 00:00:00.000', 'cancelled', 1260, 'Reorder cloned from PO-2026-00009', NULL, 0, 74, NULL, NULL, NULL, '2026-11-06 09:31:46.010', '2026-11-06 09:31:41.691'),
  (9, 'PO-2026-00009', 7, NULL, '2026-11-06 00:00:00.000', 'received', 1260, 'Test Initial Order', 'INV-VEND-190838', 0, 74, NULL, '2026-11-06 09:31:57.479', '2026-11-06 09:30:25.510', '2026-11-06 09:31:57.479', '2026-11-06 09:30:07.504'),
  (11, 'PO-2026-00011', 8, NULL, '2026-11-06 00:00:00.000', 'confirmed', 1260, 'Test Initial Order', NULL, 0, 74, NULL, NULL, '2026-11-06 10:13:02.843', '2026-11-06 10:13:02.844', '2026-11-06 10:12:44.627'),
  (13, 'PO-2026-00013', 9, NULL, '2026-11-06 00:00:00.000', 'cancelled', 1260, 'Reorder cloned from PO-2026-00012', NULL, 0, 74, NULL, NULL, NULL, '2026-11-06 12:27:13.026', '2026-11-06 12:27:03.594'),
  (12, 'PO-2026-00012', 9, NULL, '2026-11-06 00:00:00.000', 'received', 1260, 'Test Initial Order', 'INV-VEND-341721', 0, 74, NULL, '2026-11-06 12:27:32.502', '2026-11-06 12:26:43.751', '2026-11-06 12:27:32.503', '2026-11-06 12:26:15.685'),
  (15, 'PO-2026-00015', 10, NULL, '2026-11-06 00:00:00.000', 'cancelled', 1260, 'Reorder cloned from PO-2026-00014', NULL, 0, 74, NULL, NULL, NULL, '2026-11-06 12:31:35.689', '2026-11-06 12:31:25.249'),
  (14, 'PO-2026-00014', 10, NULL, '2026-11-06 00:00:00.000', 'received', 1260, 'Test Initial Order', 'INV-VEND-254584', 0, 74, NULL, '2026-11-06 12:31:56.391', '2026-11-06 12:31:06.003', '2026-11-06 12:31:56.391', '2026-11-06 12:30:35.089');

-- ----------------------------------------------------------------------------
-- Table: po_items (24 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "po_items" ("id", "po_id", "medicine_id", "quantity", "price", "mrp", "received_qty", "bonus_qty", "batch_no", "expiry_date", "updated_at") VALUES
  (2, 2, 51, 100, 75.5, 120, 0, 0, NULL, NULL, '2026-11-06 07:44:13.032'),
  (1, 1, 51, 100, 75.5, 120, 100, 7, 'B-PART-994991', '2027-11-06 00:00:00.000', '2026-11-06 07:45:05.801'),
  (4, 4, 52, 100, 75.5, 120, 0, 0, NULL, NULL, '2026-11-06 08:01:08.753'),
  (3, 3, 52, 100, 75.5, 120, 100, 7, 'B-PART-010307', '2027-11-06 00:00:00.000', '2026-11-06 08:01:27.363'),
  (6, 6, 53, 100, 75.5, 120, 0, 0, NULL, NULL, '2026-11-06 08:41:57.116'),
  (5, 5, 53, 100, 75.5, 120, 100, 7, 'B-PART-454804', '2027-11-06 00:00:00.000', '2026-11-06 08:42:16.570'),
  (9, 8, 54, 50, 12, 18, 0, 0, NULL, NULL, '2026-11-06 09:28:14.265'),
  (10, 8, 55, 30, 22, 30, 0, 0, NULL, NULL, '2026-11-06 09:28:14.265'),
  (7, 7, 54, 50, 12, 18, 50, 0, 'B-TEST-886175-A', '2028-12-31 00:00:00.000', '2026-11-06 09:28:25.306'),
  (8, 7, 55, 30, 22, 30, 30, 0, 'B-TEST-886175-B', '2028-12-31 00:00:00.000', '2026-11-06 09:28:27.654'),
  (13, 10, 56, 50, 12, 18, 0, 0, NULL, NULL, '2026-11-06 09:31:41.691'),
  (14, 10, 57, 30, 22, 30, 0, 0, NULL, NULL, '2026-11-06 09:31:41.691'),
  (11, 9, 56, 50, 12, 18, 50, 0, 'B-TEST-190838-A', '2028-12-31 00:00:00.000', '2026-11-06 09:31:53.962'),
  (12, 9, 57, 30, 22, 30, 30, 0, 'B-TEST-190838-B', '2028-12-31 00:00:00.000', '2026-11-06 09:31:56.206'),
  (15, 11, 58, 50, 12, 18, 0, 0, NULL, NULL, '2026-11-06 10:12:56.113'),
  (16, 11, 59, 30, 22, 30, 0, 0, NULL, NULL, '2026-11-06 10:12:56.752'),
  (19, 13, 60, 50, 12, 18, 0, 0, NULL, NULL, '2026-11-06 12:27:03.594'),
  (20, 13, 61, 30, 22, 30, 0, 0, NULL, NULL, '2026-11-06 12:27:03.594'),
  (17, 12, 60, 50, 12, 18, 50, 0, 'B-TEST-341721-A', '2028-12-31 00:00:00.000', '2026-11-06 12:27:27.128'),
  (18, 12, 61, 30, 22, 30, 30, 0, 'B-TEST-341721-B', '2028-12-31 00:00:00.000', '2026-11-06 12:27:30.393'),
  (23, 15, 62, 50, 12, 18, 0, 0, NULL, NULL, '2026-11-06 12:31:25.249'),
  (24, 15, 63, 30, 22, 30, 0, 0, NULL, NULL, '2026-11-06 12:31:25.249'),
  (21, 14, 62, 50, 12, 18, 50, 0, 'B-TEST-254584-A', '2028-12-31 00:00:00.000', '2026-11-06 12:31:50.863'),
  (22, 14, 63, 30, 22, 30, 30, 0, 'B-TEST-254584-B', '2028-12-31 00:00:00.000', '2026-11-06 12:31:54.323');

-- ----------------------------------------------------------------------------
-- Table: sales (2 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "sales" ("id", "invoice_no", "customer_id", "sale_date", "total_amount", "gst_amount", "discount_amount", "discount_id", "grand_total", "payment_method", "upi_ref", "cheque_no", "cheque_bank", "cheque_date", "doctor_name", "doctor_reg_no", "created_by", "branch_id", "created_at") VALUES
  (8, 'DRX-2026-00001', 12, '2026-11-06 00:00:00.000', 180, 19.29, 0, NULL, 180, 'credit', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-06 12:28:40.642'),
  (9, 'DRX-2026-00002', 13, '2026-11-06 00:00:00.000', 180, 19.29, 0, NULL, 180, 'credit', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-11-06 12:33:12.573');

-- ----------------------------------------------------------------------------
-- Table: sales_items (2 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "sales_items" ("id", "sale_id", "medicine_id", "batch_id", "quantity", "mrp", "taxable_base", "gst_percent", "gst_amount", "price") VALUES
  (8, 8, 60, 67, 10, 18, 160.71, 12, 19.29, 180),
  (9, 9, 62, 69, 10, 18, 160.71, 12, 19.29, 180);

-- ----------------------------------------------------------------------------
-- Table: returns (0 rows)
-- ----------------------------------------------------------------------------
-- No data for returns

-- ----------------------------------------------------------------------------
-- Table: return_items (0 rows)
-- ----------------------------------------------------------------------------
-- No data for return_items

-- ----------------------------------------------------------------------------
-- Table: discounts (0 rows)
-- ----------------------------------------------------------------------------
-- No data for discounts

-- ----------------------------------------------------------------------------
-- Table: stock_adjustments (17 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "stock_adjustments" ("id", "batch_id", "medicine_id", "branch_id", "type", "quantity", "reason", "old_qty", "new_qty", "user_id", "created_at") VALUES
  (16, 51, 47, 6, 'remove', -5, 'Batch Details Edit: Stock modified from 25 to 20 units', 25, 20, 3, '2026-11-03 08:17:32.204'),
  (23, 60, 51, 6, 'add', 65, 'GRN: PO-2026-00001 (Inv: CHALLAN-PART-994991)', 0, 65, NULL, '2026-11-06 07:44:56.392'),
  (24, 60, 51, 6, 'add', 42, 'GRN: PO-2026-00001 (Inv: CHALLAN-FINAL-994991)', 65, 107, NULL, '2026-11-06 07:45:06.216'),
  (25, 61, 52, 6, 'add', 65, 'GRN: PO-2026-00003 (Inv: CHALLAN-PART-010307)', 0, 65, 3, '2026-11-06 08:01:16.813'),
  (26, 61, 52, 6, 'add', 42, 'GRN: PO-2026-00003 (Inv: CHALLAN-FINAL-010307)', 65, 107, 3, '2026-11-06 08:01:27.693'),
  (27, 62, 53, 6, 'add', 65, 'GRN: PO-2026-00005 (Inv: CHALLAN-PART-454804)', 0, 65, 3, '2026-11-06 08:42:06.508'),
  (28, 62, 53, 6, 'add', 42, 'GRN: PO-2026-00005 (Inv: CHALLAN-FINAL-454804)', 65, 107, 3, '2026-11-06 08:42:16.898'),
  (29, 63, 54, NULL, 'add', 50, 'GRN: PO-2026-00007 (Inv: INV-VEND-886175)', 0, 50, 74, '2026-11-06 09:28:25.943'),
  (30, 64, 55, NULL, 'add', 30, 'GRN: PO-2026-00007 (Inv: INV-VEND-886175)', 0, 30, 74, '2026-11-06 09:28:27.969'),
  (32, 65, 56, NULL, 'add', 50, 'GRN: PO-2026-00009 (Inv: INV-VEND-190838)', 0, 50, 74, '2026-11-06 09:31:54.604'),
  (33, 66, 57, NULL, 'add', 30, 'GRN: PO-2026-00009 (Inv: INV-VEND-190838)', 0, 30, 74, '2026-11-06 09:31:56.525'),
  (34, 67, 60, NULL, 'add', 50, 'GRN: PO-2026-00012 (Inv: INV-VEND-341721)', 0, 50, 74, '2026-11-06 12:27:27.754'),
  (35, 68, 61, NULL, 'add', 30, 'GRN: PO-2026-00012 (Inv: INV-VEND-341721)', 0, 30, 74, '2026-11-06 12:27:31.155'),
  (36, 67, 60, NULL, 'sale', -10, 'Sale: DRX-2026-00001', 50, 40, NULL, '2026-11-06 12:28:38.189'),
  (37, 69, 62, NULL, 'add', 50, 'GRN: PO-2026-00014 (Inv: INV-VEND-254584)', 0, 50, 74, '2026-11-06 12:31:51.536'),
  (38, 70, 63, NULL, 'add', 30, 'GRN: PO-2026-00014 (Inv: INV-VEND-254584)', 0, 30, 74, '2026-11-06 12:31:55.040'),
  (39, 69, 62, NULL, 'sale', -10, 'Sale: DRX-2026-00002', 50, 40, NULL, '2026-11-06 12:33:09.924');

-- ----------------------------------------------------------------------------
-- Table: supplier_payments (3 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "supplier_payments" ("id", "supplier_id", "branch_id", "amount", "payment_date", "payment_method", "reference_no", "notes", "created_by", "created_at") VALUES
  (1, 3, NULL, 2500, '2026-11-06 00:00:00.000', 'bank_transfer', 'UTR-994991-8877', 'Advance payment against upcoming PO', NULL, '2026-11-06 07:43:37.816'),
  (2, 4, NULL, 2500, '2026-11-06 00:00:00.000', 'bank_transfer', 'UTR-010307-8877', 'Advance payment against upcoming PO', 3, '2026-11-06 08:00:33.880'),
  (3, 5, NULL, 2500, '2026-11-06 00:00:00.000', 'bank_transfer', 'UTR-454804-8877', 'Advance payment against upcoming PO', 3, '2026-11-06 08:41:18.779');

-- ----------------------------------------------------------------------------
-- Table: customer_payments (2 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "customer_payments" ("id", "customer_id", "sale_id", "amount", "payment_date", "payment_method", "reference_no", "notes", "branch_id", "created_by", "created_at") VALUES
  (1, 12, NULL, 50, '2026-11-06 00:00:00.000', 'upi', 'UPI-SETTLE-341721', 'Partial payment settlement via counter QR', NULL, 74, '2026-11-06 12:28:58.139'),
  (2, 13, NULL, 50, '2026-11-06 00:00:00.000', 'upi', 'UPI-SETTLE-254584', 'Partial payment settlement via counter QR', NULL, 74, '2026-11-06 12:33:31.444');

-- ----------------------------------------------------------------------------
-- Table: customer_purchase_log (2 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "customer_purchase_log" ("id", "customer_id", "sale_id", "amount", "date") VALUES
  (1, 12, 8, 180, '2026-11-06 00:00:00.000'),
  (2, 13, 9, 180, '2026-11-06 00:00:00.000');

-- ----------------------------------------------------------------------------
-- Table: login_attempts (0 rows)
-- ----------------------------------------------------------------------------
-- No data for login_attempts

-- ----------------------------------------------------------------------------
-- Table: audit_logs (233 rows)
-- ----------------------------------------------------------------------------
INSERT INTO "audit_logs" ("id", "store_id", "user_id", "branch_id", "action", "entity", "entity_id", "details", "ip_address", "created_at") VALUES
  (8, 4, 3, 6, 'SETUP_COMPLETED', 'settings', 4, 'Store setup finalized for ''Jeet Store Med Shop''. Primary MAIN branch and 20 dosage categories initialized.', NULL, '2026-10-30 16:06:13.765'),
  (9, NULL, 3, NULL, 'SCREEN_LOCKED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"manual_header_button"}', '::1', '2026-10-30 16:06:34.609'),
  (10, NULL, 3, NULL, 'SCREEN_UNLOCKED', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin"}', '::1', '2026-10-30 16:06:56.875'),
  (11, 4, 3, 7, 'BRANCH_CREATED', 'branches', 7, '{"code":"BE-02","name":"city hospital store","gstNo":null,"dlNo":"jhf786"}', '::1', '2026-10-30 16:19:56.761'),
  (12, 4, 3, 7, 'BRANCH_UPDATED', 'branches', 7, '{"code":"BE-02","name":"city hospital store","active":false}', '::1', '2026-10-30 16:21:27.838'),
  (13, 4, 3, 7, 'BRANCH_UPDATED', 'branches', 7, '{"code":"BE-02","name":"city hospital store","active":true}', '::1', '2026-10-30 16:21:49.752'),
  (14, NULL, 3, NULL, 'LOGIN_SUCCESS', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-02 06:14:04.837'),
  (15, NULL, 3, NULL, 'LOGOUT', 'users', 3, '{"username":"jeetbasak54@gmail.com"}', '::1', '2026-11-02 06:42:26.927'),
  (16, NULL, 3, NULL, 'LOGIN_SUCCESS', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-02 06:42:40.474'),
  (17, NULL, 3, NULL, 'LOGOUT', 'users', 3, '{"username":"jeetbasak54@gmail.com"}', '::1', '2026-11-02 07:15:52.463'),
  (18, NULL, 3, NULL, 'LOGIN_SUCCESS', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-02 07:21:23.703'),
  (19, NULL, 3, NULL, 'SCREEN_LOCKED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"manual_header_button"}', '::1', '2026-11-02 07:22:22.480'),
  (20, NULL, 3, NULL, 'SCREEN_UNLOCKED', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin"}', '::1', '2026-11-02 07:22:36.157'),
  (21, 4, 3, NULL, 'USER_CREATED', 'users', 29, '{"username":"staff_revok_1793611514521","name":"Revocation Test Staff","email":"staff_revok_1793611514521@test.com","role":"staff","branchId":null}', '::1', '2026-11-02 09:25:17.916'),
  (22, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 22, '{"name":"ZeroGST_Drug_1793611520771","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","unitsPerPack":10,"rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 09:25:25.091'),
  (23, 4, 3, NULL, 'MEDICINE_UPDATED', 'Medicine', 22, '{"name":"ZeroGST_Renamed_1793611526157","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 09:25:28.219'),
  (24, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 0, '{"bulkImport":true,"importedCount":2,"skippedDuplicates":3}', '::1', '2026-11-02 09:26:10.511'),
  (25, 4, 3, NULL, 'USER_CREATED', 'users', 31, '{"username":"staff_revok_1793611684990","name":"Revocation Test Staff","email":"staff_revok_1793611684990@test.com","role":"staff","branchId":null}', '::1', '2026-11-02 09:28:07.253'),
  (26, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 25, '{"name":"ZeroGST_Drug_1793611689015","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","unitsPerPack":10,"rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 09:28:09.882'),
  (27, 4, 3, NULL, 'MEDICINE_UPDATED', 'Medicine', 25, '{"name":"ZeroGST_Renamed_1793611690670","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 09:28:11.774'),
  (28, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 0, '{"bulkImport":true,"importedCount":2,"skippedDuplicates":3}', '::1', '2026-11-02 09:28:17.722'),
  (29, 4, 3, 6, 'SETTINGS_UPDATED', 'settings', 4, '{"storeName":"Jeet Store Med Shop","storeGst":"19aahhyuah","storeDl":"wb-cal-12345","lowQty":0,"expiryDays":60,"emailProvider":"sendgrid"}', '::1', '2026-11-02 10:10:14.149'),
  (30, 4, 3, NULL, 'BRANCH_CREATED', 'branches', 9, '{"code":"TB-7873","name":"Integration Test Branch","gstNo":"19ABCDE1234F1Z5","dlNo":null}', '::1', '2026-11-02 10:10:19.278'),
  (31, 4, 3, NULL, 'BRANCH_UPDATED', 'branches', 9, '{"code":"TB-7873","name":"Updated Test Branch Name","active":true}', '::1', '2026-11-02 10:10:22.368'),
  (32, 4, 3, NULL, 'BRANCH_DELETED', 'branches', 9, '{"deletedCode":"TB-7873","deletedName":"Updated Test Branch Name"}', '::1', '2026-11-02 10:10:25.728'),
  (33, 4, 3, NULL, 'LOGIN_FAILED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"Invalid password","attemptsCount":2,"remainingAttempts":3}', '::1', '2026-11-02 10:10:31.307'),
  (34, 4, NULL, NULL, 'LOGIN_SUCCESS', 'users', 34, '{"username":"login_test_1793614231578","role":"staff","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-02 10:10:40.655'),
  (35, 4, NULL, NULL, 'SCREEN_LOCKED', 'users', 34, '{"username":"login_test_1793614231578","reason":"manual_test"}', '::1', '2026-11-02 10:10:41.480'),
  (36, 4, NULL, NULL, 'SCREEN_UNLOCKED', 'users', 34, '{"username":"login_test_1793614231578","role":"staff"}', '::1', '2026-11-02 10:10:43.976'),
  (37, 4, 3, NULL, 'USER_CREATED', 'users', 36, '{"username":"staff_revok_1793614333395","name":"Revocation Test Staff","email":"staff_revok_1793614333395@test.com","role":"staff","branchId":null}', '::1', '2026-11-02 10:12:16.418'),
  (38, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 28, '{"name":"ZeroGST_Drug_1793614339305","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","unitsPerPack":10,"rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 10:12:21.344'),
  (39, 4, 3, NULL, 'MEDICINE_UPDATED', 'Medicine', 28, '{"name":"ZeroGST_Renamed_1793614342127","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 10:12:24.048'),
  (40, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 0, '{"bulkImport":true,"importedCount":2,"skippedDuplicates":3}', '::1', '2026-11-02 10:12:31.761'),
  (41, 4, 3, 6, 'SETTINGS_UPDATED', 'settings', 4, '{"storeName":"Jeet Store Med Shop","storeGst":"19aahhyuah","storeDl":"wb-cal-12345","lowQty":0,"expiryDays":60,"emailProvider":"sendgrid"}', '::1', '2026-11-02 10:20:50.725'),
  (42, 4, 3, NULL, 'BRANCH_CREATED', 'branches', 10, '{"code":"TB-1798","name":"Integration Test Branch","gstNo":"19ABCDE1234F1Z5","dlNo":null}', '::1', '2026-11-02 10:20:53.144'),
  (43, 4, 3, NULL, 'BRANCH_UPDATED', 'branches', 10, '{"code":"TB-1798","name":"Updated Test Branch Name","active":true}', '::1', '2026-11-02 10:20:55.925'),
  (44, 4, 3, NULL, 'BRANCH_DELETED', 'branches', 10, '{"deletedCode":"TB-1798","deletedName":"Updated Test Branch Name"}', '::1', '2026-11-02 10:20:59.198'),
  (45, 4, 3, NULL, 'LOGIN_FAILED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"Invalid password","attemptsCount":4,"remainingAttempts":1}', '::1', '2026-11-02 10:21:04.540'),
  (46, 4, NULL, NULL, 'LOGIN_SUCCESS', 'users', 39, '{"username":"login_test_1793614864799","role":"staff","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-02 10:21:10.297'),
  (47, 4, NULL, NULL, 'SCREEN_LOCKED', 'users', 39, '{"username":"login_test_1793614864799","reason":"manual_test"}', '::1', '2026-11-02 10:21:11.235'),
  (48, 4, NULL, NULL, 'SCREEN_UNLOCKED', 'users', 39, '{"username":"login_test_1793614864799","role":"staff"}', '::1', '2026-11-02 10:21:13.620'),
  (49, 4, 3, NULL, 'USER_CREATED', 'users', 41, '{"username":"staff_revok_1793614898431","name":"Revocation Test Staff","email":"staff_revok_1793614898431@test.com","role":"staff","branchId":null}', '::1', '2026-11-02 10:21:41.521'),
  (50, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 31, '{"name":"ZeroGST_Drug_1793614903772","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","unitsPerPack":10,"rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 10:21:45.164'),
  (51, 4, 3, NULL, 'MEDICINE_UPDATED', 'Medicine', 31, '{"name":"ZeroGST_Renamed_1793614905977","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-02 10:21:47.902'),
  (52, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 0, '{"bulkImport":true,"importedCount":2,"skippedDuplicates":3}', '::1', '2026-11-02 10:21:55.915'),
  (53, 4, 3, 6, 'SETTINGS_UPDATED', 'settings', 4, '{"storeName":"Jeet Store Med Shop","storeGst":"19aahhyuah","storeDl":"wb-cal-12345","lowQty":0,"expiryDays":60,"emailProvider":"sendgrid"}', '::1', '2026-11-02 10:33:08.119'),
  (54, 4, 3, NULL, 'BRANCH_CREATED', 'branches', 11, '{"code":"TB-9068","name":"Integration Test Branch","gstNo":"19ABCDE1234F1Z5","dlNo":null}', '::1', '2026-11-02 10:33:10.416'),
  (55, 4, 3, NULL, 'BRANCH_UPDATED', 'branches', 11, '{"code":"TB-9068","name":"Updated Test Branch Name","active":true}', '::1', '2026-11-02 10:33:13.192'),
  (56, 4, 3, NULL, 'BRANCH_DELETED', 'branches', 11, '{"deletedCode":"TB-9068","deletedName":"Updated Test Branch Name"}', '::1', '2026-11-02 10:33:16.465'),
  (57, 4, 3, NULL, 'LOGIN_FAILED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"Invalid password","attemptsCount":4,"remainingAttempts":1}', '::1', '2026-11-02 10:33:21.555'),
  (58, 4, NULL, NULL, 'LOGIN_SUCCESS', 'users', 47, '{"username":"login_test_1793615601822","role":"staff","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-02 10:33:26.975'),
  (59, 4, NULL, NULL, 'SCREEN_LOCKED', 'users', 47, '{"username":"login_test_1793615601822","reason":"manual_test"}', '::1', '2026-11-02 10:33:27.880'),
  (60, 4, NULL, NULL, 'SCREEN_UNLOCKED', 'users', 47, '{"username":"login_test_1793615601822","role":"staff"}', '::1', '2026-11-02 10:33:30.063'),
  (61, 4, 3, NULL, 'SCREEN_LOCKED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"auto_lock_2h_inactivity"}', '::1', '2026-11-02 12:15:11.028'),
  (62, 4, 3, NULL, 'LOGIN_SUCCESS', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-03 05:43:28.233'),
  (63, 4, 3, 6, 'BATCH_CREATED', 'Batch', 19, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793687845944","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:37:41.194'),
  (64, 4, 3, 6, 'BATCH_CREATED', 'Batch', 20, '{"batchNo":"BATCH-CRITICAL-10D-1793687845944","medicineName":"Paracetamol Test 1793687845944","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:37:47.863'),
  (65, 4, 3, 6, 'BATCH_CREATED', 'Batch', 21, '{"batchNo":"BATCH-WARNING-60D-1793687845944","medicineName":"Paracetamol Test 1793687845944","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:37:51.033'),
  (66, 4, 3, 6, 'BATCH_CREATED', 'Batch', 22, '{"batchNo":"BATCH-EXPIRED-YEST-1793687845944","medicineName":"Paracetamol Test 1793687845944","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:37:54.702'),
  (67, 4, 3, 6, 'BATCH_CREATED', 'Batch', 23, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793688591774","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:50:06.136'),
  (68, 4, 3, 6, 'BATCH_CREATED', 'Batch', 24, '{"batchNo":"BATCH-CRITICAL-10D-1793688591774","medicineName":"Paracetamol Test 1793688591774","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:50:13.082'),
  (69, 4, 3, 6, 'BATCH_CREATED', 'Batch', 25, '{"batchNo":"BATCH-WARNING-60D-1793688591774","medicineName":"Paracetamol Test 1793688591774","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:50:15.971'),
  (70, 4, 3, 6, 'BATCH_CREATED', 'Batch', 26, '{"batchNo":"BATCH-EXPIRED-YEST-1793688591774","medicineName":"Paracetamol Test 1793688591774","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 06:50:19.100'),
  (71, 4, 3, 6, 'BATCH_EDIT', 'Batch', 23, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 06:50:36.541'),
  (72, 4, 3, 6, 'BATCH_CREATED', 'Batch', 27, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793689251058","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:01:24.229'),
  (73, 4, 3, 6, 'BATCH_CREATED', 'Batch', 28, '{"batchNo":"BATCH-CRITICAL-10D-1793689251058","medicineName":"Paracetamol Test 1793689251058","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:01:31.446'),
  (74, 4, 3, 6, 'BATCH_CREATED', 'Batch', 29, '{"batchNo":"BATCH-WARNING-60D-1793689251058","medicineName":"Paracetamol Test 1793689251058","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:01:34.417'),
  (75, 4, 3, 6, 'BATCH_CREATED', 'Batch', 30, '{"batchNo":"BATCH-EXPIRED-YEST-1793689251058","medicineName":"Paracetamol Test 1793689251058","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:01:37.369'),
  (76, 4, 3, 6, 'BATCH_EDIT', 'Batch', 27, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 07:01:55.303'),
  (77, 4, 3, 6, 'BATCH_DELETED', 'Batch', 29, '{"batchNo":"BATCH-WARNING-60D-1793689251058","medicineId":37,"quantity":50}', '::1', '2026-11-03 07:02:02.157'),
  (78, 4, 3, 6, 'BATCH_CREATED', 'Batch', 31, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793689759537","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:09:34.349'),
  (79, 4, 3, 6, 'BATCH_CREATED', 'Batch', 32, '{"batchNo":"BATCH-CRITICAL-10D-1793689759537","medicineName":"Paracetamol Test 1793689759537","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:09:40.887'),
  (80, 4, 3, 6, 'BATCH_CREATED', 'Batch', 33, '{"batchNo":"BATCH-WARNING-60D-1793689759537","medicineName":"Paracetamol Test 1793689759537","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:09:43.872'),
  (81, 4, 3, 6, 'BATCH_CREATED', 'Batch', 34, '{"batchNo":"BATCH-EXPIRED-YEST-1793689759537","medicineName":"Paracetamol Test 1793689759537","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:09:47.108'),
  (82, 4, 3, 6, 'BATCH_EDIT', 'Batch', 31, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 07:10:04.706'),
  (83, 4, 3, 6, 'BATCH_DELETED', 'Batch', 33, '{"batchNo":"BATCH-WARNING-60D-1793689759537","medicineId":38,"quantity":50}', '::1', '2026-11-03 07:10:10.710'),
  (84, 4, 3, NULL, 'USER_CREATED', 'users', 54, '{"username":"staff_revok_1793690162331","name":"Revocation Test Staff","email":"staff_revok_1793690162331@test.com","role":"staff","branchId":null}', '::1', '2026-11-03 07:16:05.303'),
  (85, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 39, '{"name":"ZeroGST_Drug_1793690168017","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","unitsPerPack":10,"rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-03 07:16:10.904'),
  (86, 4, 3, NULL, 'MEDICINE_UPDATED', 'Medicine', 39, '{"name":"ZeroGST_Renamed_1793690171695","company":"Sun Pharma Laboratories","category":"Tablet","scheduleType":"normal","rackLocation":"Rack: A-1 • Shelf: 2 • Box: B-4"}', '::1', '2026-11-03 07:16:13.577'),
  (87, 4, 3, NULL, 'MEDICINE_CREATED', 'Medicine', 0, '{"bulkImport":true,"importedCount":2,"skippedDuplicates":3}', '::1', '2026-11-03 07:16:22.144'),
  (88, 4, 3, 6, 'SETTINGS_UPDATED', 'settings', 4, '{"storeName":"Jeet Store Med Shop","storeGst":"19aahhyuah","storeDl":"wb-cal-12345","lowQty":0,"expiryDays":60,"emailProvider":"sendgrid"}', '::1', '2026-11-03 07:17:21.637'),
  (89, 4, 3, NULL, 'BRANCH_CREATED', 'branches', 12, '{"code":"TB-3178","name":"Integration Test Branch","gstNo":"19ABCDE1234F1Z5","dlNo":null}', '::1', '2026-11-03 07:17:24.824'),
  (90, 4, 3, NULL, 'BRANCH_UPDATED', 'branches', 12, '{"code":"TB-3178","name":"Updated Test Branch Name","active":true}', '::1', '2026-11-03 07:17:27.650'),
  (91, 4, 3, NULL, 'BRANCH_DELETED', 'branches', 12, '{"deletedCode":"TB-3178","deletedName":"Updated Test Branch Name"}', '::1', '2026-11-03 07:17:31.362'),
  (92, 4, 3, NULL, 'LOGIN_FAILED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"Invalid password","attemptsCount":2,"remainingAttempts":3}', '::1', '2026-11-03 07:17:37.583'),
  (93, 4, NULL, NULL, 'LOGIN_SUCCESS', 'users', 57, '{"username":"login_test_1793690257906","role":"staff","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-03 07:17:43.306'),
  (94, 4, NULL, NULL, 'SCREEN_LOCKED', 'users', 57, '{"username":"login_test_1793690257906","reason":"manual_test"}', '::1', '2026-11-03 07:17:44.246'),
  (95, 4, NULL, NULL, 'SCREEN_UNLOCKED', 'users', 57, '{"username":"login_test_1793690257906","role":"staff"}', '::1', '2026-11-03 07:17:46.756'),
  (96, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 1, '{"type":"add","medicineName":"Amoxicillin Test 1793691212495","batchNo":"AMX-212495","adjustedQuantity":15,"oldQuantity":10,"newQuantity":25,"reason":"Physical Audit Variance • Found extra box in storage rack B-2"}', '::1', '2026-11-03 07:33:48.822'),
  (97, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 2, '{"type":"remove","medicineName":"Amoxicillin Test 1793691212495","batchNo":"AMX-212495","adjustedQuantity":5,"oldQuantity":25,"newQuantity":20,"reason":"Breakage/Spillage • Dropped 5 capsules during handling"}', '::1', '2026-11-03 07:33:54.968'),
  (98, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 3, '{"type":"remove","medicineName":"Amoxicillin Test 1793691212495","batchNo":"AMX-212495","adjustedQuantity":20,"oldQuantity":20,"newQuantity":0,"reason":"Expired Discard • Damaged packaging written off to zero"}', '::1', '2026-11-03 07:33:58.448'),
  (99, 4, 3, 6, 'STOCK_TRANSFER', 'StockAdjustment', 4, '{"type":"transfer","medicineName":"Amoxicillin Test 1793691212495","batchNo":"AMX-212495","adjustedQuantity":20,"oldQuantity":50,"newQuantity":30,"reason":"Inter-Branch Stock Transfer • Restocking City Hospital counter","toBranchCode":"BE-02"}', '::1', '2026-11-03 07:34:07.306'),
  (100, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 6, '{"type":"add","medicineName":"Amoxicillin Test 1793691352068","batchNo":"AMX-352068","adjustedQuantity":15,"oldQuantity":10,"newQuantity":25,"reason":"Physical Audit Variance • Found extra box in storage rack B-2"}', '::1', '2026-11-03 07:36:04.666'),
  (101, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 7, '{"type":"remove","medicineName":"Amoxicillin Test 1793691352068","batchNo":"AMX-352068","adjustedQuantity":5,"oldQuantity":25,"newQuantity":20,"reason":"Breakage/Spillage • Dropped 5 capsules during handling"}', '::1', '2026-11-03 07:36:10.588'),
  (102, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 8, '{"type":"remove","medicineName":"Amoxicillin Test 1793691352068","batchNo":"AMX-352068","adjustedQuantity":20,"oldQuantity":20,"newQuantity":0,"reason":"Expired Discard • Damaged packaging written off to zero"}', '::1', '2026-11-03 07:36:14.595'),
  (103, 4, 3, 6, 'STOCK_TRANSFER', 'StockAdjustment', 9, '{"type":"transfer","medicineName":"Amoxicillin Test 1793691352068","batchNo":"AMX-352068","adjustedQuantity":20,"oldQuantity":50,"newQuantity":30,"reason":"Inter-Branch Stock Transfer • Restocking City Hospital counter","toBranchCode":"BE-02"}', '::1', '2026-11-03 07:36:26.098'),
  (104, 4, 3, 6, 'BATCH_CREATED', 'Batch', 40, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793691483120","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:38:14.565'),
  (105, 4, 3, 6, 'BATCH_CREATED', 'Batch', 41, '{"batchNo":"BATCH-CRITICAL-10D-1793691483120","medicineName":"Paracetamol Test 1793691483120","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:38:20.741'),
  (106, 4, 3, 6, 'BATCH_CREATED', 'Batch', 42, '{"batchNo":"BATCH-WARNING-60D-1793691483120","medicineName":"Paracetamol Test 1793691483120","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:38:23.683'),
  (107, 4, 3, 6, 'BATCH_CREATED', 'Batch', 43, '{"batchNo":"BATCH-EXPIRED-YEST-1793691483120","medicineName":"Paracetamol Test 1793691483120","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 07:38:26.625');
INSERT INTO "audit_logs" ("id", "store_id", "user_id", "branch_id", "action", "entity", "entity_id", "details", "ip_address", "created_at") VALUES
  (108, 4, 3, 6, 'BATCH_EDIT', 'Batch', 40, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 07:38:45.517'),
  (109, 4, 3, 6, 'BATCH_DELETED', 'Batch', 42, '{"batchNo":"BATCH-WARNING-60D-1793691483120","medicineId":44,"quantity":50}', '::1', '2026-11-03 07:38:52.353'),
  (110, 4, 3, 6, 'BATCH_CREATED', 'Batch', 44, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793693496452","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:11:50.940'),
  (111, 4, 3, 6, 'BATCH_CREATED', 'Batch', 45, '{"batchNo":"BATCH-CRITICAL-10D-1793693496452","medicineName":"Paracetamol Test 1793693496452","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:11:57.316'),
  (112, 4, 3, 6, 'BATCH_CREATED', 'Batch', 46, '{"batchNo":"BATCH-WARNING-60D-1793693496452","medicineName":"Paracetamol Test 1793693496452","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:12:00.286'),
  (113, 4, 3, 6, 'BATCH_CREATED', 'Batch', 47, '{"batchNo":"BATCH-EXPIRED-YEST-1793693496452","medicineName":"Paracetamol Test 1793693496452","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:12:03.599'),
  (114, 4, 3, 6, 'BATCH_EDIT', 'Batch', 44, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 08:12:21.599'),
  (115, 4, 3, 6, 'BATCH_DELETED', 'Batch', 46, '{"batchNo":"BATCH-WARNING-60D-1793693496452","medicineId":45,"quantity":50}', '::1', '2026-11-03 08:12:28.197'),
  (116, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 11, '{"type":"add","medicineName":"Amoxicillin Test 1793693610858","batchNo":"AMX-610858","adjustedQuantity":15,"oldQuantity":10,"newQuantity":25,"reason":"Physical Audit Variance • Found extra box in storage rack B-2"}', '::1', '2026-11-03 08:13:43.623'),
  (117, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 12, '{"type":"remove","medicineName":"Amoxicillin Test 1793693610858","batchNo":"AMX-610858","adjustedQuantity":5,"oldQuantity":25,"newQuantity":20,"reason":"Breakage/Spillage • Dropped 5 capsules during handling"}', '::1', '2026-11-03 08:13:52.055'),
  (118, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 13, '{"type":"remove","medicineName":"Amoxicillin Test 1793693610858","batchNo":"AMX-610858","adjustedQuantity":20,"oldQuantity":20,"newQuantity":0,"reason":"Expired Discard • Damaged packaging written off to zero"}', '::1', '2026-11-03 08:13:56.216'),
  (119, 4, 3, 6, 'STOCK_TRANSFER', 'StockAdjustment', 14, '{"type":"transfer","medicineName":"Amoxicillin Test 1793693610858","batchNo":"AMX-610858","adjustedQuantity":20,"oldQuantity":50,"newQuantity":30,"reason":"Inter-Branch Stock Transfer • Restocking City Hospital counter","toBranchCode":"BE-02"}', '::1', '2026-11-03 08:14:07.775'),
  (120, 4, 3, 6, 'BATCH_CREATED', 'Batch', 50, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793693798319","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:16:50.353'),
  (121, 4, 3, 6, 'BATCH_CREATED', 'Batch', 51, '{"batchNo":"BATCH-CRITICAL-10D-1793693798319","medicineName":"Paracetamol Test 1793693798319","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:16:57.949'),
  (122, 4, 3, 6, 'BATCH_CREATED', 'Batch', 52, '{"batchNo":"BATCH-WARNING-60D-1793693798319","medicineName":"Paracetamol Test 1793693798319","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:17:00.883'),
  (123, 4, 3, 6, 'BATCH_CREATED', 'Batch', 53, '{"batchNo":"BATCH-EXPIRED-YEST-1793693798319","medicineName":"Paracetamol Test 1793693798319","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:17:04.121'),
  (124, 4, 3, 6, 'BATCH_EDIT', 'Batch', 50, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 08:17:22.950'),
  (125, 4, 3, 6, 'BATCH_EDIT', 'Batch', 51, '{"batchNo":"BATCH-CRITICAL-10D-1793693798319","previousQty":25,"newQty":20,"previousMrp":60,"newMrp":60,"previousPurchasePrice":40,"newPurchasePrice":40}', '::1', '2026-11-03 08:17:31.936'),
  (126, 4, 3, 6, 'BATCH_DELETED', 'Batch', 52, '{"batchNo":"BATCH-WARNING-60D-1793693798319","medicineId":47,"quantity":50}', '::1', '2026-11-03 08:17:39.265'),
  (127, 4, 3, 6, 'BATCH_CREATED', 'Batch', 54, '{"batchNo":"BATCH-ZERO-TEST","medicineName":"Paracetamol Test 1793693898416","quantity":0,"mrp":120.5,"purchasePrice":0,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:18:29.224'),
  (128, 4, 3, 6, 'BATCH_CREATED', 'Batch', 55, '{"batchNo":"BATCH-CRITICAL-10D-1793693898416","medicineName":"Paracetamol Test 1793693898416","quantity":25,"mrp":60,"purchasePrice":40,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:18:36.677'),
  (129, 4, 3, 6, 'BATCH_CREATED', 'Batch', 56, '{"batchNo":"BATCH-WARNING-60D-1793693898416","medicineName":"Paracetamol Test 1793693898416","quantity":50,"mrp":55,"purchasePrice":35,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:18:39.643'),
  (130, 4, 3, 6, 'BATCH_CREATED', 'Batch', 57, '{"batchNo":"BATCH-EXPIRED-YEST-1793693898416","medicineName":"Paracetamol Test 1793693898416","quantity":15,"mrp":80,"purchasePrice":50,"expiryDate":{},"branchId":6}', '::1', '2026-11-03 08:18:42.923'),
  (131, 4, 3, 6, 'BATCH_EDIT', 'Batch', 54, '{"batchNo":"BATCH-ZERO-TEST","previousQty":0,"newQty":0,"previousMrp":120.5,"newMrp":145,"previousPurchasePrice":0,"newPurchasePrice":0}', '::1', '2026-11-03 08:18:59.166'),
  (133, 4, 3, 6, 'BATCH_EDIT', 'Batch', 55, '{"batchNo":"BATCH-CRITICAL-10D-1793693898416","previousQty":25,"newQty":20,"previousMrp":65,"newMrp":65,"previousPurchasePrice":40,"newPurchasePrice":40}', '::1', '2026-11-03 08:19:10.577'),
  (134, 4, 3, 6, 'BATCH_DELETED', 'Batch', 56, '{"batchNo":"BATCH-WARNING-60D-1793693898416","medicineId":48,"quantity":50}', '::1', '2026-11-03 08:19:17.086'),
  (132, 4, NULL, 6, 'BATCH_EDIT', 'Batch', 55, '{"batchNo":"BATCH-CRITICAL-10D-1793693898416","previousQty":25,"newQty":25,"previousMrp":60,"newMrp":65,"previousPurchasePrice":40,"newPurchasePrice":40}', '::1', '2026-11-03 08:19:07.031'),
  (135, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 18, '{"type":"add","medicineName":"Amoxicillin Test 1793694010011","batchNo":"AMX-010011","adjustedQuantity":15,"oldQuantity":10,"newQuantity":25,"reason":"Physical Audit Variance • Found extra box in storage rack B-2"}', '::1', '2026-11-03 08:20:22.074'),
  (136, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 19, '{"type":"remove","medicineName":"Amoxicillin Test 1793694010011","batchNo":"AMX-010011","adjustedQuantity":5,"oldQuantity":25,"newQuantity":20,"reason":"Breakage/Spillage • Dropped 5 capsules during handling"}', '::1', '2026-11-03 08:20:27.878'),
  (170, NULL, 3, 6, 'PO_STATUS_CHANGED', 'purchase_order', 5, '{"oldStatus":"pending","newStatus":"confirmed","poNumber":"PO-2026-00005"}', '127.0.0.1', '2026-11-06 08:41:49.989'),
  (137, 4, 3, 6, 'STOCK_ADJUSTMENT', 'StockAdjustment', 20, '{"type":"remove","medicineName":"Amoxicillin Test 1793694010011","batchNo":"AMX-010011","adjustedQuantity":20,"oldQuantity":20,"newQuantity":0,"reason":"Expired Discard • Damaged packaging written off to zero"}', '::1', '2026-11-03 08:20:31.378'),
  (138, 4, 3, 6, 'STOCK_TRANSFER', 'StockAdjustment', 21, '{"type":"transfer","medicineName":"Amoxicillin Test 1793694010011","batchNo":"AMX-010011","adjustedQuantity":20,"oldQuantity":50,"newQuantity":30,"reason":"Inter-Branch Stock Transfer • Restocking City Hospital counter","toBranchCode":"BE-02"}', '::1', '2026-11-03 08:20:40.811'),
  (139, 4, 3, NULL, 'LOGIN_SUCCESS', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-06 07:18:56.615'),
  (140, NULL, NULL, NULL, 'SUPPLIER_CREATED', 'supplier', 2, '{"name":"Medex Pharma Distributors 920701","phone":"989207011234","gstNo":"19ABCDE920701Z5","paymentTerms":30}', '127.0.0.1', '2026-11-06 07:42:08.313'),
  (141, NULL, NULL, NULL, 'SUPPLIER_UPDATED', 'supplier', 2, '{"old":{"name":"Medex Pharma Distributors 920701","phone":"989207011234","paymentTerms":30},"new":{"name":"Medex Pharma Distributors 920701","phone":"989207011234","paymentTerms":45}}', '127.0.0.1', '2026-11-06 07:42:13.010'),
  (142, NULL, NULL, NULL, 'SUPPLIER_CREATED', 'supplier', 3, '{"name":"Medex Pharma Distributors 994991","phone":"989949911234","gstNo":"19ABCDE994991Z5","paymentTerms":30}', '127.0.0.1', '2026-11-06 07:43:22.671'),
  (143, NULL, NULL, NULL, 'SUPPLIER_UPDATED', 'supplier', 3, '{"old":{"name":"Medex Pharma Distributors 994991","phone":"989949911234","paymentTerms":30},"new":{"name":"Medex Pharma Distributors 994991","phone":"989949911234","paymentTerms":45}}', '127.0.0.1', '2026-11-06 07:43:26.810'),
  (144, NULL, NULL, NULL, 'SUPPLIER_PAYMENT_RECORDED', 'supplier_payment', 1, '{"supplierId":3,"supplierName":"Medex Pharma Distributors 994991","amount":2500,"paymentMethod":"bank_transfer","referenceNo":"UTR-994991-8877"}', '127.0.0.1', '2026-11-06 07:43:39.772'),
  (145, NULL, NULL, NULL, 'SUPPLIER_PORTAL_USER_CREATED', 'supplier_user', 10, '{"supplierId":3,"supplierName":"Medex Pharma Distributors 994991","username":"sup_994991","email":"portal_994991@medexpharma.com"}', '127.0.0.1', '2026-11-06 07:43:46.828'),
  (146, NULL, NULL, NULL, 'SUPPLIER_PORTAL_USER_RESET', 'supplier_user', 10, '{"supplierId":3,"supplierName":"Medex Pharma Distributors 994991","username":"sup_994991","email":"portal_994991@medexpharma.com"}', '127.0.0.1', '2026-11-06 07:43:49.640'),
  (147, NULL, NULL, 6, 'PO_CREATED', 'purchase_order', 1, '{"poNumber":"PO-2026-00001","supplierName":"Medex Pharma Distributors 994991","total":{"s":1,"e":3,"d":[7550]},"itemCount":1,"status":"pending"}', '127.0.0.1', '2026-11-06 07:43:57.425'),
  (148, NULL, NULL, 6, 'PO_STATUS_CHANGED', 'purchase_order', 1, '{"oldStatus":"pending","newStatus":"confirmed","poNumber":"PO-2026-00001"}', '127.0.0.1', '2026-11-06 07:44:06.208'),
  (149, NULL, NULL, 6, 'PO_STATUS_CHANGED', 'purchase_order', 1, '{"oldStatus":"confirmed","newStatus":"shipped","poNumber":"PO-2026-00001"}', '127.0.0.1', '2026-11-06 07:44:10.424'),
  (150, NULL, NULL, 6, 'PO_REORDER_CLONED', 'purchase_order', 2, '{"clonedFrom":"PO-2026-00001","newPoNumber":"PO-2026-00002","supplierName":"Medex Pharma Distributors 994991"}', '127.0.0.1', '2026-11-06 07:44:50.527'),
  (151, NULL, NULL, 6, 'GRN_INWARD_COMPLETED', 'purchase_order', 1, '{"poNumber":"PO-2026-00001","invoiceNo":"CHALLAN-PART-994991","itemsInwarded":1,"isFullyReceived":false,"supplierName":"Medex Pharma Distributors 994991"}', '127.0.0.1', '2026-11-06 07:45:00.279'),
  (152, NULL, NULL, 6, 'GRN_INWARD_COMPLETED', 'purchase_order', 1, '{"poNumber":"PO-2026-00001","invoiceNo":"CHALLAN-FINAL-994991","itemsInwarded":1,"isFullyReceived":true,"supplierName":"Medex Pharma Distributors 994991"}', '127.0.0.1', '2026-11-06 07:45:09.677'),
  (153, NULL, 3, NULL, 'SUPPLIER_CREATED', 'supplier', 4, '{"name":"Medex Pharma Distributors 010307","phone":"980103071234","gstNo":"19ABCDE010307Z5","paymentTerms":30}', '127.0.0.1', '2026-11-06 08:00:19.199'),
  (154, NULL, 3, NULL, 'SUPPLIER_UPDATED', 'supplier', 4, '{"old":{"name":"Medex Pharma Distributors 010307","phone":"980103071234","paymentTerms":30},"new":{"name":"Medex Pharma Distributors 010307","phone":"980103071234","paymentTerms":45}}', '127.0.0.1', '2026-11-06 08:00:23.267'),
  (155, NULL, 3, NULL, 'SUPPLIER_PAYMENT_RECORDED', 'supplier_payment', 2, '{"supplierId":4,"supplierName":"Medex Pharma Distributors 010307","amount":2500,"paymentMethod":"bank_transfer","referenceNo":"UTR-010307-8877"}', '127.0.0.1', '2026-11-06 08:00:35.729'),
  (156, NULL, 3, NULL, 'SUPPLIER_PORTAL_USER_CREATED', 'supplier_user', 11, '{"supplierId":4,"supplierName":"Medex Pharma Distributors 010307","username":"sup_010307","email":"portal_010307@medexpharma.com"}', '127.0.0.1', '2026-11-06 08:00:43.064'),
  (157, NULL, 3, NULL, 'SUPPLIER_PORTAL_USER_RESET', 'supplier_user', 11, '{"supplierId":4,"supplierName":"Medex Pharma Distributors 010307","username":"sup_010307","email":"portal_010307@medexpharma.com"}', '127.0.0.1', '2026-11-06 08:00:45.779'),
  (158, NULL, 3, 6, 'PO_CREATED', 'purchase_order', 3, '{"poNumber":"PO-2026-00003","supplierName":"Medex Pharma Distributors 010307","total":{"s":1,"e":3,"d":[7550]},"itemCount":1,"status":"pending"}', '127.0.0.1', '2026-11-06 08:00:53.231'),
  (159, NULL, 3, 6, 'PO_STATUS_CHANGED', 'purchase_order', 3, '{"oldStatus":"pending","newStatus":"confirmed","poNumber":"PO-2026-00003"}', '127.0.0.1', '2026-11-06 08:01:02.232'),
  (160, NULL, 3, 6, 'PO_STATUS_CHANGED', 'purchase_order', 3, '{"oldStatus":"confirmed","newStatus":"shipped","poNumber":"PO-2026-00003"}', '127.0.0.1', '2026-11-06 08:01:06.261'),
  (161, NULL, 3, 6, 'PO_REORDER_CLONED', 'purchase_order', 4, '{"clonedFrom":"PO-2026-00003","newPoNumber":"PO-2026-00004","supplierName":"Medex Pharma Distributors 010307"}', '127.0.0.1', '2026-11-06 08:01:11.230'),
  (162, NULL, 3, 6, 'GRN_INWARD_COMPLETED', 'purchase_order', 3, '{"poNumber":"PO-2026-00003","invoiceNo":"CHALLAN-PART-010307","itemsInwarded":1,"isFullyReceived":false,"supplierName":"Medex Pharma Distributors 010307"}', '127.0.0.1', '2026-11-06 08:01:20.914'),
  (163, NULL, 3, 6, 'GRN_INWARD_COMPLETED', 'purchase_order', 3, '{"poNumber":"PO-2026-00003","invoiceNo":"CHALLAN-FINAL-010307","itemsInwarded":1,"isFullyReceived":true,"supplierName":"Medex Pharma Distributors 010307"}', '127.0.0.1', '2026-11-06 08:01:30.822'),
  (164, NULL, 3, NULL, 'SUPPLIER_CREATED', 'supplier', 5, '{"name":"Medex Pharma Distributors 454804","phone":"984548041234","gstNo":"19ABCDE454804Z5","paymentTerms":30}', '127.0.0.1', '2026-11-06 08:41:03.240'),
  (165, NULL, 3, NULL, 'SUPPLIER_UPDATED', 'supplier', 5, '{"old":{"name":"Medex Pharma Distributors 454804","phone":"984548041234","paymentTerms":30},"new":{"name":"Medex Pharma Distributors 454804","phone":"984548041234","paymentTerms":45}}', '127.0.0.1', '2026-11-06 08:41:07.636'),
  (166, NULL, 3, NULL, 'SUPPLIER_PAYMENT_RECORDED', 'supplier_payment', 3, '{"supplierId":5,"supplierName":"Medex Pharma Distributors 454804","amount":2500,"paymentMethod":"bank_transfer","referenceNo":"UTR-454804-8877"}', '127.0.0.1', '2026-11-06 08:41:20.737'),
  (167, NULL, 3, NULL, 'SUPPLIER_PORTAL_USER_CREATED', 'supplier_user', 12, '{"supplierId":5,"supplierName":"Medex Pharma Distributors 454804","username":"sup_454804","email":"portal_454804@medexpharma.com"}', '127.0.0.1', '2026-11-06 08:41:28.497'),
  (168, NULL, 3, NULL, 'SUPPLIER_PORTAL_USER_RESET', 'supplier_user', 12, '{"supplierId":5,"supplierName":"Medex Pharma Distributors 454804","username":"sup_454804","email":"portal_454804@medexpharma.com"}', '127.0.0.1', '2026-11-06 08:41:31.341'),
  (169, NULL, 3, 6, 'PO_CREATED', 'purchase_order', 5, '{"poNumber":"PO-2026-00005","supplierName":"Medex Pharma Distributors 454804","total":{"s":1,"e":3,"d":[7550]},"itemCount":1,"status":"pending"}', '127.0.0.1', '2026-11-06 08:41:39.195'),
  (171, NULL, 3, 6, 'PO_STATUS_CHANGED', 'purchase_order', 5, '{"oldStatus":"confirmed","newStatus":"shipped","poNumber":"PO-2026-00005"}', '127.0.0.1', '2026-11-06 08:41:54.231'),
  (172, NULL, 3, 6, 'PO_REORDER_CLONED', 'purchase_order', 6, '{"clonedFrom":"PO-2026-00005","newPoNumber":"PO-2026-00006","supplierName":"Medex Pharma Distributors 454804"}', '127.0.0.1', '2026-11-06 08:41:59.984'),
  (173, NULL, 3, 6, 'GRN_INWARD_COMPLETED', 'purchase_order', 5, '{"poNumber":"PO-2026-00005","invoiceNo":"CHALLAN-PART-454804","itemsInwarded":1,"isFullyReceived":false,"supplierName":"Medex Pharma Distributors 454804"}', '127.0.0.1', '2026-11-06 08:42:10.447'),
  (174, NULL, 3, 6, 'GRN_INWARD_COMPLETED', 'purchase_order', 5, '{"poNumber":"PO-2026-00005","invoiceNo":"CHALLAN-FINAL-454804","itemsInwarded":1,"isFullyReceived":true,"supplierName":"Medex Pharma Distributors 454804"}', '127.0.0.1', '2026-11-06 08:42:20.160'),
  (175, 4, 3, NULL, 'SCREEN_LOCKED', 'users', 3, '{"username":"jeetbasak54@gmail.com","reason":"auto_lock_2h_inactivity"}', '::1', '2026-11-06 09:20:58.742'),
  (176, NULL, 74, NULL, 'PO_CREATED', 'purchase_order', 7, '{"poNumber":"PO-2026-00007","supplierName":"Test Pharma Logistics 886175","total":{"s":1,"e":3,"d":[1100]},"itemCount":2,"status":"pending"}', '127.0.0.1', '2026-11-06 09:27:52.215'),
  (177, NULL, NULL, NULL, 'SUPPLIER_PRICE_UPDATED', 'purchase_order', 7, '{"poNumber":"PO-2026-00007","supplierName":"Test Pharma Logistics 886175","newTotal":{"s":1,"e":3,"d":[1260]},"status":"price_updated"}', '127.0.0.1', '2026-11-06 09:28:03.865'),
  (178, NULL, 74, NULL, 'PO_STATUS_CHANGED', 'purchase_order', 7, '{"oldStatus":"price_updated","newStatus":"confirmed","poNumber":"PO-2026-00007"}', '127.0.0.1', '2026-11-06 09:28:09.219'),
  (179, NULL, 74, NULL, 'PO_REORDER_CLONED', 'purchase_order', 8, '{"clonedFrom":"PO-2026-00007","newPoNumber":"PO-2026-00008","supplierName":"Test Pharma Logistics 886175"}', '127.0.0.1', '2026-11-06 09:28:17.106'),
  (180, NULL, 74, NULL, 'PO_CANCELLED', 'purchase_order', 8, '{"oldStatus":"pending","newStatus":"cancelled","poNumber":"PO-2026-00008"}', '127.0.0.1', '2026-11-06 09:28:20.876'),
  (181, NULL, 74, NULL, 'GRN_INWARD_COMPLETED', 'purchase_order', 7, '{"poNumber":"PO-2026-00007","invoiceNo":"INV-VEND-886175","itemsInwarded":2,"isFullyReceived":true,"supplierName":"Test Pharma Logistics 886175"}', '127.0.0.1', '2026-11-06 09:28:31.320'),
  (182, NULL, 74, NULL, 'DAILY_STOCK_ALERT_SENT', 'inventory', NULL, '{"recipient":"admin_po_886175@example.com","lowStockCount":2,"expiringCount":8,"emailSuccess":true}', '127.0.0.1', '2026-11-06 09:28:39.224'),
  (183, NULL, 74, NULL, 'CUSTOMER_CREATED', 'customer', 10, '{"name":"Ramesh Sen 886175","phone":"9876886175","isChronic":true,"creditLimit":{"s":1,"e":3,"d":[3000]}}', '127.0.0.1', '2026-11-06 09:28:42.363'),
  (184, NULL, 74, NULL, 'CUSTOMERS_EXPORTED_CSV', 'customer', NULL, '{"rowCount":1,"filename":"customers-directory-2026-11-06.csv"}', '127.0.0.1', '2026-11-06 09:28:45.521'),
  (185, NULL, 74, NULL, 'REFILL_REMINDER_SENT', 'customer', 10, '{"customerName":"Ramesh Sen 886175","channel":"email","phone":"9876886175","email":"ramesh_886175@patient.test","advanceCycle":true}', '127.0.0.1', '2026-11-06 09:28:53.570'),
  (186, NULL, 74, NULL, 'PO_CREATED', 'purchase_order', 9, '{"poNumber":"PO-2026-00009","supplierName":"Test Pharma Logistics 190838","total":{"s":1,"e":3,"d":[1100]},"itemCount":2,"status":"pending"}', '127.0.0.1', '2026-11-06 09:30:11.733'),
  (187, NULL, NULL, NULL, 'SUPPLIER_PRICE_UPDATED', 'purchase_order', 9, '{"poNumber":"PO-2026-00009","supplierName":"Test Pharma Logistics 190838","newTotal":{"s":1,"e":3,"d":[1260]},"status":"price_updated"}', '127.0.0.1', '2026-11-06 09:30:22.640'),
  (188, NULL, 74, NULL, 'PO_STATUS_CHANGED', 'purchase_order', 9, '{"oldStatus":"price_updated","newStatus":"confirmed","poNumber":"PO-2026-00009"}', '127.0.0.1', '2026-11-06 09:31:36.568'),
  (189, NULL, 74, NULL, 'PO_REORDER_CLONED', 'purchase_order', 10, '{"clonedFrom":"PO-2026-00009","newPoNumber":"PO-2026-00010","supplierName":"Test Pharma Logistics 190838"}', '127.0.0.1', '2026-11-06 09:31:44.564'),
  (190, NULL, 74, NULL, 'PO_CANCELLED', 'purchase_order', 10, '{"oldStatus":"pending","newStatus":"cancelled","poNumber":"PO-2026-00010"}', '127.0.0.1', '2026-11-06 09:31:49.274'),
  (191, NULL, 74, NULL, 'GRN_INWARD_COMPLETED', 'purchase_order', 9, '{"poNumber":"PO-2026-00009","invoiceNo":"INV-VEND-190838","itemsInwarded":2,"isFullyReceived":true,"supplierName":"Test Pharma Logistics 190838"}', '127.0.0.1', '2026-11-06 09:31:59.716'),
  (192, NULL, 74, NULL, 'DAILY_STOCK_ALERT_SENT', 'inventory', NULL, '{"recipient":"admin_po_886175@example.com","lowStockCount":2,"expiringCount":8,"emailSuccess":true}', '127.0.0.1', '2026-11-06 09:32:06.257'),
  (193, NULL, 74, NULL, 'CUSTOMER_CREATED', 'customer', 11, '{"name":"Ramesh Sen 190838","phone":"9876190838","isChronic":true,"creditLimit":{"s":1,"e":3,"d":[3000]}}', '127.0.0.1', '2026-11-06 09:32:09.856'),
  (194, NULL, 74, NULL, 'PO_CREATED', 'purchase_order', 11, '{"poNumber":"PO-2026-00011","supplierName":"Test Pharma Logistics 613747","total":{"s":1,"e":3,"d":[1100]},"itemCount":2,"status":"pending"}', '127.0.0.1', '2026-11-06 10:12:48.967'),
  (195, NULL, NULL, NULL, 'SUPPLIER_PRICE_UPDATED', 'purchase_order', 11, '{"poNumber":"PO-2026-00011","supplierName":"Test Pharma Logistics 613747","newTotal":{"s":1,"e":3,"d":[1260]},"status":"price_updated"}', '127.0.0.1', '2026-11-06 10:12:59.967'),
  (196, NULL, 74, NULL, 'PO_STATUS_CHANGED', 'purchase_order', 11, '{"oldStatus":"price_updated","newStatus":"confirmed","poNumber":"PO-2026-00011"}', '127.0.0.1', '2026-11-06 10:13:05.416'),
  (197, NULL, 74, NULL, 'PO_CREATED', 'purchase_order', 12, '{"poNumber":"PO-2026-00012","supplierName":"Test Pharma Logistics 341721","total":{"s":1,"e":3,"d":[1100]},"itemCount":2,"status":"pending"}', '127.0.0.1', '2026-11-06 12:26:19.885'),
  (198, NULL, NULL, NULL, 'SUPPLIER_PRICE_UPDATED', 'purchase_order', 12, '{"poNumber":"PO-2026-00012","supplierName":"Test Pharma Logistics 341721","newTotal":{"s":1,"e":3,"d":[1260]},"status":"price_updated"}', '127.0.0.1', '2026-11-06 12:26:34.152'),
  (199, NULL, 74, NULL, 'PO_STATUS_CHANGED', 'purchase_order', 12, '{"oldStatus":"price_updated","newStatus":"confirmed","poNumber":"PO-2026-00012"}', '127.0.0.1', '2026-11-06 12:26:48.256'),
  (200, NULL, 74, NULL, 'PO_REORDER_CLONED', 'purchase_order', 13, '{"clonedFrom":"PO-2026-00012","newPoNumber":"PO-2026-00013","supplierName":"Test Pharma Logistics 341721"}', '127.0.0.1', '2026-11-06 12:27:07.694'),
  (201, NULL, 74, NULL, 'PO_CANCELLED', 'purchase_order', 13, '{"oldStatus":"pending","newStatus":"cancelled","poNumber":"PO-2026-00013"}', '127.0.0.1', '2026-11-06 12:27:17.570'),
  (202, NULL, 74, NULL, 'GRN_INWARD_COMPLETED', 'purchase_order', 12, '{"poNumber":"PO-2026-00012","invoiceNo":"INV-VEND-341721","itemsInwarded":2,"isFullyReceived":true,"supplierName":"Test Pharma Logistics 341721"}', '127.0.0.1', '2026-11-06 12:27:36.019'),
  (203, NULL, 74, NULL, 'DAILY_STOCK_ALERT_SENT', 'inventory', NULL, '{"recipient":"admin_po_886175@example.com","lowStockCount":4,"expiringCount":8,"emailSuccess":true}', '127.0.0.1', '2026-11-06 12:27:50.549'),
  (204, NULL, 74, NULL, 'CUSTOMER_CREATED', 'customer', 12, '{"name":"Ramesh Sen 341721","phone":"9876341721","isChronic":true,"creditLimit":{"s":1,"e":3,"d":[3000]}}', '127.0.0.1', '2026-11-06 12:28:01.971'),
  (205, NULL, 74, NULL, 'CUSTOMERS_EXPORTED_CSV', 'customer', NULL, '{"rowCount":3,"filename":"customers-directory-2026-11-06.csv"}', '127.0.0.1', '2026-11-06 12:28:11.424'),
  (206, NULL, 74, NULL, 'REFILL_REMINDER_SENT', 'customer', 12, '{"customerName":"Ramesh Sen 341721","channel":"email","phone":"9876341721","email":"ramesh_341721@patient.test","advanceCycle":true}', '127.0.0.1', '2026-11-06 12:28:30.341'),
  (207, NULL, 74, NULL, 'CUSTOMER_CREDIT_SETTLED', 'customer_payment', 1, '{"customerId":12,"customerName":"Ramesh Sen 341721","amount":50,"paymentMethod":"upi","referenceNo":"UPI-SETTLE-341721"}', '127.0.0.1', '2026-11-06 12:29:01.539');
INSERT INTO "audit_logs" ("id", "store_id", "user_id", "branch_id", "action", "entity", "entity_id", "details", "ip_address", "created_at") VALUES
  (208, NULL, 74, NULL, 'PO_CREATED', 'purchase_order', 14, '{"poNumber":"PO-2026-00014","supplierName":"Test Pharma Logistics 254584","total":{"s":1,"e":3,"d":[1100]},"itemCount":2,"status":"pending"}', '127.0.0.1', '2026-11-06 12:30:39.440'),
  (209, NULL, NULL, NULL, 'SUPPLIER_PRICE_UPDATED', 'purchase_order', 14, '{"poNumber":"PO-2026-00014","supplierName":"Test Pharma Logistics 254584","newTotal":{"s":1,"e":3,"d":[1260]},"status":"price_updated"}', '127.0.0.1', '2026-11-06 12:30:56.159'),
  (210, NULL, 74, NULL, 'PO_STATUS_CHANGED', 'purchase_order', 14, '{"oldStatus":"price_updated","newStatus":"confirmed","poNumber":"PO-2026-00014"}', '127.0.0.1', '2026-11-06 12:31:10.268'),
  (211, NULL, 74, NULL, 'PO_REORDER_CLONED', 'purchase_order', 15, '{"clonedFrom":"PO-2026-00014","newPoNumber":"PO-2026-00015","supplierName":"Test Pharma Logistics 254584"}', '127.0.0.1', '2026-11-06 12:31:29.475'),
  (212, NULL, 74, NULL, 'PO_CANCELLED', 'purchase_order', 15, '{"oldStatus":"pending","newStatus":"cancelled","poNumber":"PO-2026-00015"}', '127.0.0.1', '2026-11-06 12:31:40.216'),
  (213, NULL, 74, NULL, 'GRN_INWARD_COMPLETED', 'purchase_order', 14, '{"poNumber":"PO-2026-00014","invoiceNo":"INV-VEND-254584","itemsInwarded":2,"isFullyReceived":true,"supplierName":"Test Pharma Logistics 254584"}', '127.0.0.1', '2026-11-06 12:32:00.176'),
  (214, NULL, 74, NULL, 'DAILY_STOCK_ALERT_SENT', 'inventory', NULL, '{"recipient":"admin_po_886175@example.com","lowStockCount":4,"expiringCount":8,"emailSuccess":true}', '127.0.0.1', '2026-11-06 12:32:15.700'),
  (215, NULL, 74, NULL, 'CUSTOMER_CREATED', 'customer', 13, '{"name":"Ramesh Sen 254584","phone":"9876254584","isChronic":true,"creditLimit":{"s":1,"e":3,"d":[3000]}}', '127.0.0.1', '2026-11-06 12:32:28.219'),
  (216, NULL, 74, NULL, 'CUSTOMERS_EXPORTED_CSV', 'customer', NULL, '{"rowCount":4,"filename":"customers-directory-2026-11-06.csv"}', '127.0.0.1', '2026-11-06 12:32:39.502'),
  (217, NULL, 74, NULL, 'REFILL_REMINDER_SENT', 'customer', 13, '{"customerName":"Ramesh Sen 254584","channel":"email","phone":"9876254584","email":"ramesh_254584@patient.test","advanceCycle":true}', '127.0.0.1', '2026-11-06 12:33:01.397'),
  (218, NULL, 74, NULL, 'CUSTOMER_CREDIT_SETTLED', 'customer_payment', 2, '{"customerId":13,"customerName":"Ramesh Sen 254584","amount":50,"paymentMethod":"upi","referenceNo":"UPI-SETTLE-254584"}', '127.0.0.1', '2026-11-06 12:33:35.335'),
  (219, 4, 3, NULL, 'LOGIN_SUCCESS', 'users', 3, '{"username":"jeetbasak54@gmail.com","role":"admin","branchId":null,"branchCode":"ALL"}', '::1', '2026-11-06 12:38:22.567'),
  (220, NULL, 74, NULL, 'DATABASE_BACKUP_EXPORTED', 'database_backup', NULL, '{"filename":"medical_pos_backup_2026-11-06_13-09-56.sql","totalRows":371,"totalTables":24,"tableStats":{"settings":2,"branches":2,"categories":20,"suppliers":10,"customers":4,"users":6,"supplier_users":8,"medicines":18,"batches":22,"purchase_orders":15,"po_items":24,"sales":2,"sales_items":2,"returns":0,"return_items":0,"discounts":0,"stock_adjustments":17,"supplier_payments":3,"customer_payments":2,"customer_purchase_log":2,"login_attempts":0,"audit_logs":212,"supplier_messages":0,"patient_messages":0}}', '127.0.0.1', '2026-11-06 13:10:35.459'),
  (221, NULL, 74, NULL, 'DATABASE_BACKUP_EXPORTED', 'database_backup', NULL, '{"filename":"medical_pos_backup_2026-11-06_13-10-38.sql","totalRows":372,"totalTables":24,"tableStats":{"settings":2,"branches":2,"categories":20,"suppliers":10,"customers":4,"users":6,"supplier_users":8,"medicines":18,"batches":22,"purchase_orders":15,"po_items":24,"sales":2,"sales_items":2,"returns":0,"return_items":0,"discounts":0,"stock_adjustments":17,"supplier_payments":3,"customer_payments":2,"customer_purchase_log":2,"login_attempts":0,"audit_logs":213,"supplier_messages":0,"patient_messages":0}}', '127.0.0.1', '2026-11-06 13:11:16.733'),
  (222, NULL, 74, NULL, 'DATABASE_RESTORED', 'database', NULL, '{"statementsExecuted":1,"tablesAffected":["categories"],"timestamp":"2026-11-06T13:11:33.123Z"}', '127.0.0.1', '2026-11-06 13:11:33.124'),
  (223, NULL, 74, NULL, 'DATABASE_RESTORED', 'database', NULL, '{"statementsExecuted":1,"tablesAffected":["categories"],"timestamp":"2026-11-06T13:11:40.875Z"}', '127.0.0.1', '2026-11-06 13:11:40.876'),
  (224, NULL, 74, NULL, 'STORAGE_MIGRATED_JSON', 'storage_migration', NULL, '{"counts":{"categories":1,"suppliers":1,"customers":1,"medicines":1,"batches":1},"backupFile":"legacy_migration_2026-11-06_13-11-43.json","timestamp":"2026-11-06T13:11:43.969Z"}', '127.0.0.1', '2026-11-06 13:11:52.058'),
  (225, NULL, 74, NULL, 'SOFTWARE_UPDATE_INSPECTED', 'system_update', NULL, '{"currentVersion":"0.1.0","newVersion":"2.0.0","totalFiles":1,"isUpgrade":true,"packageName":"evil_update.zip"}', '127.0.0.1', '2026-11-06 13:11:59.205'),
  (226, NULL, 74, NULL, 'SOFTWARE_UPDATE_INSPECTED', 'system_update', NULL, '{"currentVersion":"0.1.0","newVersion":"1.1.0","totalFiles":1,"isUpgrade":true,"packageName":"valid_update_1.1.0.zip"}', '127.0.0.1', '2026-11-06 13:12:03.860'),
  (227, NULL, 74, NULL, 'SOFTWARE_UPDATE_APPLIED', 'system_update', NULL, '{"previousVersion":"0.1.0","newVersion":"1.1.0","filesUpdated":1,"rollbackSnapshotDir":"/Users/pranab/workspace/medical_pos/.backups/pre_update_1.1.0_2026-11-06_13-12-46","timestamp":"2026-11-06T13:12:46.644Z"}', '127.0.0.1', '2026-11-06 13:12:46.645'),
  (228, NULL, 74, NULL, 'DATABASE_BACKUP_EXPORTED', 'database_backup', NULL, '{"filename":"medical_pos_backup_2026-11-06_13-13-07.sql","totalRows":383,"totalTables":24,"tableStats":{"settings":2,"branches":2,"categories":20,"suppliers":11,"customers":5,"users":6,"supplier_users":8,"medicines":19,"batches":23,"purchase_orders":15,"po_items":24,"sales":2,"sales_items":2,"returns":0,"return_items":0,"discounts":0,"stock_adjustments":17,"supplier_payments":3,"customer_payments":2,"customer_purchase_log":2,"login_attempts":0,"audit_logs":220,"supplier_messages":0,"patient_messages":0}}', '127.0.0.1', '2026-11-06 13:13:46.436'),
  (229, NULL, 74, NULL, 'DATABASE_BACKUP_EXPORTED', 'database_backup', NULL, '{"filename":"medical_pos_backup_2026-11-06_13-13-49.sql","totalRows":384,"totalTables":24,"tableStats":{"settings":2,"branches":2,"categories":20,"suppliers":11,"customers":5,"users":6,"supplier_users":8,"medicines":19,"batches":23,"purchase_orders":15,"po_items":24,"sales":2,"sales_items":2,"returns":0,"return_items":0,"discounts":0,"stock_adjustments":17,"supplier_payments":3,"customer_payments":2,"customer_purchase_log":2,"login_attempts":0,"audit_logs":221,"supplier_messages":0,"patient_messages":0}}', '127.0.0.1', '2026-11-06 13:14:28.132'),
  (230, NULL, 74, NULL, 'DATABASE_RESTORED', 'database', NULL, '{"statementsExecuted":1,"tablesAffected":["categories"],"timestamp":"2026-11-06T13:14:44.107Z"}', '127.0.0.1', '2026-11-06 13:14:44.108'),
  (231, NULL, 74, NULL, 'DATABASE_RESTORED', 'database', NULL, '{"statementsExecuted":1,"tablesAffected":["categories"],"timestamp":"2026-11-06T13:14:51.939Z"}', '127.0.0.1', '2026-11-06 13:14:51.940'),
  (232, NULL, 74, NULL, 'STORAGE_MIGRATED_JSON', 'storage_migration', NULL, '{"counts":{"categories":1,"suppliers":1,"customers":0,"medicines":1,"batches":1},"backupFile":"legacy_migration_2026-11-06_13-14-55.json","timestamp":"2026-11-06T13:14:55.081Z"}', '127.0.0.1', '2026-11-06 13:15:01.360'),
  (233, NULL, 74, NULL, 'SOFTWARE_UPDATE_INSPECTED', 'system_update', NULL, '{"currentVersion":"0.1.0","newVersion":"1.1.0","totalFiles":1,"isUpgrade":true,"packageName":"valid_update_1.1.0.zip"}', '127.0.0.1', '2026-11-06 13:15:12.127'),
  (234, NULL, 74, NULL, 'SOFTWARE_UPDATE_APPLIED', 'system_update', NULL, '{"previousVersion":"0.1.0","newVersion":"1.1.0","filesUpdated":1,"rollbackSnapshotDir":"/Users/pranab/workspace/medical_pos/.backups/pre_update_1.1.0_2026-11-06_13-15-55","timestamp":"2026-11-06T13:15:55.287Z"}', '127.0.0.1', '2026-11-06 13:15:55.288'),
  (235, NULL, 74, NULL, 'DATABASE_BACKUP_EXPORTED', 'database_backup', NULL, '{"filename":"medical_pos_backup_2026-11-06_13-17-58.sql","totalRows":390,"totalTables":24,"tableStats":{"settings":2,"branches":2,"categories":20,"suppliers":11,"customers":5,"users":6,"supplier_users":8,"medicines":19,"batches":23,"purchase_orders":15,"po_items":24,"sales":2,"sales_items":2,"returns":0,"return_items":0,"discounts":0,"stock_adjustments":17,"supplier_payments":3,"customer_payments":2,"customer_purchase_log":2,"login_attempts":0,"audit_logs":227,"supplier_messages":0,"patient_messages":0}}', '127.0.0.1', '2026-11-06 13:18:37.840'),
  (236, NULL, 74, NULL, 'DATABASE_BACKUP_EXPORTED', 'database_backup', NULL, '{"filename":"medical_pos_backup_2026-11-06_13-18-41.sql","totalRows":391,"totalTables":24,"tableStats":{"settings":2,"branches":2,"categories":20,"suppliers":11,"customers":5,"users":6,"supplier_users":8,"medicines":19,"batches":23,"purchase_orders":15,"po_items":24,"sales":2,"sales_items":2,"returns":0,"return_items":0,"discounts":0,"stock_adjustments":17,"supplier_payments":3,"customer_payments":2,"customer_purchase_log":2,"login_attempts":0,"audit_logs":228,"supplier_messages":0,"patient_messages":0}}', '127.0.0.1', '2026-11-06 13:19:19.327'),
  (237, NULL, 74, NULL, 'DATABASE_RESTORED', 'database', NULL, '{"statementsExecuted":1,"tablesAffected":["categories"],"timestamp":"2026-11-06T13:19:35.797Z"}', '127.0.0.1', '2026-11-06 13:19:35.798'),
  (238, NULL, 74, NULL, 'DATABASE_RESTORED', 'database', NULL, '{"statementsExecuted":1,"tablesAffected":["categories"],"timestamp":"2026-11-06T13:19:43.892Z"}', '127.0.0.1', '2026-11-06 13:19:43.893'),
  (239, NULL, 74, NULL, 'STORAGE_MIGRATED_JSON', 'storage_migration', NULL, '{"counts":{"categories":1,"suppliers":1,"customers":1,"medicines":1,"batches":1},"backupFile":"legacy_migration_2026-11-06_13-19-47.json","timestamp":"2026-11-06T13:19:47.050Z"}', '127.0.0.1', '2026-11-06 13:19:54.212'),
  (240, NULL, 74, NULL, 'SOFTWARE_UPDATE_INSPECTED', 'system_update', NULL, '{"currentVersion":"0.1.0","newVersion":"1.1.0","totalFiles":1,"isUpgrade":true,"packageName":"valid_update_1.1.0.zip"}', '127.0.0.1', '2026-11-06 13:20:04.568');

-- ----------------------------------------------------------------------------
-- Table: supplier_messages (0 rows)
-- ----------------------------------------------------------------------------
-- No data for supplier_messages

-- ----------------------------------------------------------------------------
-- Table: patient_messages (0 rows)
-- ----------------------------------------------------------------------------
-- No data for patient_messages

-- ============================================================================
-- Backup Complete: 24 tables, 399 total rows.
-- ============================================================================
