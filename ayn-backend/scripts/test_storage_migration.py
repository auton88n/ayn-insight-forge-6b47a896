import asyncio
import base64
import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "ayn-backend"))

from core.storage_service import StorageService

async def test_migration():
    user_id = "681d1f77-c5b6-4d30-9b14-1b3cee13408b" # Real user for testing
    test_data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" # 1x1 black pixel base64
    mime_type = "image/png"

    print(f"Testing storage migration for user {user_id}...")
    
    # 1. Test Upload
    result = await StorageService.upload_avatar(user_id, test_data, mime_type)
    if not result.get("ok"):
        print(f"FAILED: Upload error: {result.get('error')}")
        return
    print("SUCCESS: Avatar uploaded to Postgres.")

    # 2. Test Get
    asset = await StorageService.get_avatar(user_id)
    if not asset:
        print("FAILED: Could not retrieve asset from Postgres.")
        return
    
    data, r_mime = asset
    if r_mime != mime_type:
        print(f"FAILED: Mime-type mismatch: {r_mime} != {mime_type}")
        return
    
    if len(data) == 0:
        print("FAILED: Retrieved data is empty.")
        return
    
    print(f"SUCCESS: Retrieved {len(data)} bytes of type {r_mime}.")
    print("\nStorage migration verified successfully!")

if __name__ == "__main__":
    if not os.getenv("DATABASE_URL"):
        print("ERROR: DATABASE_URL not set.")
        sys.exit(1)
    asyncio.run(test_migration())
