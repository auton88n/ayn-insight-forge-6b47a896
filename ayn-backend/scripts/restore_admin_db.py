import os
import asyncio
import asyncpg
import ssl

async def migrate():
    url = os.getenv("DATABASE_URL")
    if not url:
        print("DATABASE_URL not set")
        return

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    print(f"Connecting to {url.split('@')[-1]}...")
    conn = await asyncpg.connect(url, ssl=ctx)
    try:
        # 1. user_consent_logs
        print("Creating user_consent_logs...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_consent_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id),
                terms_version VARCHAR(20) NOT NULL,
                privacy_accepted BOOLEAN DEFAULT FALSE,
                terms_accepted BOOLEAN DEFAULT FALSE,
                ai_disclaimer_accepted BOOLEAN DEFAULT FALSE,
                accepted_at TIMESTAMPTZ DEFAULT NOW(),
                user_agent TEXT,
                ip_address TEXT
            )
        """)

        # 2. twitter_posts
        print("Creating twitter_posts...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS twitter_posts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                content TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'draft', -- draft, posted, failed, rejected
                psychological_strategy TEXT,
                target_audience TEXT,
                content_type TEXT,
                quality_score JSONB,
                tweet_id VARCHAR(100),
                image_url TEXT,
                posted_at TIMESTAMPTZ,
                error_message TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # 3. rate_limit_metrics (simple log for monitoring)
        print("Creating rate_limit_metrics...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limit_metrics (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id),
                endpoint TEXT NOT NULL,
                was_blocked BOOLEAN DEFAULT FALSE,
                limit_hit INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        
        # 4. admin_activity_log (for activity log section)
        print("Creating admin_activity_log...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS admin_activity_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                actor_id UUID REFERENCES users(id),
                action TEXT NOT NULL,
                target TEXT,
                details JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        print("Migration complete!")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(migrate())
