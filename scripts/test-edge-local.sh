#!/usr/bin/env bash
set -euo pipefail

# This script uses only the local Supabase stack. It never links to or contacts a hosted project.
supabase start -x studio,imgproxy,logflare,vector,supavisor,mailpit,realtime,storage-api

# The CLI emits local-only connection values; keep them in process memory / environment.
eval "$(supabase status -o env)"
export SUPABASE_URL="${API_URL}"
export SUPABASE_ANON_KEY="${ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"

env_file="$(mktemp)"
log_file="$(mktemp)"
printf 'APP_ORIGIN=http://localhost:5173\n' > "$env_file"

APP_ORIGIN=http://localhost:5173 supabase functions serve --env-file "$env_file" >"$log_file" 2>&1 &
functions_pid=$!

cleanup() {
  kill "$functions_pid" 2>/dev/null || true
  rm -f "$env_file" "$log_file"
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

ready=0
for attempt in $(seq 1 60); do
  status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --request OPTIONS \
    --header 'Origin: http://localhost:5173' \
    --header 'Access-Control-Request-Method: POST' \
    "$SUPABASE_URL/functions/v1/minha-conta" || true)"
  if [ "$status" = "204" ]; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -ne 1 ]; then
  echo "Edge Functions locais não ficaram prontas. Logs:"
  cat "$log_file"
  exit 1
fi

deno run --no-config --allow-env --allow-net scripts/test-edge-local.ts
