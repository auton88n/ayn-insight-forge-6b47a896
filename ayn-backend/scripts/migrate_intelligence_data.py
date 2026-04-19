"""
scripts/migrate_intelligence_data.py
Run via: railway run python scripts/migrate_intelligence_data.py

Copies live intelligence data from Supabase → Railway Postgres.
Safe to run multiple times (ON CONFLICT DO NOTHING).
"""
import asyncio
import asyncpg
import json
import os
import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]

TABLES = [
    "ayn_world_predictions",
    "ayn_world_signals",
    "ayn_predictions",
    "ayn_mind",
    "ayn_agent_conversations",
    "ayn_agent_messages",
    "ayn_opportunity_alerts",
    "ayn_prediction_outcomes",
    "ayn_historical_patterns",
    "ayn_activity_log",
    "ayn_sales_pipeline",
    "ayn_kg_snapshots",
    "ayn_market_prices",
    "ayn_graph_runs",
]

async def fetch_from_supabase(table: str) -> list:
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }
    all_rows = []
    offset = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            r = await client.get(
                f"{SUPABASE_URL}/rest/v1/{table}",
                headers=headers,
                params={"select": "*", "limit": 1000, "offset": offset}
            )
            if not r.is_success:
                print(f"  HTTP {r.status_code}")
                break
            batch = r.json()
            if not batch:
                break
            all_rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    return all_rows

async def insert_rows(conn, table: str, rows: list) -> int:
    if not rows:
        return 0
    inserted = 0
    for row in rows:
        cols = list(row.keys())
        vals = [json.dumps(v) if isinstance(v, (dict, list)) else v for v in row.values()]
        placeholders = ", ".join(f"${i+1}" for i in range(len(cols)))
        col_names = ", ".join(f'"{c}"' for c in cols)
        sql = f'INSERT INTO {table} ({col_names}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING'
        try:
            r = await conn.execute(sql, *vals)
            if r != "INSERT 0 0":
                inserted += 1
        except Exception as e:
            print(f"  row error: {str(e)[:80]}")
    return inserted

async def main():
    print("\n=== AYN Intelligence Migration: Supabase → Railway ===\n")
    conn = await asyncpg.connect(DATABASE_URL, ssl=True)
    total_src = total_ins = 0
    for table in TABLES:
        print(f"  {table}... ", end="", flush=True)
        rows = await fetch_from_supabase(table)
        ins = await insert_rows(conn, table, rows)
        total_src += len(rows)
        total_ins += ins
        print(f"{ins}/{len(rows)} ✅")
    await conn.close()
    print(f"\nDone: {total_ins}/{total_src} total rows migrated\n")

if __name__ == "__main__":
    asyncio.run(main())
