#!/bin/sh
# SmartHealth Hub — daily database + media backups.
#
# Runs inside the `backup` service of docker-compose.server.yml. The image is
# postgres:18-alpine, so pg_dump always matches the server's PostgreSQL 18.
#
#   sh /scripts/backup.sh loop   # service default: one backup per day at
#                                # BACKUP_TIME; if the VM was off at that time,
#                                # it runs a catch-up backup after start-up
#   sh /scripts/backup.sh now    # one backup right away (manual)
#
# Files in /backups (on the host: /var/backups/smarthealth):
#   db-YYYYMMDD-HHMMSS.dump        pg_dump custom format → restore with pg_restore
#   media-YYYYMMDD-HHMMSS.tar.gz   patient photos, card PDFs, uploads
#   status.json                    last attempt + last success (no patient data)
#
# The dumps contain patient data (mode 600, owned by BACKUP_OWNER). Encrypted
# columns stay encrypted, so a restored copy is only fully readable with the
# server's ENCRYPTION_KEY: keep that key in a password manager, never next to
# the backup files.

set -u

BACKUP_DIR=/backups
MEDIA_DIR=/media
BACKUP_TIME="${BACKUP_TIME:-22:30}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
OWNER="${BACKUP_OWNER:-1000:1000}"
MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-1024}"
RETRY_MINUTES=30
CHECK_SECONDS=300
STATE_FILE="$BACKUP_DIR/.last_success"
STATUS_FILE="$BACKUP_DIR/status.json"
ERR_FILE="$BACKUP_DIR/.last_error"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S %z') $*"; }

# ISO-8601 with a colon in the offset (2026-11-19T22:30:00+08:00).
iso_now() { date '+%Y-%m-%dT%H:%M:%S%z' | sed 's/\([+-][0-9][0-9]\)\([0-9][0-9]\)$/\1:\2/'; }

# Escape a string for use inside a JSON "..." value.
json_str() { printf '%s' "$1" | tr '\n\r\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Read one key from the last-success state file (empty if missing).
state_get() {
    if [ -f "$STATE_FILE" ]; then
        sed -n "s/^$1=//p" "$STATE_FILE" | head -n 1
    fi
}

write_status() { # $1 = ok|error, $2 = human-readable message
    last_at=$(state_get at)
    if [ -n "$last_at" ]; then
        last_json=$(printf '{"at": "%s", "db_file": "%s", "db_bytes": %s, "media_file": "%s", "media_bytes": %s, "duration_seconds": %s}' \
            "$last_at" "$(state_get db_file)" "$(state_get db_bytes)" \
            "$(state_get media_file)" "$(state_get media_bytes)" "$(state_get duration)")
    else
        last_json=null
    fi
    tmp="$STATUS_FILE.tmp"
    printf '{\n  "status": "%s",\n  "message": "%s",\n  "last_attempt_at": "%s",\n  "last_success": %s,\n  "schedule": "daily %s %s",\n  "keep_days": %s\n}\n' \
        "$1" "$(json_str "$2")" "$(iso_now)" "$last_json" "$BACKUP_TIME" "${TZ:-UTC}" "$KEEP_DAYS" >"$tmp"
    chown "$OWNER" "$tmp" 2>/dev/null
    chmod 644 "$tmp"
    mv "$tmp" "$STATUS_FILE"
}

fail() {
    log "FAILED: $1"
    write_status error "$1"
}

run_backup() {
    started=$(date +%s)
    stamp=$(date +%Y%m%d-%H%M%S)

    # 711: the owner can list and read; other users can only open a file whose
    # name they already know (status.json is 644, the dumps are 600).
    mkdir -p "$BACKUP_DIR"
    chown "$OWNER" "$BACKUP_DIR"
    chmod 711 "$BACKUP_DIR"
    umask 077

    free_mb=$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    if [ "${free_mb:-0}" -lt "$MIN_FREE_MB" ]; then
        fail "Only ${free_mb:-?} MB free on the backup disk (need at least ${MIN_FREE_MB} MB)."
        return 1
    fi

    # ── Database ─────────────────────────────────────────────────────────────
    db_file="db-$stamp.dump"
    part="$BACKUP_DIR/.$db_file.part"
    log "dumping database ${PGDATABASE:-?} -> $db_file"
    if ! pg_dump --format=custom --file="$part" 2>"$ERR_FILE"; then
        fail "pg_dump failed: $(head -c 400 "$ERR_FILE")"
        rm -f "$part"
        return 1
    fi
    # Read the archive's table of contents back: catches a truncated dump.
    if ! pg_restore --list "$part" >/dev/null 2>"$ERR_FILE"; then
        fail "The new database dump could not be read back: $(head -c 400 "$ERR_FILE")"
        rm -f "$part"
        return 1
    fi
    mv "$part" "$BACKUP_DIR/$db_file"
    db_bytes=$(stat -c %s "$BACKUP_DIR/$db_file")

    # ── Media (photos, PDFs, uploads) ────────────────────────────────────────
    media_file=""
    media_bytes=0
    if [ -d "$MEDIA_DIR" ]; then
        media_file="media-$stamp.tar.gz"
        part="$BACKUP_DIR/.$media_file.part"
        log "archiving media -> $media_file"
        if ! tar -czf "$part" -C "$MEDIA_DIR" . 2>"$ERR_FILE" ||
            ! tar -tzf "$part" >/dev/null 2>>"$ERR_FILE"; then
            fail "Media archive failed: $(head -c 400 "$ERR_FILE")"
            rm -f "$part"
            return 1
        fi
        mv "$part" "$BACKUP_DIR/$media_file"
        media_bytes=$(stat -c %s "$BACKUP_DIR/$media_file")
    fi

    chown "$OWNER" "$BACKUP_DIR/$db_file" ${media_file:+"$BACKUP_DIR/$media_file"}
    duration=$(($(date +%s) - started))

    cat >"$STATE_FILE.tmp" <<EOF
epoch=$(date +%s)
at=$(iso_now)
db_file=$db_file
db_bytes=$db_bytes
media_file=$media_file
media_bytes=$media_bytes
duration=$duration
EOF
    mv "$STATE_FILE.tmp" "$STATE_FILE"
    chown "$OWNER" "$STATE_FILE"

    # ── Retention: only after a successful backup, so a broken backup job can
    # never delete the last good copies.
    removed=$(find "$BACKUP_DIR" -maxdepth 1 -type f \
        \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) \
        -mtime +"$((KEEP_DAYS - 1))" -print -delete | wc -l)
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '.*.part' -mmin +120 -delete
    rm -f "$ERR_FILE"

    msg="Backup finished in ${duration}s: database $((db_bytes / 1024)) KB, media $((media_bytes / 1024)) KB; removed $removed old file(s)."
    log "$msg"
    write_status ok "$msg"
    return 0
}

# Epoch of the most recent scheduled run time that is not in the future.
due_epoch() {
    now=$(date +%s)
    sched=$(date -d "$(date +%Y-%m-%d) $BACKUP_TIME" +%s 2>/dev/null) || return 1
    if [ "$sched" -gt "$now" ]; then
        sched=$((sched - 86400))
    fi
    echo "$sched"
}

# `sleep & wait` so `docker compose stop` (SIGTERM) ends the loop immediately.
nap() {
    sleep "$1" &
    wait $!
}

loop() {
    trap 'log "stopping"; exit 0' TERM INT
    if ! due_epoch >/dev/null; then
        log "BACKUP_TIME '$BACKUP_TIME' is not a valid HH:MM time"
        exit 1
    fi
    log "service started: daily at $BACKUP_TIME ${TZ:-UTC} (container clock: $(date '+%H:%M %z')), keeping $KEEP_DAYS days"
    last_attempt=0
    nap 90 # let the backend finish start-up and migrations first
    while :; do
        last_ok=$(state_get epoch)
        now=$(date +%s)
        if [ "${last_ok:-0}" -lt "$(due_epoch)" ] &&
            [ $((now - last_attempt)) -ge $((RETRY_MINUTES * 60)) ]; then
            last_attempt=$now
            run_backup || log "will retry in $RETRY_MINUTES minutes"
        fi
        nap "$CHECK_SECONDS"
    done
}

case "${1:-loop}" in
loop) loop ;;
now) run_backup ;;
*)
    echo "usage: backup.sh [loop|now]" >&2
    exit 2
    ;;
esac
