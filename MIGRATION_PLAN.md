# AYN — Supabase → spine.aynn.io Migration Plan

## Architecture After Migration
- spine.aynn.io (Railway) = auth + DB + all API
- aynn.io (Lovable) = frontend only, talks to spine
- ayn-ai-proxy (Supabase) = stays, free tier, Lovable LLM proxy
- engine.aynn.io (Railway) = simulation engine, unchanged

## Phase 1: Railway PostgreSQL (Database)
- Add PostgreSQL plugin to Railway project
- Export all Supabase tables + data via pg_dump
- Import into Railway Postgres
- Switch spine db.py from supabase-py to asyncpg/SQLAlchemy

## Phase 2: Auth System in spine
- POST /auth/register  — bcrypt password, issue JWT
- POST /auth/login     — verify password, issue JWT  
- POST /auth/refresh   — refresh token rotation
- POST /auth/logout    — invalidate refresh token
- GET  /auth/me        — return user profile
- JWT secret stored in Railway env (AYN_JWT_SECRET)
- Refresh tokens stored in DB (sessions table)

## Phase 3: Core API Routes in spine
Replace Supabase direct queries with spine endpoints:
- GET  /user/profile
- PUT  /user/profile
- GET  /user/limits
- GET  /chats          — list sessions
- GET  /chats/:id      — get messages
- POST /chats/:id/messages — send message (already /chat)
- DELETE /chats/:id

## Phase 4: Frontend Migration
Replace in batches:
1. supabase.auth.* → fetch(spine/auth/*)
2. supabase.from('messages') → fetch(spine/chats/*)
3. supabase.from('user_*') → fetch(spine/user/*)
4. supabase.from('ayn_*') → fetch(spine/intelligence/*)
5. Remove @supabase/supabase-js entirely

## Phase 5: Stripe Webhook → spine
- POST /webhooks/stripe in spine
- No more edge function needed

## Tables to migrate (priority order)
### Critical (Phase 1)
- users (auth.users → our own users table)
- user_sessions (refresh tokens)
- user_subscriptions
- user_ai_limits
- user_settings
- user_memory
- messages
- chat_sessions

### Important (Phase 2)  
- ayn_world_signals
- ayn_predictions / ayn_consensus_predictions
- ayn_market_snapshot
- ayn_country_intelligence
- ayn_master_predictions
- error_logs
- profiles

### Admin (Phase 3)
- beta_feedback
- contact_messages
- custom_orders
- service_applications
- support_tickets
- All other admin tables

## What stays on Supabase (free tier only)
- ayn-ai-proxy edge function (Lovable LLM proxy)
- Nothing else

## Railway services after migration
- spine (Python FastAPI) — main backend
- spine-db (PostgreSQL) — $5/mo
- engine (simulation) — existing

## Cost comparison
Before: Supabase Pro ~$25/mo + Railway
After:  Railway PostgreSQL ~$5/mo + Railway spine (already paying)
Saving: ~$20/mo minimum
