#!/usr/bin/env bash
# Release-gate smoke for ChangeKite against a production build (run `npx next build` first).
# Starts `next start --port 3101` twice (PGlite is single-process, so the verification link is read
# from the outbox between the phases). Headless Edge only. Usage: bash e2e/run-smoke.sh
set -u
cd "$(dirname "$0")/.."
PORT=3101
DATA=./.data/e2e-gate
STATE=./.data/e2e-state.json
rm -rf "$DATA" "$STATE"
export APP_URL=http://localhost:$PORT DATABASE_URL="pglite:$DATA" SESSION_SECRET=e2e-secret-e2e-secret-e2e-secret-123456 \
  TRUSTED_PROXY=none NODE_ENV=production

stop_server() {
  powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*next*start*--port $PORT*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep 2" >/dev/null
}
start_server() {
  (npx next start --port $PORT >> ./.data/e2e-server.log 2>&1 &)
  for _ in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/api/health" && return 0; sleep 1; done
  echo "server did not start"; return 1
}

mkdir -p ./.data
EMAIL="smoke-$(date +%s)@example.com"
start_server || exit 1
node e2e/smoke.mjs "http://localhost:$PORT" phase1 "$STATE" "$EMAIL"; P1=$?
stop_server
LINK=$(node e2e/read-outbox.mjs "$DATA" "$EMAIL" verify-email) || { echo "no verification link"; exit 1; }
start_server || exit 1
node e2e/smoke.mjs "http://localhost:$PORT" phase2 "$STATE" "$EMAIL" "$LINK"; P2=$?
stop_server
echo "phase1 exit=$P1 phase2 exit=$P2"
[ $P1 -eq 0 ] && [ $P2 -eq 0 ]
