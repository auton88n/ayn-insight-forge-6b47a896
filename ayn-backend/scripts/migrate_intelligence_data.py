"""
Run via: railway run python ayn-backend/scripts/migrate_intelligence_data.py
Copies intelligence data from Supabase to Railway Postgres.
"""
import asyncio, asyncpg, json, httpx, ssl, os

SUPABASE_URL = "https://dfkoxuokfkttjhfjcecx.supabase.co"
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

TABLES = [
    "ayn_world_predictions", "ayn_world_signals", "ayn_predictions", "ayn_mind",
    "ayn_agent_conversations", "ayn_agent_messages", "ayn_opportunity_alerts",
    "ayn_prediction_outcomes", "ayn_historical_patterns", "ayn_activity_log",
    "ayn_sales_pipeline", "ayn_kg_snapshots", "ayn_market_prices", "ayn_graph_runs",
]

async def fetch_from_supabase(table):
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    rows, offset = [], 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            r = await client.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=headers,
                params={"select": "*", "limit": 1000, "offset": offset})
            batch = r.json() if r.is_success else []
            if not batch: break
            rows.extend(batch)
            if len(batch) < 1000: break
            offset += 1000
    return rows

async def insert_rows(conn, table, rows):
    if not rows: return 0
    inserted = 0
    for row in rows:
        cols = list(row.keys())
        vals = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in row.values()]
        ph = ", ".join(f"${i+1}" for i in range(len(cols)))
        cn = ", ".join(f'"{c}"' for c in cols)
        try:
            r = await conn.execute(
                f"INSERT INTO {table} ({cn}) VALUES ({ph}) ON CONFLICT (id) DO NOTHING", *vals)
            if r != "INSERT 0 0": inserted += 1
        except Exception:
            pass
    return inserted

async def main():
    print("\n=== AYN Intelligence Migration: Supabase → Railway ===\n")
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    conn = await asyncpg.connect(DATABASE_URL, ssl=ctx)
    ts, ti = 0, 0
    for table in TABLES:
        print(f"  {table}... ", end="", flush=True)
        rows = await fetch_from_supabase(table)
        n = await insert_rows(conn, table, rows)
        ts += len(rows); ti += n
        print(f"{n}/{len(rows)} ✅")
    await conn.close()
    print(f"\nDone: {ti}/{ts} rows migrated ✅\n")

asyncio.run(main())
