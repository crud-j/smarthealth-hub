#!/bin/sh
# SmartHealth Hub — prove that a backup can actually be restored.
#
#   dc exec backup sh /scripts/verify-restore.sh                           # newest dump
#   dc exec backup sh /scripts/verify-restore.sh db-20261119-223000.dump   # a specific one
#
# Restores the dump into a temporary database (restore_check), compares row
# counts with the live database, then deletes the temporary database.
# The live database is only read, never changed.

set -u

CHECK_DB=restore_check
TABLES="users patients health_cards visits medical_history immunizations appointments sms_logs audit_logs"

file="${1:-}"
if [ -z "$file" ]; then
    file=$(ls -1t /backups/db-*.dump 2>/dev/null | head -n 1)
fi
case "$file" in
/*) ;;
?*) file="/backups/$file" ;;
esac
if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "No backup file found (looked for /backups/db-*.dump)."
    exit 1
fi

echo "Restoring $(basename "$file") into temporary database '$CHECK_DB'..."
psql -X -q -v ON_ERROR_STOP=1 -d postgres \
    -c "SET client_min_messages = warning" \
    -c "DROP DATABASE IF EXISTS $CHECK_DB" \
    -c "CREATE DATABASE $CHECK_DB" || exit 1

cleanup() { psql -X -q -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB" >/dev/null 2>&1; }
trap cleanup EXIT

if ! pg_restore --no-owner --no-acl --exit-on-error -d "$CHECK_DB" "$file"; then
    echo "RESULT: FAILED - pg_restore reported an error (see above)."
    exit 1
fi

failed=0
printf '\n%-18s %12s %12s\n' TABLE BACKUP LIVE
for t in $TABLES; do
    b=$(psql -X -tA -d "$CHECK_DB" -c "SELECT count(*) FROM $t" 2>/dev/null) || b=MISSING
    l=$(psql -X -tA -c "SELECT count(*) FROM $t" 2>/dev/null) || l=MISSING
    printf '%-18s %12s %12s\n' "$t" "$b" "$l"
    if [ "$b" = MISSING ]; then failed=1; fi
done
bm=$(psql -X -tA -d "$CHECK_DB" -c "SELECT version_num FROM alembic_version" 2>/dev/null)
lm=$(psql -X -tA -c "SELECT version_num FROM alembic_version" 2>/dev/null)
printf '%-18s %12s %12s\n' "migration" "${bm:-MISSING}" "${lm:-MISSING}"
echo

if [ "$failed" -eq 0 ] && [ -n "$bm" ]; then
    echo "RESULT: OK - the backup restores."
    echo "(LIVE can be higher than BACKUP when the app was used after the backup was taken.)"
else
    echo "RESULT: FAILED - tables are missing in the restored copy."
    exit 1
fi
