-- ============================================================
-- Migration 007: Data migration from Supabase → Railway
-- Generated: 2026-04-19
-- Tables: users (18), user_ai_limits (18), app_settings (3)
-- Intelligence data migrated via Supabase SDK at runtime
-- ============================================================

-- Step 1: Seed users (from Supabase auth.users)
-- These users existed in Supabase Auth. Password is set to LEGACY_RESET_REQUIRED
-- meaning they must use "forgot password" to set a new spine password.
-- ghazi@aynn.io and ghazi.aldhyaei@gmail.com get is_admin = true.

INSERT INTO users (id, email, first_name, last_name, password_hash, is_admin, is_active, created_at, updated_at)
VALUES
  ('d2ceaad6-af0d-4001-a739-6b57f040e404', 'crossmint7@gmail.com',         '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-08-28 08:11:54+00', NOW()),
  ('1eb04a90-96b4-44ac-b642-3812d07527dd', 'sara.alsaa9@gmail.com',         '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-08-29 05:47:04+00', NOW()),
  ('592083ab-6d31-473c-834a-1c18fef2ddab', 'r.aldhyaei@gmail.com',          '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-08-31 16:06:42+00', NOW()),
  ('5c2e5c61-e295-48fe-98d8-c604577eb0d1', 'almahjari66@gmail.com',         '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-09-01 09:03:23+00', NOW()),
  ('2dfc7205-7354-49c9-b26f-e5a9dd578239', 'zeze2.2o0o@gmail.com',          '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-09-23 19:42:53+00', NOW()),
  ('cf5f4735-8790-4e91-8d18-67be1f616f65', 'rzan.aldhyaei@gmail.com',       '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-09-23 19:49:52+00', NOW()),
  ('4b2a6944-59dd-4cd3-a694-bb1b5ec7f2a8', 'crypters.x.space@gmail.com',    '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-12-09 10:41:06+00', NOW()),
  ('74d6614d-27e7-4a78-96c1-31787efe86b6', 'hoolet.x@gmail.com',            '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-12-09 12:25:18+00', NOW()),
  ('5f474989-d300-436b-b082-a4f90d8352c5', 'nocapnft12@gmail.com',          '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-12-13 15:21:55+00', NOW()),
  ('3451ae77-614a-41af-8225-fbda689f2e35', 'hameed.alhaj@outlook.com',      '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-12-14 16:33:56+00', NOW()),
  ('bd90809f-7bd9-46a8-acff-1d83de4392ff', 'melaskari.mba2025@ivey.ca',     '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-12-14 18:20:45+00', NOW()),
  ('146fe105-c4e3-4212-8d82-96c4d9d4de35', 'ghazi.aldhyaei@hotmail.com',    '', '', 'LEGACY_RESET_REQUIRED', false, true, '2025-12-22 20:15:47+00', NOW()),
  ('3d0cfc1e-5871-4173-96f8-0545e02a59b1', 'test-user@aynn.io',             '', '', 'LEGACY_RESET_REQUIRED', false, true, '2026-01-21 00:08:43+00', NOW()),
  ('8bc1e5e4-fa2c-47d7-a836-405075e13051', 'test-admin@aynn.io',            '', '', 'LEGACY_RESET_REQUIRED', true,  true, '2026-01-21 00:08:43+00', NOW()),
  ('bf4db4d1-a3ba-45b7-8636-6ae821cb2bb9', 'koraygulchina@live.com',        '', '', 'LEGACY_RESET_REQUIRED', false, true, '2026-02-17 14:30:41+00', NOW()),
  ('2efaff93-0d4f-4567-9c07-a404ddc5c23a', 'crosssun010@gmail.com',         '', '', 'LEGACY_RESET_REQUIRED', false, true, '2026-02-24 13:37:06+00', NOW()),
  ('ea60a912-05bb-4a63-a311-db02e04089b5', 'ghazi.aldhyaei@gmail.com',      '', '', 'LEGACY_RESET_REQUIRED', true,  true, '2026-03-17 19:46:19+00', NOW()),
  ('1d5aef56-4c7e-4880-a41c-3f6e29ced2be', 'ghazi@aynn.io',                 '', '', 'LEGACY_RESET_REQUIRED', true,  true, '2026-03-24 05:29:17+00', NOW())
ON CONFLICT (id) DO UPDATE SET
  email      = EXCLUDED.email,
  is_admin   = EXCLUDED.is_admin,
  updated_at = NOW();


-- Step 2: Seed user_ai_limits (18 rows from Supabase)

INSERT INTO user_ai_limits (
  id, user_id,
  daily_messages, daily_engineering, daily_search, daily_files,
  monthly_cost_limit_sar,
  current_daily_messages, current_daily_engineering, current_daily_search, current_daily_files,
  current_month_cost_sar,
  daily_reset_at, monthly_reset_at,
  is_unlimited,
  monthly_messages, current_monthly_messages,
  monthly_engineering, current_monthly_engineering,
  bonus_credits,
  created_at, updated_at
)
VALUES
  ('6d6b402c-b4c2-4a54-a354-4525b2b1a294','d2ceaad6-af0d-4001-a739-6b57f040e404', 999999,1,5,3, 10.00, 14,0,0,0, 0.00, '2026-04-02 08:55:47+00','2026-05-01 08:55:47+00', true,  999999,14,  9999,0, 0, '2025-12-28 20:38:39+00','2026-04-16 05:47:57+00'),
  ('ea773b45-4a8e-4aa7-99ef-4dcc9e195ca8','bd90809f-7bd9-46a8-acff-1d83de4392ff', 999999,3,5,3, 10.00,  5,0,0,0, 0.00, '2026-03-26 03:28:54+00','2026-04-25 03:28:54+00', true,  999999, 5,  9999,0,10, '2026-01-17 02:56:58+00','2026-04-11 15:31:25+00'),
  ('24e0f881-d83e-4a1c-8ee6-1d8f4cbf91cd','cf5f4735-8790-4e91-8d18-67be1f616f65',      5,1,5,3, 10.00,  5,0,0,0, 0.00, '2026-03-18 22:03:08+00','2026-02-26 18:23:25+00', false,     5,10,     1,0, 0, '2026-01-26 18:23:25+00','2026-04-19 13:13:43+00'),
  ('5b0df3bb-c510-44cf-800a-56dae35eb66f','4b2a6944-59dd-4cd3-a694-bb1b5ec7f2a8', 999999,3,5,3, 10.00,  4,0,0,0, 0.00, '2026-04-05 11:00:13+00','2026-05-01 09:50:24+00', true,  999999,21,  9999,0, 5, '2026-01-26 19:14:08+00','2026-04-16 14:39:38+00'),
  ('21772593-b1b5-49d7-9a98-49ce7b43b253','74d6614d-27e7-4a78-96c1-31787efe86b6',      5,1,5,3, 10.00,  1,0,0,0, 0.00, '2026-01-27 19:15:47+00','2026-02-26 19:15:47+00', false,     5, 0,     1,0, 0, '2026-01-26 19:15:47+00','2026-04-11 12:07:44+00'),
  ('af44e163-f29b-4df0-8a64-e528c775b863','1eb04a90-96b4-44ac-b642-3812d07527dd',      5,1,5,3, 10.00,  2,0,0,0, 0.00, '2026-03-13 21:12:44+00','2026-04-12 21:12:44+00', false,     0, 2,    10,0, 5, '2026-01-29 12:55:12+00','2026-04-06 11:46:03+00'),
  ('7a3d58cd-4c33-4f3f-b272-728948aca206','3451ae77-614a-41af-8225-fbda689f2e35',      5,1,5,3, 10.00,  4,0,0,0, 0.00, '2026-02-17 11:06:06+00','2026-03-16 11:06:06+00', false,     0, 4,    10,0, 0, '2026-02-16 11:06:06+00','2026-04-06 11:46:03+00'),
  ('51d22809-e575-492e-a30a-9cb7cc84e078','bf4db4d1-a3ba-45b7-8636-6ae821cb2bb9', 999999,1,5,3, 10.00,  3,1,0,0, 0.00, '2026-02-18 14:34:03+00','2026-03-17 14:34:03+00', true,  999999, 3,  9999,1, 0, '2026-02-17 14:34:03+00','2026-04-06 11:46:03+00'),
  ('9000d930-4810-4500-a537-d9c5b7a9813e','146fe105-c4e3-4212-8d82-96c4d9d4de35',      5,1,5,3, 10.00,  0,0,0,0, 0.00, '2026-04-10 07:30:42+00','2026-03-18 20:57:56+00', false,     5, 7,     1,0, 3, '2026-02-18 20:57:56+00','2026-04-09 07:32:26+00'),
  ('d765d2ce-3b59-41f5-8f4d-2e2a6b33f1a0','8bc1e5e4-fa2c-47d7-a836-405075e13051',      5,3,5,3, 10.00,  0,0,0,0, 0.00, '2026-02-19 20:57:56+00','2026-03-18 20:57:56+00', false,     0, 0,    10,0, 0, '2026-02-18 20:57:56+00','2026-04-06 11:46:03+00'),
  ('01c26c6c-cd51-4138-ae73-64b1c77e3545','3d0cfc1e-5871-4173-96f8-0545e02a59b1',      5,1,5,3, 10.00,  5,0,0,0, 0.00, '2026-03-19 03:06:23+00','2026-03-18 20:57:56+00', false,     0, 5,     1,0, 0, '2026-02-18 20:57:56+00','2026-04-06 11:46:03+00'),
  ('5c2b324d-2808-40ad-9426-d942635d7d1e','2dfc7205-7354-49c9-b26f-e5a9dd578239',      5,3,5,3, 10.00,  0,0,0,0, 0.00, '2026-02-19 20:57:56+00','2026-03-18 20:57:56+00', false,     0, 0,    10,0, 0, '2026-02-18 20:57:56+00','2026-04-06 11:46:03+00'),
  ('ff5f33f7-0490-4395-b8b6-a05d48f68e6a','5f474989-d300-436b-b082-a4f90d8352c5',      5,3,5,3, 10.00,  0,0,0,0, 0.00, '2026-02-19 20:57:56+00','2026-03-18 20:57:56+00', false,     0, 0,    10,0, 0, '2026-02-18 20:57:56+00','2026-04-06 11:46:03+00'),
  ('b11c42af-0bbb-4ca7-8977-2daab72ad521','592083ab-6d31-473c-834a-1c18fef2ddab',      5,3,5,3, 10.00,  0,0,0,0, 0.00, '2026-02-19 20:57:56+00','2026-03-18 20:57:56+00', false,     0, 0,    10,0, 0, '2026-02-18 20:57:56+00','2026-04-06 11:46:03+00'),
  ('ff20e3ac-8b8b-4e2b-b14c-3099bf0537f7','5c2e5c61-e295-48fe-98d8-c604577eb0d1',      5,3,5,3, 10.00,  0,0,0,0, 0.00, '2026-02-19 20:57:56+00','2026-03-18 20:57:56+00', false,     0, 0,    10,0, 0, '2026-02-18 20:57:56+00','2026-04-06 11:46:03+00'),
  ('bcbef910-8c91-48fc-b1b1-c567e5cd9c4b','2efaff93-0d4f-4567-9c07-a404ddc5c23a',      5,1,5,3, 10.00,  1,0,0,0, 0.00, '2026-02-25 13:37:06+00','2026-03-24 13:37:06+00', false,     0, 1,    10,0, 0, '2026-02-24 13:37:06+00','2026-04-06 11:46:03+00'),
  ('d9be9263-c366-4e1e-908b-5c1a82017568','ea60a912-05bb-4a63-a311-db02e04089b5',      5,3,5,3, 10.00,  2,0,0,0, 0.00, '2026-03-18 19:46:19+00','2026-04-17 19:46:19+00', false,     0, 2,    10,0, 0, '2026-03-17 19:46:19+00','2026-04-06 11:46:03+00'),
  ('a0edc8e0-7cf4-499f-9bfb-6954a7b74c87','1d5aef56-4c7e-4880-a41c-3f6e29ced2be',      5,1,5,3, 10.00,  5,0,0,0, 0.00, '2026-04-16 15:50:01+00','2026-04-24 05:29:17+00', false,     5,28,     1,0,99, '2026-03-24 05:29:17+00','2026-04-16 15:43:52+00')
ON CONFLICT (id) DO UPDATE SET
  current_daily_messages     = EXCLUDED.current_daily_messages,
  current_monthly_messages   = EXCLUDED.current_monthly_messages,
  bonus_credits              = EXCLUDED.bonus_credits,
  updated_at                 = EXCLUDED.updated_at;


-- Step 3: app_settings (3 rows)

INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('admin_pin',    '', NOW()),
  ('admin_emails', '[]', NOW()),
  ('platform',     'ayn', NOW())
ON CONFLICT (key) DO NOTHING;


-- Step 4: pinned_sessions view (alias for pinned_chats)

CREATE OR REPLACE VIEW pinned_sessions AS SELECT * FROM pinned_chats;


-- Step 5: Mark ghazi@aynn.io as admin (primary account)

UPDATE users SET is_admin = true
WHERE email IN ('ghazi@aynn.io', 'ghazi.aldhyaei@gmail.com', 'test-admin@aynn.io');


-- Done. Intelligence data (ayn_world_predictions, ayn_world_signals, etc.)
-- stays in Supabase DB — spine reads it via SUPABASE_URL/SUPABASE_SERVICE_KEY.
-- Only user auth data needs to be in Railway Postgres.
