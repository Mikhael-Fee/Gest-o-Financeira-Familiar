#!/usr/bin/env bash
# Optional managed-cloud LOCAL Supabase startup. Never starts a remote project.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p .cache
# Keep CLI state writable in a restricted cloud without changing HOME.
export SUPABASE_HOME="${SUPABASE_HOME:-$PWD/.cache/supabase-cli}"
export SUPABASE_TELEMETRY_DISABLED=1
npm run build:edge
npx supabase start -x studio,imgproxy,realtime,storage-api,logflare,vector,supavisor > .cache/supabase-start.private.log 2>&1 &
financas_setup_pid=$!
for ((attempt=0;attempt<240;attempt++)); do
 if docker exec supabase_auth_financas-familiares true 2>/dev/null; then
  # BusyBox wget ignores no_proxy. Disable proxy ONLY for the local healthcheck.
  docker exec -u 0 -i supabase_auth_financas-familiares sh <<'CONTAINER'
mkdir -p /usr/local/bin
cat > /usr/local/bin/wget <<'WRAPPER'
#!/bin/sh
for argument in "$@"; do
 case "$argument" in http://127.0.0.1:*|http://localhost:*) exec /usr/bin/wget -Y off "$@";; esac
done
exec /usr/bin/wget "$@"
WRAPPER
chmod 755 /usr/local/bin/wget
CONTAINER
  break
 fi
 if ! kill -0 "$financas_setup_pid" 2>/dev/null; then break; fi
 sleep 1
done
wait "$financas_setup_pid"
docker exec supabase_auth_financas-familiares wget -q -O /dev/null http://127.0.0.1:9999/health
printf 'Supabase local iniciado; healthcheck Auth respondeu. Use test:api para validar os fluxos funcionais.\n'
