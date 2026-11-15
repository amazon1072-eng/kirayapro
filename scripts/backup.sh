#!/usr/bin/env bash
# KirayaPro — SQLite backup (hot backup, safe while the server is running).
#
# Usage:   ./scripts/backup.sh [destination-dir]
#          Default destination: ./backups  (override with BACKUP_DIR env)
#          Creates: backups/kirayapro-YYYYMMDD-HHMM.db
#          Then verifies integrity (PRAGMA integrity_check) and prints counts.
#
# Why sqlite3 .backup and not cp: .backup takes a consistent snapshot even
# if the server writes mid-backup. (Journal mode is "delete", so a plain cp
# while the server is idle would also work — .backup is the safe method.)
#
# RESTORE PROCEDURE (tested 15 Nov 2026 — see PHASE3 report):
#   1. Stop the server:   pkill -f "next start -p 3200"   (or Ctrl+C)
#   2. Keep the broken file, just in case:
#        cp prisma/dev.db "prisma/dev.db.broken-$(date +%Y%m%d-%H%M)"
#   3. Restore the backup over the live file:
#        cp backups/kirayapro-<date>.db prisma/dev.db
#   4. Verify the restored file:
#        DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/backup-verify.ts
#        (expect: integrity ok, billed 245,100 / approved 130,300 /
#         outstanding 114,800 on the demo org, spot bill intact)
#   5. Start the server:  npm start
#   6. Log in as demo@kirayapro.pk and confirm the dashboard loads.
set -euo pipefail
cd "$(dirname "$0")/.."

DEST="${1:-${BACKUP_DIR:-./backups}}"
mkdir -p "$DEST"
TS=$(date +%Y%m%d-%H%M)
FILE="$DEST/kirayapro-backup-$TS.db"
# Resolve to an absolute path (an absolute DEST must not get $PWD prepended).
case "$FILE" in /*) FILE_ABS="$FILE" ;; *) FILE_ABS="$PWD/$FILE" ;; esac
DB="prisma/dev.db"

[ -f "$DB" ] || { echo "ERROR: $DB not found (run from the project root)"; exit 1; }

sqlite3 "file:$PWD/$DB" ".backup $FILE_ABS"

if ! sqlite3 "$FILE_ABS" "PRAGMA integrity_check;" | grep -q "^ok$"; then
  echo "ERROR: backup failed integrity check: $FILE_ABS"
  exit 1
fi

echo "Backup OK: $FILE_ABS ($(stat -c%s "$FILE_ABS") bytes)"
sqlite3 "$FILE_ABS" "SELECT 'bills', COUNT(*) FROM Bill UNION ALL SELECT 'payments', COUNT(*) FROM Payment UNION ALL SELECT 'tenants', COUNT(*) FROM Tenant UNION ALL SELECT 'notifications', COUNT(*) FROM Notification;"
