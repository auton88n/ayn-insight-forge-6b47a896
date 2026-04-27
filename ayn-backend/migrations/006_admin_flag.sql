-- Migration 006: Add is_admin flag to users table
-- Also creates admin_emails setting for explicit admin management

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Set first user as admin (founder)
UPDATE users 
SET is_admin = true 
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);

-- Create admin_emails setting if not exists  
INSERT INTO app_settings (key, value, updated_at)
VALUES ('admin_emails', '[]', NOW())
ON CONFLICT (key) DO NOTHING;
