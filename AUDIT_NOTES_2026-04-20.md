# Production Audit Notes (2026-04-20)

This file records the evidence gathered for a production-readiness audit.

Key observations captured:
- Python backend (`ayn-backend`) is active, but multiple Supabase dependencies remain in runtime paths.
- Admin and payment endpoints contain authorization gaps.
- Scheduler and migrations are startup-driven and not hardened for multi-instance production.
- Frontend and CI still contain hardcoded Supabase-era wiring.
- Repository includes multiple legacy server entrypoints and duplicated admin router modules.
