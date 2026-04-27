-- Migration 013: Schema fixes and missing columns

-- Fix beta_feedback: add missing columns
ALTER TABLE beta_feedback 
  ADD COLUMN IF NOT EXISTS overall_rating integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS favorite_features jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS improvement_suggestions text,
  ADD COLUMN IF NOT EXISTS bugs_encountered text,
  ADD COLUMN IF NOT EXISTS would_recommend boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS additional_comments text,
  ADD COLUMN IF NOT EXISTS credits_awarded integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Fix user_subscriptions: ensure all needed columns exist  
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Fix user_ai_limits: ensure all needed columns exist
ALTER TABLE user_ai_limits
  ADD COLUMN IF NOT EXISTS daily_messages integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS current_daily_messages integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_messages integer DEFAULT 150,
  ADD COLUMN IF NOT EXISTS bonus_credits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_reset_at timestamptz DEFAULT NOW() + INTERVAL '1 day',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Fix support_tickets: ensure columns exist
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS has_unread_reply boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Fix ticket_messages
ALTER TABLE ticket_messages
  ADD COLUMN IF NOT EXISTS ticket_id uuid,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS sender text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS sender_id uuid;

-- Fix custom_orders: ensure columns exist
ALTER TABLE custom_orders
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS services jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Fix service_applications
ALTER TABLE service_applications
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS message text,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Fix system_config: ensure key column has unique constraint
ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS value text;

-- Ensure unique constraint on system_config.key if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'system_config_key_key' AND conrelid = 'system_config'::regclass
  ) THEN
    ALTER TABLE system_config ADD CONSTRAINT system_config_key_key UNIQUE (key);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Ensure unique constraint on app_settings.key if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'app_settings_key_key' AND conrelid = 'app_settings'::regclass
  ) THEN
    ALTER TABLE app_settings ADD CONSTRAINT app_settings_key_key UNIQUE (key);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Ensure beta_feedback has unique constraint on user_id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'beta_feedback_user_id_key' AND conrelid = 'beta_feedback'::regclass
  ) THEN
    ALTER TABLE beta_feedback ADD CONSTRAINT beta_feedback_user_id_key UNIQUE (user_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Subscription plans table (needed for plan management)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier text UNIQUE NOT NULL,
  price_monthly numeric DEFAULT 0,
  price_yearly numeric DEFAULT 0,
  daily_messages integer DEFAULT 5,
  monthly_messages integer DEFAULT 150,
  features jsonb DEFAULT '[]'::jsonb,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW()
);

-- Insert default plans if not exist
INSERT INTO subscription_plans (name, tier, price_monthly, daily_messages, monthly_messages, features)
VALUES 
  ('Free', 'free', 0, 5, 150, '["5 messages/day", "Basic intelligence", "World signals"]'),
  ('Starter', 'starter', 29, 50, 1500, '["50 messages/day", "Full intelligence", "Predictions", "Market data"]'),
  ('Pro', 'pro', 79, 200, 6000, '["200 messages/day", "All features", "Agent society", "Priority support"]'),
  ('Business', 'business', 199, 1000, 30000, '["1000 messages/day", "API access", "Custom reports", "Dedicated support"]')
ON CONFLICT (tier) DO NOTHING;

-- Error logs table if missing
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text,
  message text,
  severity text DEFAULT 'error',
  status text DEFAULT 'open',
  endpoint text,
  user_id uuid,
  context jsonb,
  created_at timestamptz DEFAULT NOW()
);
