# AYN AI Platform - PRD

## Original Problem Statement
Pull everything from the GitHub repository: https://github.com/auton88n/ayn-insight-forge-6b47a896.git

## Project Overview
AYN AI is a perceptive AI platform offering business intelligence, market analysis, engineering tools, and multi-service AI features.

## Tech Stack
- Frontend: React 18 + TypeScript + Vite (at /app root)
- Styling: Tailwind CSS + shadcn/ui
- 3D Graphics: Three.js + React Three Fiber
- Backend: Supabase (Auth, Database, Edge Functions, Storage)
- AI: Multi-model LLM orchestration
- Minimal FastAPI at /app/backend (health endpoint only)

## Architecture Setup (Emergent Platform)
- `/app` — root Vite app (GitHub code)
- `/app/frontend/package.json` — wrapper that runs `yarn --cwd /app dev`
- `/app/backend/server.py` — minimal FastAPI health endpoint
- `vite.config.ts` — configured for port 3000, host 0.0.0.0, allowedHosts: true

## What's Been Implemented
- [2026-04-07] Cloned GitHub repo into /app workspace
- [2026-04-07] Installed npm dependencies (yarn install at /app)
- [2026-04-07] Created /app/frontend/ wrapper for Emergent supervisor
- [2026-04-07] Created /app/backend/ minimal FastAPI server
- [2026-04-07] Fixed vite.config.ts: port 3000, host 0.0.0.0, allowedHosts: true
- [2026-04-07] Both frontend (port 3000) and backend (port 8001) running via supervisor

## Key Features (from GitHub)
- AI Assistant (AYN Eye) with emotional intelligence
- Engineering calculators (Beam, Column, Slab, Foundation, Retaining Wall)
- Admin dashboard with analytics
- Support ticketing system
- Multi-language (English, Arabic, French)
- Supabase auth & database
- World Intelligence simulator with 80+ agents

## Supabase Config
- URL: https://dfkoxuokfkttjhfjcecx.supabase.co
- Keys hardcoded in /app/src/config.ts

## Prioritized Backlog
- P0: App running correctly ✅
- P1: Any additional features user requests
- P2: Testing and QA

## Next Tasks
- User to confirm what changes/features they want to build on top of this codebase
