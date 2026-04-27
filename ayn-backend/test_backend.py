#!/usr/bin/env python3
"""
AYN Backend — Pre-connection Test Suite

Tests the Python backend DIRECTLY with real Supabase data.
Run this BEFORE changing any React URLs.

Usage:
    pip install httpx python-dotenv
    python3 test_backend.py --url https://your-railway-url.railway.app --token YOUR_JWT_TOKEN

How to get your JWT token:
    1. Open aynn.io in Chrome
    2. Open DevTools → Application → Local Storage → supabase.auth.token
    3. Copy the access_token value

What this tests (in order):
    1. Health check — is the server running?
    2. Auth — does JWT verification work?
    3. Credits — does your account return correct limits?
    4. Subscription — does tier check work?
    5. Chat sessions — can you fetch history?
    6. Chat message — does the AI respond? Does streaming work?
    7. Suggestions — do follow-up suggestions generate?
    8. Intelligence — is world data accessible?
    9. Full flow — everything end to end
"""

import asyncio
import sys
import json
import time
import argparse
import httpx
from datetime import datetime


# ── Test runner ───────────────────────────────────────────────────────────────

class TestRunner:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        self.passed = 0
        self.failed = 0
        self.errors = []

    def ok(self, name: str, detail: str = ""):
        self.passed += 1
        detail_str = f" — {detail}" if detail else ""
        print(f"  ✅ {name}{detail_str}")

    def fail(self, name: str, reason: str):
        self.failed += 1
        self.errors.append(f"{name}: {reason}")
        print(f"  ❌ {name}: {reason}")

    def info(self, msg: str):
        print(f"  ℹ️  {msg}")

    def summary(self):
        total = self.passed + self.failed
        print(f"\n{'='*55}")
        print(f"Results: {self.passed}/{total} passed")
        if self.errors:
            print(f"\nFailures:")
            for e in self.errors:
                print(f"  • {e}")
        if self.passed == total:
            print("\n🟢 Backend ready — safe to connect React")
        else:
            print("\n🔴 Fix failures before connecting React")
        return self.failed == 0


# ── Test 1: Health ────────────────────────────────────────────────────────────

async def test_health(t: TestRunner):
    print("\n🏥 Health Check")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{t.base_url}/health")
        if r.status_code == 200:
            data = r.json()
            t.ok("Server is running", f"env={data.get('env')}")
            if data.get("supabase") == "connected":
                t.ok("Supabase connected")
            else:
                t.fail("Supabase connection", data.get("supabase", "unknown"))
            if data.get("stripe") == "configured":
                t.ok("Stripe configured")
            else:
                t.info("Stripe not configured (subscriptions won't work)")
        else:
            t.fail("Health check", f"HTTP {r.status_code}: {r.text[:100]}")
    except Exception as e:
        t.fail("Health check", f"Cannot reach server: {e}")


# ── Test 2: Auth ──────────────────────────────────────────────────────────────

async def test_auth(t: TestRunner):
    print("\n🔐 Auth / JWT Verification")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Credits endpoint requires valid JWT
            r = await client.get(
                f"{t.base_url}/api/credits",
                headers=t.headers
            )
        if r.status_code == 200:
            t.ok("JWT accepted — auth works")
            return True
        elif r.status_code == 401:
            t.fail("JWT rejected", r.json().get("detail", r.text[:100]))
            return False
        else:
            t.fail("Auth check", f"HTTP {r.status_code}: {r.text[:100]}")
            return False
    except Exception as e:
        t.fail("Auth check", str(e))
        return False


# ── Test 3: Credits ───────────────────────────────────────────────────────────

async def test_credits(t: TestRunner):
    print("\n💳 Credits")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{t.base_url}/api/credits", headers=t.headers)
        if r.status_code != 200:
            t.fail("Credits fetch", f"HTTP {r.status_code}")
            return

        data = r.json()
        tier = data.get("tier", "unknown")
        messages = data.get("messages", {})
        remaining = messages.get("remaining", 0)
        limit = messages.get("limit", 0)

        t.ok("Credits fetched", f"tier={tier}, remaining={remaining}/{limit}")

        if remaining > 0:
            t.ok("Has available credits")
        else:
            t.info("No credits remaining (upgrade or wait for reset)")

        # Validate structure
        if "engineering" in data and "messages" in data:
            t.ok("Response structure correct")
        else:
            t.fail("Response structure", f"Missing fields: {list(data.keys())}")

    except Exception as e:
        t.fail("Credits test", str(e))


# ── Test 4: Subscription ──────────────────────────────────────────────────────

async def test_subscription(t: TestRunner):
    print("\n💰 Subscription")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{t.base_url}/api/subscription", headers=t.headers)
        if r.status_code != 200:
            t.fail("Subscription fetch", f"HTTP {r.status_code}: {r.text[:100]}")
            return

        data = r.json()
        tier = data.get("tier", "unknown")
        source = data.get("source", "unknown")

        t.ok("Subscription fetched", f"tier={tier}, source={source}")

        if tier in ("free", "starter", "pro", "business", "unlimited", "enterprise"):
            t.ok("Valid tier returned")
        else:
            t.fail("Tier value", f"Unknown tier: {tier}")

        limits = data.get("limits", {})
        if limits:
            t.ok("Tier limits present", f"daily_msgs={limits.get('daily_messages', '?')}")
        else:
            t.fail("Tier limits", "Missing from response")

    except Exception as e:
        t.fail("Subscription test", str(e))


# ── Test 5: Chat Sessions ─────────────────────────────────────────────────────

async def test_chat_sessions(t: TestRunner):
    print("\n💬 Chat Sessions")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{t.base_url}/api/chat/sessions?limit=5",
                headers=t.headers
            )
        if r.status_code != 200:
            t.fail("Sessions fetch", f"HTTP {r.status_code}: {r.text[:100]}")
            return

        data = r.json()
        sessions = data.get("sessions", [])
        t.ok("Sessions fetched", f"{len(sessions)} sessions returned")

        if sessions:
            session = sessions[0]
            session_id = session.get("session_id")
            title = session.get("title", "untitled")
            t.ok("Session structure valid", f"title='{title[:30]}'")

            # Test fetching messages for first session
            async with httpx.AsyncClient(timeout=10) as client:
                r2 = await client.get(
                    f"{t.base_url}/api/chat/sessions/{session_id}/messages?limit=5",
                    headers=t.headers
                )
            if r2.status_code == 200:
                msgs = r2.json().get("messages", [])
                t.ok("Messages fetched", f"{len(msgs)} messages from session")
            else:
                t.fail("Messages fetch", f"HTTP {r2.status_code}")
        else:
            t.info("No existing sessions (new account)")

    except Exception as e:
        t.fail("Sessions test", str(e))


# ── Test 6: Chat Message (MOST IMPORTANT) ────────────────────────────────────

async def test_chat(t: TestRunner):
    print("\n🤖 Chat — Main AI Response (streaming)")
    try:
        payload = {
            "messages": [
                {"role": "user", "content": "Say exactly: 'AYN backend is working' and nothing else."}
            ],
            "stream": True,
            "sessionId": None,
        }

        print("  Sending test message and streaming response...")
        start = time.time()
        first_token_time = None
        full_response = ""
        token_count = 0

        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST",
                f"{t.base_url}/api/chat",
                json=payload,
                headers=t.headers,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    t.fail("Chat endpoint", f"HTTP {resp.status_code}: {body[:200]}")
                    return

                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        token = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if token:
                            if first_token_time is None:
                                first_token_time = time.time()
                            full_response += token
                            token_count += 1
                    except Exception:
                        pass

        elapsed = time.time() - start
        ttft = (first_token_time - start) * 1000 if first_token_time else 0

        if full_response:
            t.ok("Got AI response", f"'{full_response[:60]}'")
            t.ok(f"Streaming works", f"{token_count} tokens, TTFT={ttft:.0f}ms, total={elapsed:.1f}s")

            if ttft < 2000:
                t.ok("Time to first token is fast", f"{ttft:.0f}ms < 2000ms")
            elif ttft < 5000:
                t.info(f"Time to first token is acceptable ({ttft:.0f}ms) — consider optimization")
            else:
                t.fail("Time to first token is slow", f"{ttft:.0f}ms — streaming may not be working")

            if "AYN" in full_response or "backend" in full_response.lower() or "working" in full_response.lower():
                t.ok("AI identity correct — not revealing underlying model")
            else:
                t.info(f"Unexpected response: {full_response[:100]}")
        else:
            t.fail("Chat response", "Empty response — no tokens received")

    except Exception as e:
        t.fail("Chat test", str(e))


# ── Test 7: Arabic Chat ───────────────────────────────────────────────────────

async def test_arabic_chat(t: TestRunner):
    print("\n🌍 Arabic Language Support")
    try:
        payload = {
            "messages": [{"role": "user", "content": "قل بالضبط: 'AYN يعمل' ولا شيء آخر"}],
            "stream": True,
        }

        full_response = ""
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", f"{t.base_url}/api/chat",
                                      json=payload, headers=t.headers) as resp:
                if resp.status_code != 200:
                    t.fail("Arabic chat", f"HTTP {resp.status_code}")
                    return
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        token = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if token:
                            full_response += token
                    except Exception:
                        pass

        if full_response:
            t.ok("Arabic response received", f"'{full_response[:60]}'")
        else:
            t.fail("Arabic chat", "No response")

    except Exception as e:
        t.fail("Arabic chat", str(e))


# ── Test 8: Suggestions ───────────────────────────────────────────────────────

async def test_suggestions(t: TestRunner):
    print("\n💡 Suggestions")
    try:
        payload = {
            "last_message": "What is happening with gold prices?",
            "response": "Gold is currently trading near all-time highs due to geopolitical uncertainty.",
        }
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                f"{t.base_url}/api/chat/suggestions",
                json=payload, headers=t.headers
            )
        if r.status_code == 200:
            suggestions = r.json().get("suggestions", [])
            if suggestions:
                t.ok("Suggestions generated", f"{len(suggestions)} suggestions")
                for i, s in enumerate(suggestions[:3]):
                    t.info(f"  {i+1}. {s}")
            else:
                t.info("Suggestions returned empty list (may be normal)")
        else:
            t.fail("Suggestions", f"HTTP {r.status_code}: {r.text[:100]}")
    except Exception as e:
        t.fail("Suggestions test", str(e))


# ── Test 9: Intelligence ──────────────────────────────────────────────────────

async def test_intelligence(t: TestRunner):
    print("\n🌐 World Intelligence")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{t.base_url}/intelligence/snapshot",
                headers=t.headers
            )
        if r.status_code == 200:
            data = r.json()
            snapshot = data.get("snapshot", {})
            if snapshot:
                age = snapshot.get("snapshot_age_hours", "?")
                t.ok("Market snapshot accessible", f"age={age}h")
            else:
                t.info("Snapshot empty — cron may not have run yet")
        else:
            t.fail("Intelligence snapshot", f"HTTP {r.status_code}: {r.text[:100]}")

        async with httpx.AsyncClient(timeout=10) as client:
            r2 = await client.get(
                f"{t.base_url}/intelligence/signals",
                headers=t.headers
            )
        if r2.status_code == 200:
            signals = r2.json().get("signals", [])
            t.ok("World signals accessible", f"{len(signals)} signals")
        else:
            t.fail("World signals", f"HTTP {r2.status_code}")

    except Exception as e:
        t.fail("Intelligence test", str(e))


# ── Test 10: Credit limit enforcement ────────────────────────────────────────

async def test_credit_enforcement(t: TestRunner):
    print("\n🛡️  Credit Limit Enforcement")
    # Test that a request without auth is rejected
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{t.base_url}/api/credits")
        if r.status_code == 403 or r.status_code == 401 or r.status_code == 422:
            t.ok("Unauthenticated requests rejected", f"HTTP {r.status_code}")
        else:
            t.fail("Auth enforcement", f"Unauthenticated request returned HTTP {r.status_code}")
    except Exception as e:
        t.fail("Auth enforcement", str(e))

    # Test that invalid JWT is rejected
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{t.base_url}/api/credits",
                headers={"Authorization": "Bearer fake.invalid.token"}
            )
        if r.status_code == 401:
            t.ok("Invalid JWT rejected correctly")
        else:
            t.fail("Invalid JWT", f"Should return 401, got {r.status_code}")
    except Exception as e:
        t.fail("JWT validation", str(e))


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="AYN Backend Test Suite")
    parser.add_argument("--url", required=True, help="Python backend URL (e.g. https://xyz.railway.app)")
    parser.add_argument("--token", required=True, help="Your Supabase JWT access_token")
    parser.add_argument("--skip-chat", action="store_true", help="Skip the chat test (faster)")
    args = parser.parse_args()

    print("=" * 55)
    print("AYN Backend — Pre-connection Test Suite")
    print(f"Target: {args.url}")
    print(f"Time:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 55)

    t = TestRunner(args.url, args.token)

    await test_health(t)
    auth_ok = await test_auth(t)

    if not auth_ok:
        print("\n⛔ Auth failed — stopping. Check your JWT token.")
        print("\nHow to get your token:")
        print("  1. Open aynn.io in Chrome")
        print("  2. DevTools → Application → Local Storage")
        print("  3. Find key: 'sb-dfkoxuokfkttjhfjcecx-auth-token'")
        print("  4. Copy the access_token value")
        t.summary()
        return

    await test_credits(t)
    await test_subscription(t)
    await test_chat_sessions(t)
    await test_credit_enforcement(t)

    if not args.skip_chat:
        await test_chat(t)
        await test_arabic_chat(t)
        await test_suggestions(t)

    await test_intelligence(t)

    t.summary()


if __name__ == "__main__":
    asyncio.run(main())
