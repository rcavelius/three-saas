#!/usr/bin/env bash
# Backup/restore drill: dump a database with pg_dump (custom format), restore it into a fresh
# database with pg_restore, then compare every table's row count and content checksum.
#
#   PG="<command prefix that runs postgres client tools>" SRC_DB=<db> ./scripts/backup-restore-verify.sh
#
# PG examples:  "docker exec -i <container>"  (CI service container)  or ""  (tools on PATH).
# Connection settings come from the usual PGHOST/PGUSER/PGPASSWORD env vars.
set -euo pipefail
PG="${PG:-}"
SRC_DB="${SRC_DB:?SRC_DB is required}"
DST_DB="${SRC_DB}_restore_$(date +%s)"
DUMP=/tmp/${SRC_DB}.dump

run() { $PG "$@"; }

echo "dump ${SRC_DB}"
run pg_dump -U "${PGUSER:-postgres}" -Fc -d "$SRC_DB" -f "$DUMP"
run createdb -U "${PGUSER:-postgres}" "$DST_DB"
echo "restore into ${DST_DB}"
run pg_restore -U "${PGUSER:-postgres}" --no-owner -d "$DST_DB" "$DUMP"

# Per table: row count + md5 of all rows in a stable order (rows cast to text, sorted).
SUMMARY_SQL="
SELECT string_agg(t || ':' || n || ':' || h, E'\n' ORDER BY t) FROM (
  SELECT c.relname AS t,
         (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text AS n,
         (xpath('/row/h/text()', query_to_xml(format('SELECT md5(coalesce(string_agg(x::text, ''|'' ORDER BY x::text), '''')) AS h FROM public.%I x', c.relname), false, true, '')))[1]::text AS h
  FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
  WHERE s.nspname = 'public' AND c.relkind = 'r'
) q;"

src=$(run psql -U "${PGUSER:-postgres}" -d "$SRC_DB" -At -c "$SUMMARY_SQL")
dst=$(run psql -U "${PGUSER:-postgres}" -d "$DST_DB" -At -c "$SUMMARY_SQL")
tables=$(echo "$src" | wc -l)
rows=$(echo "$src" | awk -F: '{s+=$2} END {print s}')
if [ "$src" != "$dst" ]; then
  echo "BACKUP VERIFY FAILED: restored database differs"
  diff <(echo "$src") <(echo "$dst") || true
  exit 1
fi
echo "BACKUP VERIFY OK: ${tables} tables, ${rows} rows, identical counts and checksums after restore"
run dropdb -U "${PGUSER:-postgres}" "$DST_DB"
