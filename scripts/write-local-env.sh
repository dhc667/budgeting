#!/usr/bin/env bash
# Writes .env.owner.local for the running local Supabase, in the owner CLI's variable names.
set -euo pipefail
cd "$(dirname "$0")/.."

eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|DB_URL|PUBLISHABLE_KEY|SECRET_KEY)=')"

cat > .env.owner.local <<ENV
APP_URL=http://localhost:5173/
SUPABASE_URL=$API_URL
SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=$SECRET_KEY
DATABASE_URL=$DB_URL
ENV
echo "Wrote .env.owner.local"
