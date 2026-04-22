import asyncio
import os
from core.database import get_pool

async def check():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        print("TABLE_LIST_START")
        for r in rows:
            print(r['table_name'])
        print("TABLE_LIST_END")

if __name__ == "__main__":
    asyncio.run(check())
