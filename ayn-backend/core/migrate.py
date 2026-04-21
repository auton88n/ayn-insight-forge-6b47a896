"""
core/migrate.py — runs migrations on startup
Reads all SQL files from migrations/ and applies them if not already applied
"""
import os
import logging
log = logging.getLogger("ayn.migrate")

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")


async def run_migrations(pool):
    """Run all pending migrations in order."""
    async with pool.acquire() as conn:
        # Create migrations tracking table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)

        # Get list of already-applied migrations
        applied = set(r["name"] for r in await conn.fetch("SELECT name FROM _migrations"))

        # Get SQL files in order
        if not os.path.exists(MIGRATIONS_DIR):
            log.warning(f"Migrations dir not found: {MIGRATIONS_DIR}")
            return

        files = sorted([f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")])

        for filename in files:
            if filename in applied:
                log.info(f"[migrate] ✓ {filename} (already applied)")
                continue

            filepath = os.path.join(MIGRATIONS_DIR, filename)
            with open(filepath, "r") as f:
                sql = f.read()

            try:
                async with conn.transaction():
                    await conn.execute(sql)
                    await conn.execute("INSERT INTO _migrations (name) VALUES ($1)", filename)
                log.info(f"[migrate] ✅ Applied {filename}")
            except Exception as e:
                log.error(f"[migrate] ❌ Failed {filename}: {e}")
                raise

        log.info("[migrate] ✅ All migrations complete")
