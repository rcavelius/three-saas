#!/usr/bin/env bash
# Resource measurement for one app container (run in CI after `docker run --name app ...`).
#   APP=<changekite|gridrinse|webhooktrail> START_EPOCH_MS=<ms when docker run was issued> bash scripts/measure-container.sh
# Prints a summary: image size, cold start, idle/peak memory, CPU during load, latency percentiles.
set -uo pipefail
APP="${APP:?}"
BASE=http://localhost:8080
SAMPLES=/tmp/stats.txt
: > "$SAMPLES"

# Sample memory/CPU every second in the background.
( while true; do docker stats --no-stream --format '{{.MemUsage}}|{{.CPUPerc}}' app >> "$SAMPLES" 2>/dev/null; sleep 1; done ) &
SAMPLER=$!

ready_ms=$(date +%s%3N)
echo "cold_start_ms=$((ready_ms - START_EPOCH_MS))"
sleep 5
idle=$(docker stats --no-stream --format '{{.MemUsage}}' app)
echo "idle_memory=$idle"

# 500 mixed page/API requests, 20 concurrent; record each latency.
paths="/ /pricing /help /signup /robots.txt /api/health"
: > /tmp/lat.txt
for i in $(seq 1 500); do
  p=$(echo $paths | tr ' ' '\n' | sed -n "$(( (i % 6) + 1 ))p")
  echo "$p"
done | xargs -P 20 -I{} curl -s -o /dev/null -w '%{time_total}\n' "$BASE{}" >> /tmp/lat.txt

case "$APP" in
  changekite)
    # One real anonymous scan (public internet, example.com is IANA's reserved example site).
    t0=$(date +%s%3N)
    code=$(curl -s -o /tmp/scan.json -w '%{http_code}' -X POST "$BASE/api/scan" \
      -H 'content-type: application/json' -H "origin: $BASE" -d '{"url":"https://example.com"}')
    echo "scan_http=$code scan_ms=$(( $(date +%s%3N) - t0 ))"
    ;;
  webhooktrail)
    # Create an anonymous endpoint and send 500 captures (20 concurrent).
    curl -s -c /tmp/jar -X POST "$BASE/api/endpoints" -H 'content-type: application/json' -H "origin: $BASE" -d '{}' > /tmp/ep.json
    cap=$(grep -o '"captureUrl":"[^"]*"' /tmp/ep.json | head -1 | cut -d'"' -f4)
    echo "capture_url_found=$([ -n "$cap" ] && echo yes || echo no)"
    t0=$(date +%s%3N)
    seq 1 500 | xargs -P 20 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST "$cap" \
      -H 'content-type: application/json' -d '{"event":"order.created","n":{}}' > /tmp/cap.txt
    echo "captures_ok=$(grep -c '^200$' /tmp/cap.txt) captures_429=$(grep -c '^429$' /tmp/cap.txt) captures_ms=$(( $(date +%s%3N) - t0 ))"
    ;;
esac

sleep 2
kill $SAMPLER 2>/dev/null
# Peak memory (MiB) and peak / average CPU % from the samples.
awk -F'|' '
  function mib(v,  n,u){ n=v+0; u=v; gsub(/[0-9.]/,"",u); if(u ~ /GiB/) return n*1024; if(u ~ /KiB/) return n/1024; return n }
  { split($1,a," / "); m=mib(a[1]); if(m>pm) pm=m; c=$2; gsub(/%/,"",c); c+=0; if(c>pc) pc=c; sc+=c; n++ }
  END { printf "peak_memory_mib=%.0f peak_cpu_pct=%.0f avg_cpu_pct=%.1f samples=%d\n", pm, pc, (n?sc/n:0), n }' "$SAMPLES"
sort -n /tmp/lat.txt | awk '{a[NR]=$1} END { printf "requests=%d p50_ms=%.0f p95_ms=%.0f p99_ms=%.0f\n", NR, a[int(NR*0.5)]*1000, a[int(NR*0.95)]*1000, a[int(NR*0.99)]*1000 }'
docker image ls "$APP:ci" --format 'image_size={{.Size}}'
