#!/bin/bash
set -euo pipefail
umask 077
export SEO_MCP_GOOGLE_TOKEN=/opt/ayn-seo/token.json
export SEO_PSI_KEY_FILE=/opt/ayn-seo/psi-key
# systemd prevents overlapping starts; flock also protects manual executions.
exec 9>/opt/ayn-seo/collector.lock
flock -n 9 || exit 0
/opt/ayn-seo/venv/bin/python /opt/ayn-seo/seo-snapshot.py |
  docker exec -i supabase-db psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres
