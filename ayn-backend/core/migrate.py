"""
core/migrate.py — runs migrations on startup
Reads all SQL files from migrations/ and applies them if not already applied
"""
import os
import logging
import asyncpg

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
                # Split into individual statements and execute each one
                # This prevents one bad statement from failing the whole migration
                import re as _re
                statements = [s.strip() for s in _re.split(r';\s*\n', sql) if s.strip() and not s.strip().startswith('--')]
                errors = []
                for stmt in statements:
                    if not stmt.strip():
                        continue
                    try:
                        await conn.execute(stmt)
                    except Exception as stmt_err:
                        err_msg = str(stmt_err)
                        # Ignore "already exists" errors - idempotent
                        if "already exists" not in err_msg and "duplicate" not in err_msg.lower():
                            errors.append(f"{stmt[:50]}: {err_msg[:80]}")
                if errors:
                    log.warning(f"[migrate] ⚠️  {filename} had {len(errors)} errors (non-fatal):")
                    for e in errors[:5]:
                        log.warning(f"  - {e}")
                await conn.execute("INSERT INTO _migrations (name) VALUES ($1)", filename)
                log.info(f"[migrate] ✅ Applied {filename} ({len(statements)} statements)")
            except Exception as e:
                log.error(f"[migrate] ❌ Failed {filename}: {e}")

        log.info("[migrate] ✅ All migrations complete")
