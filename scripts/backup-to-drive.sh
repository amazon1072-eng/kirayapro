#!/usr/bin/env bash
# KirayaPro — daily off-machine backup: local SQLite backup -> Google Drive.
#
# Usage:
#   ./scripts/backup-to-drive.sh            # backup + upload + verify-download + prune
#   ./scripts/backup-to-drive.sh --no-verify # skip the download-back-and-verify step
#
# What it does:
#   1. Runs ./scripts/backup.sh (hot sqlite3 .backup, safe while server runs).
#      Local backups are NEVER deleted by this script.
#   2. Resolves the Drive folder "KirayaPro Backups" (creates it under My Drive
#      root on first run; its ID is cached in scripts/.drive-backup-folder-id).
#   3. Uploads the new backup file into that folder (same filename).
#   4. Downloads the just-uploaded file back from Drive and runs
#      scripts/backup-verify.ts against the downloaded copy, proving the
#      off-machine copy actually restores (counts + totals must match the
#      live DB). The downloaded temp copy is deleted afterwards.
#   5. Retention: keeps the newest 14 backups in the Drive folder; older ones
#      are moved to Trash (NOT permanently deleted — recoverable from Drive
#      trash). Local retention is unchanged (nothing is deleted locally).
#
# Requirements: Google Drive connected in Muse
#   (/opt/hatch/bin/hatch_gws_cli drive status -> "connected").
#   If Drive is not connected this script exits non-zero and prints the
#   connect link — it never silently falls back to local-only.
#   First upload may ask the owner for an approval card; that is a one-time
#   user step, not something this script can bypass.
#
# No secrets are used or logged by this script. The backup file is sent only
# to the owner's own Google Drive folder above — nowhere else.
set -euo pipefail
cd "$(dirname "$0")/.."

GWS="/opt/hatch/bin/hatch_gws_cli"
FOLDER_NAME="KirayaPro Backups"
FOLDER_ID_FILE="scripts/.drive-backup-folder-id"
RETENTION_KEEP=14
VERIFY=1
[ "${1:-}" = "--no-verify" ] && VERIFY=0

log() { echo "[backup-to-drive $(date +%H:%M:%S)] $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

# --- 0. Drive must be connected ------------------------------------------------
STATUS_JSON="$("$GWS" drive status 2>&1)" || fail "drive status failed: $STATUS_JSON"
echo "$STATUS_JSON" | grep -q '"status":"connected"' \
  || fail "Google Drive is not connected. Connect it first: https://agent.meta.ai/connectors/connect/google_drive (status output: $STATUS_JSON)"

# --- 1. Local backup ------------------------------------------------------------
log "Running local backup..."
BACKUP_OUT="$(./scripts/backup.sh ./backups)"
echo "$BACKUP_OUT"
BACKUP_FILE="$(echo "$BACKUP_OUT" | sed -n 's/^Backup OK: \(.*\) ([0-9]* bytes)$/\1/p' | head -n1)"
[ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ] \
  || fail "could not determine the new backup file from backup.sh output"
BACKUP_NAME="$(basename "$BACKUP_FILE")"
log "Local backup: $BACKUP_FILE ($(stat -c%s "$BACKUP_FILE") bytes)"

# --- 2. Resolve the Drive folder ------------------------------------------------
FOLDER_ID="${KIRAYAPRO_DRIVE_FOLDER_ID:-}"
if [ -z "$FOLDER_ID" ] && [ -f "$FOLDER_ID_FILE" ]; then
  FOLDER_ID="$(tr -d '[:space:]' < "$FOLDER_ID_FILE")"
fi
if [ -z "$FOLDER_ID" ]; then
  log "Looking for existing Drive folder '$FOLDER_NAME'..."
  FOLDER_ID="$("$GWS" drive files list --params "{\"q\":\"name = '$FOLDER_NAME' and mimeType = 'application/vnd.google-apps.folder' and trashed=false\",\"pageSize\":5,\"fields\":\"files(id,name)\"}" \
    | jq -r '.files[0].id // empty')"
fi
if [ -z "$FOLDER_ID" ]; then
  log "Folder not found — creating '$FOLDER_NAME' under My Drive root..."
  FOLDER_ID="$("$GWS" drive files create --params '{"ignoreDefaultVisibility":true}' \
    --json "{\"name\":\"$FOLDER_NAME\",\"mimeType\":\"application/vnd.google-apps.folder\",\"parents\":[\"root\"]}" \
    | jq -r '.id // empty')"
  [ -n "$FOLDER_ID" ] || fail "could not create Drive folder '$FOLDER_NAME'"
  log "Created Drive folder '$FOLDER_NAME' (id stored in $FOLDER_ID_FILE)"
fi
printf '%s' "$FOLDER_ID" > "$FOLDER_ID_FILE"
log "Drive folder: $FOLDER_NAME"

# --- 3. Upload ------------------------------------------------------------------
log "Uploading $BACKUP_NAME to Drive..."
UPLOAD_JSON="$("$GWS" drive +upload "$BACKUP_FILE" --parent "$FOLDER_ID" --name "$BACKUP_NAME")"
echo "$UPLOAD_JSON" | jq . >/dev/null 2>&1 || fail "upload returned non-JSON output: $UPLOAD_JSON"
UPLOADED_ID="$(echo "$UPLOAD_JSON" | jq -r '.id // .files[0].id // empty')"
if [ -z "$UPLOADED_ID" ]; then
  # Fall back to finding the newest file with this exact name in the folder.
  sleep 2
  UPLOADED_ID="$("$GWS" drive files list --params "{\"q\":\"'$FOLDER_ID' in parents and name = '$BACKUP_NAME' and trashed=false\",\"pageSize\":5,\"orderBy\":\"createdTime desc\",\"fields\":\"files(id,name,createdTime)\"}" \
    | jq -r '.files[0].id // empty')"
fi
[ -n "$UPLOADED_ID" ] || fail "upload may have succeeded but the uploaded file id could not be determined; check the Drive folder manually. Upload output: $UPLOAD_JSON"
log "Uploaded to Drive (file id recorded in log only, not shared further)."

# --- 4. Download back + verify the off-machine copy -----------------------------
if [ "$VERIFY" = "1" ]; then
  DL_COPY="backups/.verify-download-$BACKUP_NAME"
  log "Downloading the Drive copy back to verify it restores..."
  "$GWS" drive files get --params "{\"fileId\":\"$UPLOADED_ID\",\"alt\":\"media\"}" --output "$PWD/$DL_COPY" \
    || fail "could not download the uploaded backup from Drive"
  [ "$(stat -c%s "$DL_COPY")" = "$(stat -c%s "$BACKUP_FILE")" ] \
    || log "WARNING: downloaded size differs from local backup — verify step will confirm content"
  log "Verifying downloaded copy with backup-verify.ts..."
  DATABASE_URL="file:$PWD/$DL_COPY" npx tsx scripts/backup-verify.ts
  rm -f "$DL_COPY"
  log "Downloaded copy verified OK — off-machine backup restores."
else
  log "Verify step skipped (--no-verify)."
fi

# --- 5. Retention: keep newest 14 in Drive, trash older -------------------------
log "Applying Drive retention (keep newest $RETENTION_KEEP, trash older)..."
LIST_JSON="$("$GWS" drive files list --params "{\"q\":\"'$FOLDER_ID' in parents and trashed=false\",\"pageSize\":100,\"orderBy\":\"createdTime desc\",\"fields\":\"files(id,name,createdTime)\"}")"
TOTAL="$(echo "$LIST_JSON" | jq -r '.files | length')"
if [ "$TOTAL" -gt "$RETENTION_KEEP" ]; then
  echo "$LIST_JSON" | jq -r ".files[$RETENTION_KEEP:] | .[] | .id" | while read -r OLD_ID; do
    [ -n "$OLD_ID" ] || continue
    "$GWS" drive files update --params "{\"fileId\":\"$OLD_ID\"}" --json '{"trashed":true}' >/dev/null \
      && log "Trashed older Drive backup (recoverable from Drive trash)."
  done
else
  log "Drive folder holds $TOTAL backup(s) — nothing to prune."
fi

log "DONE: $BACKUP_NAME is backed up locally and in Google Drive ('$FOLDER_NAME')."
