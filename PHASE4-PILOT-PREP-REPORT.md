# KirayaPro — Phase 4 Pilot Preparation Report

**Date:** 15 Nov 2026 · **Build:** local only, NOT live · **Port:** 3200
**Scope:** pilot preparation for a controlled 30-day pilot with 3 real property owners. Each workstream appends its own headed section below. No app code is changed by this phase unless a workstream says so explicitly.

---

## Workstream 5 — Simple Owner Onboarding + Pilot Runbook

**Date:** 15 Nov 2026 · **Status:** COMPLETE · **App code changed:** none (guides and runbook only)

### What was delivered

1. **Pilot Onboarding Guide** — `work/PILOT-ONBOARDING-GUIDE.md` (~5 KB, one page)
   A one-page guide for a non-technical property owner, in plain language with no jargon. Nine numbered steps, each with where to click, what to expect, and what "done" looks like: (1) create org + pick management type (Residential / Commercial / Housing Society / Portfolio / Market-Union); (2) add properties and units with rents (Properties & Units → Add property / Add unit); (3) add tenants + agreements (Tenants → Add tenant); (4) check charges — rent comes from the unit, other charges inheritable org → property → unit, untick what a unit never pays, old bills never change; (5) generate first bills — Preview bills, read every amount, then Confirm & generate (a bill can never be generated twice for the same unit and month); (6) invite the accountant (Settings → Team & roles → Add a team member) with an explicit can/cannot list — accountant CAN generate bills, verify payments, issue receipts and record expenses; CANNOT delete/cancel bills, void receipts, or manage roles/team (Owner/Admin only); (7) share each tenant's own portal link and how tenants pay (amount, JazzCash/Easypaisa/bank, reference, proof photo) — tenants see only their own bill; (8) verify a payment + issue a receipt (Payment Verification → Approve issues receipt KP-2026-xxxx automatically, Reject needs a reason; part payments leave the rest on the bill); (9) send the first reminder (Send Reminder Again button; today a manual wa.me WhatsApp link, recorded in Reminders, 24h cooldown, Owner-only override). Ends with the "stuck?" rule: write down the step, what was clicked, what was seen, send a screenshot to Said, never delete anything to "fix" it.
   All labels, button texts, routes and permission rules were verified against the actual code (`components/ui.tsx`, `components/forms.tsx`, `app/*/page.tsx`) and the Phase 3 report — nothing was invented.

2. **Pilot Runbook** — `work/PILOT-RUNBOOK.md` (~7 KB)
   For a controlled 30-day pilot with 3 real owners, not a public launch: (i) feedback log format (date, owner, what they said/did, severity, status) with an empty starter table and a severity guide, stored at `work/pilot-feedback-log.md` from day 1; (ii) bug triage process — record same day, reproduce on demo, Muse fixes (owners never touch code/DB), owner told directly on WhatsApp with one thing to retry, status only becomes "Fixed" after the owner confirms; response targets Critical same day (pilot pauses for that owner), High within 2 days, Medium/Low within the week; (iii) weekly check-in summary template (week number, what each owner did, bugs found/fixed, top feedback in owners' own words, go/no-go notes, next week) plus a 3-question weekly check-in per owner; (iv) pilot exit criteria — 30 days done, no Critical bugs open, no High bug without an owner-accepted workaround, each owner completes the full loop unaided (property → charges → bills → portal payment → verification/receipt → reminder), money reconciles against owners' own records, daily backups ran and one restore was tested, owners confirm they would keep using it; (v) what NOT to do — no public launch, no new owners, no real-money promises (price/date/data carry-over), backups daily with off-machine copy, no mid-pilot live deploy without Said's approval + fresh backup + clean rebuild, no WABA/bank promises (manual wa.me only, neither connected), no deleting pilot data, no new features during the pilot (bug fixes only).

### Recommendation — in-app onboarding checklist (out of scope, for a later safe edit)

The optional in-app checklist was NOT built in this workstream (guides only, no code change). Recommendation for a later edit: add a small dismissible "Getting started" card at the top of the **Dashboard** (`app/dashboard/page.tsx`, above the summary figures, Owner/Admin only), listing the same 9 steps as checkmarks that tick off automatically when the underlying data exists (org created → property exists → unit with rent exists → tenant exists → charges checked → first bill generated → accountant invited → portal payment received → payment approved → reminder sent). Exact card text: heading **"Getting started — your first month"**, subtext **"Tick these off in order. Each step takes a few minutes — the full guide is with Said if you get stuck."**, steps labelled exactly as in the Onboarding Guide steps 1–9, with a **"Hide this card"** dismiss button. Each step links to its page (Properties & Units, Tenants, Billing, Settings, Payment Verification, Reminders). Do not auto-mark step 4 (charges) complete — it needs an explicit "I've checked the charges" button, since there is no data signal for "checked". Keep it out of the tenant portal and off mobile-critical space (collapsible on 390px).

### Open items / dependencies

- Pilot access method (how owners reach the local-only app on a real phone) is decided by Workstream 1 — the runbook assumes it works.
- Off-machine backup location (Google Drive) is set up by Workstream 2 — until then backups live only in `./backups`.
- The feedback log file `work/pilot-feedback-log.md` should be created from the runbook's table on pilot day 1.

---

## Workstream 2 — Automatic daily backups with off-machine location

**Status: BLOCKED — Google Drive is not connected. No off-machine copy exists yet.**
**Work done:** 15 Nov 2026, ~11:31 PKT (Sun). Local backup side re-proved; upload pipeline script written and syntax-checked; it refuses to run until Drive is connected (by design — no silent local-only fallback).

### Blocker — exact evidence

```
$ /opt/hatch/bin/hatch_gws_cli drive status
{"ok":true,"status":"not_connected","connect_url":"https://agent.meta.ai/connectors/connect/google_drive","reason":"google_drive is not connected"}
```

Running the new pipeline script fails cleanly at its first check (exit 1, no backup taken, nothing uploaded):

```
ERROR: Google Drive is not connected. Connect it first: https://agent.meta.ai/connectors/connect/google_drive
(status output: {"ok":true,"status":"not_connected","connect_url":"https://agent.meta.ai/connectors/connect/google_drive","reason":"google_drive is not connected"})
```

**Unblock step (Said, one tap):** [Connect Google Drive](https://agent.meta.ai/connectors/connect/google_drive) — sign in with his Google account in the browser. No password or key is needed from him beyond that sign-in, and no credential is stored anywhere by this workstream. Once connected, the first run of the script below creates the folder, uploads, verifies, and prunes — no other setup is needed.

### What was built (ready to run the moment Drive connects)

- **Script:** `scripts/backup-to-drive.sh` (executable, `bash -n` syntax-checked). It does, in order:
  1. Checks `drive status` — exits non-zero with the connect link if Drive is not connected.
  2. Runs `./scripts/backup.sh ./backups` (hot `sqlite3 .backup`, safe while the server runs). **Local backups are never deleted.**
  3. Resolves the Drive folder **"KirayaPro Backups"** — searches Drive for it, creates it under My Drive root (`parents: ["root"]`, `ignoreDefaultVisibility: true`) if missing, and caches its ID in `scripts/.drive-backup-folder-id` (override with env `KIRAYAPRO_DRIVE_FOLDER_ID`). The folder does **not** exist yet — it is created on the first successful run.
  4. Uploads the new backup file into that folder (`drive +upload <abs path> --parent <folderId> --name <same filename>`).
  5. **Self-proving upload:** downloads the just-uploaded file back from Drive and runs `scripts/backup-verify.ts` against the downloaded copy; the temp copy is deleted afterwards. A run only reports success when the off-machine copy verifies.
  6. **Retention:** keeps the newest **14** daily backups in the Drive folder; older ones are moved to **Trash** (recoverable from Drive trash — never permanently deleted). Nothing is deleted until this rule runs, and nothing is ever deleted locally by this script.
- **No secrets** in the script or logs. The backup file is sent only to the owner's own Google Drive folder above — nowhere else.

### Local side re-proved today (15 Nov 2026, 06:31 PKT)

```
$ ./scripts/backup.sh ./backups
Backup OK: /home/hatch/workspace/kirayapro/./backups/kirayapro-backup-20261115-0631.db (524288 bytes)
bills 4, payments 4, tenants 8, notifications 9

$ DATABASE_URL="file:/home/hatch/workspace/kirayapro/backups/kirayapro-backup-20261115-0631.db" npx tsx scripts/backup-verify.ts
counts: orgs 1, users 2, properties 3, units 9, tenants 8, bills 4, payments 4, notifications 9, customRoles 0
totals: billed 245100, approved 130300, outstanding 114800
spotBill: 2026-10, House 12-A, Ahmed Raza, Rs. 90,300, Paid, 5 items
```

Totals match the Phase 3 reference exactly (billed 245,100 / approved 130,300 / outstanding 114,800). This file (`kirayapro-backup-20261115-0631.db`, 524,288 bytes) is the ready-to-upload copy for the first Drive run. The older Phase 3 backup (`kirayapro-backup-20261114-2104.db`, 438,272 bytes) is untouched in `./backups/`.

### Drive evidence — NOT YET AVAILABLE (blocked)

No Drive folder, no Drive file, no upload/download evidence exists yet — the connection step above is the only thing missing. After the first successful run, record here: folder ID, uploaded file name + size, download-back verify output (must show the same totals as above).

### Daily schedule — NOT created yet (deliberate; exact text for the coordinator)

The cron job was **not** created now, because every run would fail until Said connects Drive. Create it **immediately after** the Drive connection is confirmed and the first manual `./scripts/backup-to-drive.sh` run succeeds. Exact job definition for the coordinator:

- **Job id:** `kirayapro-daily-backup`
- **Title:** `KirayaPro daily backup to Google Drive`
- **Owner:** `goal:kirayapro-property-management-saas`
- **Mode:** `task`, **enabled:** `true`
- **Schedule:** daily, `time: 03:00`, `flexible_time: true`, timezone: user's current (PKT) — i.e. ~03:00 PKT every day
- **Body (verbatim):**
  > KirayaPro daily off-machine backup. Run `/home/hatch/workspace/kirayapro/scripts/backup-to-drive.sh` from `~/workspace/kirayapro` and check its output. The script takes a fresh local backup, uploads it to the Google Drive folder "KirayaPro Backups", downloads it back and verifies it with backup-verify.ts, then trashes Drive backups older than the newest 14 (local backups are never deleted). If the script reports Google Drive is not connected, do NOT fall back to local-only: report the blocker and the connect link (https://agent.meta.ai/connectors/connect/google_drive) so Said can connect Drive, and note the backup is local-only that day. If the upload or the download-back verification fails, report the exact error and the last good Drive backup date. On success, append one line to `workspace/goals/kirayapro-property-management-saas/hidden_files/backup-daily-log.md` with the date, backup filename, size, and verified totals (expect billed 245100 / approved 130300 / outstanding 114800 on the demo org). No chat report is needed on a successful run; report failures promptly.
- **First run after creation:** verify the next morning's run appears in the log file above.

Note: the first upload may present Said with a one-time approval card (Drive uploads ask by default). That is a user step, not something the script can bypass — if a daily run stalls on approval, that is what to check.

### Retention rule (implemented in the script, not yet executed)

Keep the **newest 14 daily backups** in the Google Drive folder "KirayaPro Backups". Older files are moved to Drive **Trash** (recoverable), never permanently deleted. Local `./backups/` retention is unchanged — nothing is ever deleted locally by this pipeline.

### Restore-from-Drive procedure (exact commands)

Use when the live `prisma/dev.db` is lost or corrupt. Do not skip the verify steps.

```bash
cd ~/workspace/kirayapro

# 1. Find the newest backup in the Drive folder
FOLDER_ID="$(cat scripts/.drive-backup-folder-id)"
/opt/hatch/bin/hatch_gws_cli drive files list --params "{\"q\":\"'$FOLDER_ID' in parents and trashed=false\",\"pageSize\":50,\"orderBy\":\"createdTime desc\",\"fields\":\"files(id,name,createdTime,size)\"}"

# 2. Download the newest file (replace <file-id> with the id from step 1)
/opt/hatch/bin/hatch_gws_cli drive files get --params '{"fileId":"<file-id>","alt":"media"}' --output "$PWD/backups/restore-from-drive.db"

# 3. Verify the downloaded copy BEFORE touching the live DB
DATABASE_URL="file:$PWD/backups/restore-from-drive.db" npx tsx scripts/backup-verify.ts
#    Expect on the demo org: billed 245100 / approved 130300 / outstanding 114800,
#    spot bill 2026-10 House 12-A Ahmed Raza Rs. 90,300 Paid, 5 items.
#    If this fails, STOP — do not restore a bad copy; try the previous day's backup.

# 4. Stop the server (kill next-server by PID; pkill -f "next start" does NOT match it)

# 5. Keep the broken file, just in case
cp prisma/dev.db "prisma/dev.db.broken-$(date +%Y%m%d-%H%M)"

# 6. Restore the downloaded backup over the live file
cp backups/restore-from-drive.db prisma/dev.db

# 7. Verify the restored live file
DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/backup-verify.ts
#    Expect the same totals as step 3.

# 8. Start the server and check
npm start
#    Log in as demo@kirayapro.pk and confirm the dashboard loads.
```

Caveat (same as Phase 3): a backup is a point-in-time snapshot — anything entered after the backup time is lost on restore.

### Next-best off-machine option (if Drive connection stays unavailable)

Do **not** settle for local-only. Stopgap until Drive is connected: after each `./scripts/backup.sh` run, upload the newest file manually at drive.google.com into a "KirayaPro Backups" folder from Said's own computer/phone (same file, same folder name — the script will pick it up once connected). If Google Drive is refused long-term, the fallback is a second physical copy: copy the daily backup to a USB drive or a second computer (rsync) kept away from this machine — that needs Said's involvement and has no automation yet, so Drive remains the planned primary.

### Open items for this workstream

1. Said connects Google Drive (one tap, link above).
2. First manual run: `./scripts/backup-to-drive.sh` — must show upload + download-back verify OK with totals 245,100 / 130,300 / 114,800.
3. Coordinator creates cron `kirayapro-daily-backup` (~03:00 PKT daily) after step 2 succeeds; confirm the first scheduled run lands in `workspace/goals/kirayapro-property-management-saas/hidden_files/backup-daily-log.md`.
4. After 15+ days, confirm retention actually trashed the 15th-oldest backup (Drive trash, recoverable).

---

## Workstream 3 — Test Actual WhatsApp Reminders — DONE (15 Nov 2026)

**Verdict: MANUAL wa.me FLOW RE-VERIFIED (33/33 PASS). REAL WABA SEND: NOT TESTED — IMPOSSIBLE UNTIL CREDENTIALS EXIST.**

### The one sentence that matters

**No real WhatsApp message was sent, and no real WhatsApp message can be
tested, until the owner completes the WABA setup** (WhatsApp Business account,
verified business, registered number, approved templates, token + phone number
ID). Do not claim a live send was tested. What was tested and passed is the
manual wa.me flow — the link is generated and logged, a person taps it to send
from their own phone.

### (a) Manual wa.me re-verification — 33/33 PASS

Fresh test org, then deleted afterwards. Script: `/tmp/kp-phase4-waba.mjs`.
Server running on the final Phase 3 build, `WHATSAPP_PROVIDER=manual`.

Setup: owner registers org "P4 WABA Test Org" → property "P4 Test House" →
unit W-1 (rent Rs. 40,000) → tenant "P4 Test Tenant", phone `03001234567`,
agreement ends in 25 days → Nov 2026 bill generated (Rs. 40,000, Unpaid) →
accountant + manager users created.

| # | Check | Result |
|---|---|---|
| 1–5 | Register org, property, unit, tenant, generate Nov 2026 bill | PASS (bill Rs. 40,000, Unpaid — DB-verified; generate returns only unitNo + portalUrl, so the bill id was resolved from the DB, a known test-script quirk from Phase 3, not an app bug) |
| 6–8 | Create accountant + manager, accountant login | PASS |
| 9 | Accountant `POST /api/reminders/send` `{type: "rent_due", billId}` | **PASS — 200**, `provider: manual`, `status: manual_link`, `waLink: https://wa.me/923001234567?text=Assalam-o-Alaikum P4 Test Tenant, your KirayaPro bill for November 2026 is Rs. 40,000 (P4 Test House — W-1). Remaining: Rs. 40,000. Please pay and share proof. …` |
| 9g | `nextReminderDate` = lastSent + 24h | PASS (last 2026-11-15T06:32:35.639Z → next 2026-11-16T06:32:35.639Z, exact) |
| 10 | `GET /api/reminders/history` | PASS — ReminderLog row present: `channel: manual`, `status: manual_link`, `type: rent_due`, tenant/phone correct, `billId` correct, `reference: 2026-11`, `sentByName: P4 WABA Accountant`; summary row carries Last Sent + Next Date |
| 11 | Second send within 24h | **PASS — 409** with last-sent time + next date; ReminderLog count unchanged (1 → 1, no new row) |
| 12 | Manager reminder send | **PASS — 403** |
| 13 | Unauthenticated send | **PASS — 401** |

**Total: 33 passed, 0 failed** (one intermediate run failed only because the
test script read the bill id from the generate response, which does not
contain it — script bug, fixed; the app was never at fault).

**Proof no real message was sent:**

- The test script never requests any `wa.me` URL — the link is generated and
  inspected as text only. Nothing was opened against WhatsApp.
- DB check after the send: `WhatsAppMessage` row for the test org is exactly
  1, `provider: manual, status: manual, templateName: (none)` — a link log,
  not a send.
- `WABA_PHONE_NUMBER_ID` is empty in `.env`, so the WABA code path cannot
  run at all; `whatsappStatus()` would report `not_configured`.

**Cleanup:** test org deleted with `scripts/cleanup-test-orgs.ts` (verified:
0 orgs named "P4 WABA Test Org", 0 ReminderLog rows, 0 WhatsAppMessage rows
left). Demo org untouched: 4 bills, 0 reminder logs — same as pristine.
Server left RUNNING on :3200 (landing 200).

### (b) WABA setup checklist — written

File: `work/WABA-SETUP-CHECKLIST.md` — simple ordered steps for the owner:

1. WhatsApp Business account + Meta Business verification (documents, a few days).
2. Register the business phone number (must not be in use in the WhatsApp app).
3. Create and get approval for the two **Utility** templates, with the exact
   variables the code sends — `kirayapro_bill_due`: 4 variables (tenant name,
   bill total, due date, payment link); `kirayapro_agreement_expiry`:
   2 variables (tenant name, agreement end date). Includes what to do if a
   template is rejected (fix only what Meta flagged, keep variable count/order,
   manual wa.me keeps working meanwhile).
4. Get the permanent access token + phone number ID and hand them over **via
   the secure vault only** — never in chat or files.
5. What to send back to Muse so the config can be switched on (exact message
   included) and what Muse will do (`.env` + restart + test).
6. What the real test send will look like (test tenant on a number the owner
   controls, message arrives from the business number, ReminderLog
   `channel: waba, status: sent` + Meta message ID) and what Meta charges:
   **USD 0.0150 per delivered Utility message to a +92 number** (Meta rate
   card effective 1 Oct 2026, checked 15 Nov 2026 — re-check at billing time;
   roughly Rs. 4–5/message; ~100 reminders/month ≈ USD 1.50). Marketing is
   USD 0.0473 — another reason the templates must stay Utility.

### What is still open (not misread as done)

- **No WABA credentials exist.** The real send test is blocked on the owner,
  not on the code. The code path is ready and honest (503 `not_configured`
  without credentials, proven in Phase 3 §5).
- The manual wa.me method is what actually works today and is what the pilot
  will use until WABA is set up.
- A failed WABA attempt counts toward the 24h cooldown (Phase 3 finding) —
  noted in the checklist so the first real test is done carefully.

---

## Workstream 4 — Permissions + Data Privacy Verification

**Date:** 15 Nov 2026 · **Status:** COMPLETE — **220/220 checks PASS on the fixed build** · **App code changed:** yes, two small security fixes (below) + `.gitignore` (new file)

Test script: `/tmp/kp-phase4-perm.mjs` (re-run log: `/tmp/kp-phase4-run3.log`).
Method: fresh throwaway orgs (Org A Business-plan with 1 property / 1 unit / 1 tenant / 15 bills, Org B as cross-org "attacker", Org C fresh/empty), all deleted afterwards; demo org untouched throughout. Before the fixes the same suite was **208/211** — the 3 failures were all one real bug (charges). Two further bypasses were found by probing, fixed, and re-proved.

### (a) Permission matrix — PASS (all four built-in roles + custom roles)

| Action | Owner | Admin | Manager | Accountant | Custom role |
|---|---|---|---|---|---|
| View bills / preview (`bills.view`) | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | only if granted |
| Generate bills | ✅ 200 | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| Verify payments / issue receipts | ✅ 200 | ✅ 200 | ❌ 403 | ✅ 200 | ❌ 403 |
| Delete a bill | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 |
| Cancel / void a bill | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 |
| Void an issued receipt (`financial.adjust`) | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 |
| Create/edit custom roles, assign roles | ✅ 201 | ✅ 201 | ❌ 403 | ❌ 403 | ❌ 403 |
| Create team members / org settings | ✅ 201/200 | ✅ 201/200 | ❌ 403 | ❌ 403 | ❌ 403 |
| Send reminders (`reminders.send`) | ✅ 200 | ✅ 200 | ❌ 403 | ✅ 200 | only if granted (200 with, 403 without) |
| Reminder override (inside 24h) | ✅ 200 | ✅ 200* | ❌ 403 | ❌ 403 | ❌ 403 |
| Union create / members / fees | ✅ 201 | ✅ 201 | ✅ 201 (has `union.manage`) | ❌ 403 | ❌ 403 |
| Generate notifications | ✅ 200 | ✅ 200 | ❌ 403 | ❌ 403 | ❌ 403 |
| Change charges | ✅ 200 | ✅ 200 | ❌ 403 (fixed) | ❌ 403 | ❌ 403 (fixed) |
| Create expenses | ✅ 201 | ✅ 201 | ❌ 403 | ✅ 201 | — |

\* Admin override verified in Phase 3; owner override re-proved here (200, `override=1` in `ReminderLog`). Guards re-proved: delete/cancel a bill with an Approved payment → 409; void of a voided receipt → 409; resend inside 24h → 409 (no new log row); reminder on Paid/Cancelled/unknown bill → 409/404; bad reminder type → 400; reject without reason → 400. Receipt issued on approval: `KP-2026-0003`. **DB-smuggled bypass re-proved:** a custom role with `bills.delete`, `bills.cancel`, `financial.adjust`, `roles.manage`, `users.manage`, `settings.manage` written directly into the DB still gets 403 on delete, cancel, void and role-create (read-time filter in `effectivePermissions()` works); its `bills.view` still works (200). API also refuses restricted permissions on role create/PATCH (403).

**Unauthenticated: 16/16 routes return 401** — billing generate, reminders send, reminders history, union create, notifications generate, bill delete, bill cancel, payment verify, payment void, union report, notifications list, charges, org settings, roles list, users create, CSV report.

### (b) Fixes made in this workstream (small, safe, re-tested)

**Fix 1 — Manager / custom-role users could change billing charges (REAL BUG, found by this suite).**
`POST /api/charges` only blocked `role === "ACCOUNTANT"`, so Manager and any custom-role user (even one with zero permissions) got 200 and could change charge amounts, contradicting the Phase 3 matrix (Owner/Admin only). Fixed by gating on the restricted permission `settings.manage` (`app/api/charges/route.ts`), which Owner/Admin hold and custom roles can never hold. Re-tested: manager, custom-with, custom-without, custom-none and ADMIN+viewer-custom all → 403; owner/admin → 200.

**Fix 2 — A custom role did not actually limit an ADMIN user (privilege-escalation inconsistency).**
Five routes checked the raw built-in role via `canManageOrg(user.role)` — org settings, notification engine, bill link issue, bill link revoke, demo-data management — so a user created as ADMIN and then given a viewer-only custom role still passed all five (proved live: 200 on all three probed), even though the settings page promises a custom role gives "exactly the permissions you choose" and `lib/permissions.ts` documents custom-role users as getting ONLY their role's permissions. The built-in role is kept when a custom role is assigned (UI `AssignRoleSelect` never changes it), so this was reachable from the normal UI, not just the API. Fixed with `canManageOrgUser(user)` in `lib/auth.ts` (custom role set + not OWNER → no admin powers; OWNER always keeps full access, matching the role-assignment rule), applied to the 5 API routes, the reminder-cooldown override gate + `canOverride` flag (`app/api/reminders/send/route.ts`), and the Settings page admin gating (`app/settings/page.tsx`). Re-tested: ADMIN+viewer-custom → 403 on org settings, notifications generate, bill reissue, bill revoke, charges; ADMIN+`reminders.send`-custom → send 200 but override 403. UI spot-check (`/tmp/kp-phase4-ui.mjs`): as ADMIN+viewer-custom the Settings page loads (200) but no longer shows the Add-team-member or Create-role forms; the team list stays visible.

`npm run lint` PASS (0 errors, 0 warnings) and clean `npm run build` (`rm -rf .next && npm run build`) PASS after the fixes; server restarted on :3200 with the fixed build (landing 200, login 200). Full suite re-run on the fixed build: **220/220 PASS**.

### (c) Org-scoping / data-privacy audit — PASS

Cross-org attempts by Org B's owner against Org A's data — **all refused with no data leaked**: DELETE bill → 404, cancel bill → 404, verify payment → 404, void payment → 404, reminder on foreign bill → 404, charges for foreign unit → 404, union report → 404, PATCH union → 404, add union member → 404, union fees generate → 404, bill reissue → 404, expense invoice download → 404, payment proof download → 404. Read endpoints return only the caller's own org: reminders history, notifications and CSV contain no Org A tenant name/phone; union members for a foreign union → 200 with an empty list; billing preview with a foreign propertyId → 200 with an empty bills list. **Tenant portal token isolation:** Org A token returns only Org A's bill (tenant name matches, no Org B data); random token → 404; token of a cancelled bill → 404; proof download with the matching token → 200, with another bill's token or another bill's payment → 404. File downloads are org-scoped and path-validated (`uploads/proofs`, `uploads/invoices` only).

**Demo vs real separation:** demo org (`isDemo=1`) still 8 tenants / 4 bills, untouched; a fresh real org (Org C) starts completely empty (0 tenants / 0 bills / 0 properties); Org A had zero demo-flagged rows and no demo tenant names. All 3 test orgs + the UI-check org deleted afterwards (0 left); demo login still 200.

### (d) PII inventory — what is stored, where, who can see it

Stored personal data (SQLite `prisma/dev.db`, local file only): **Tenant** — full name, phone, CNIC, address, emergency contact name/phone; **UnionMember** — full name, phone, CNIC; **User** — full name, email, phone, bcrypt password hash (never rendered in any page/API — verified by grep; only written at user creation); **Organization** — contact name/phone, address; **Payment** — method, transaction reference, proof file under `uploads/proofs/`; **ReminderLog / WhatsAppMessage** — tenant name + phone; **Notification** bodies — tenant names + amounts. Session tokens are random 32-byte values, SHA-256 hashed in the DB, httpOnly cookie (`sameSite: lax`, 7-day expiry; `secure` only in production). **Who can see what:** every read/write is scoped by `organizationId` (proved in §c); within an org, any logged-in role can read bills/tenants/notifications (org-scoped reads have no per-role gate on `GET /api/notifications`, `GET /api/settings/roles`, `GET /api/reminders/history`, `GET /api/charges` — read-only, no cross-org leak, noted not fixed); destructive/financial actions are Owner/Admin-only per the matrix above. The tenant portal token shows exactly one bill, never a list. **No PII or secret is logged:** zero `console.*` calls in `app/` + `lib/`; server log contains no session token, password or secret (grep 0 hits); `.env` md5 unchanged by testing (`230a7af8…`).

### (e) Secrets scan — PASS with one preventive fix

Repo grep (excluding `node_modules/`, `.next/`, `dev.db`) for live keys/tokens/private keys/API-key assignments: **no hits**. `.env` holds only `DATABASE_URL` (local SQLite file), `SESSION_SECRET` (set, 64 chars), `WHATSAPP_PROVIDER=manual`, and empty WABA fields (`WABA_ACCESS_TOKEN` empty, `WABA_PHONE_NUMBER_ID`/`WABA_BUSINESS_ID` empty). **Finding:** there was no git repo and no `.gitignore` at all, so nothing protected `.env` if the project is ever initialised as a repo. Fixed preventively: new `.gitignore` ignoring `.env`, `.env.*`, `node_modules/`, `.next/`, `prisma/dev.db`, `backups/`, `uploads/`, `work/screenshots/`. No code change needed for this; no secrets were committed anywhere (no repo exists).

### Privacy note (for the pilot)

**What is stored:** tenant names, phones, CNICs, addresses and emergency contacts; payment references and proof photos; staff names, emails and phones; reminder/WhatsApp logs with tenant names and phones — all in one local SQLite file on this machine, plus proof/invoice files under `uploads/`. Nothing is sent to any third party today (WhatsApp is manual wa.me links; WABA is not configured; no analytics). **Who can see what:** only users of the same organisation, and only what their role allows — owners/admins see and change everything; managers see bills/tenants/union but cannot touch money, roles or charges; accountants generate bills, verify payments and send reminders but cannot delete/cancel bills, void receipts, manage roles/team or change charges; custom roles see only the permissions the owner ticked, and (after Fix 2) a custom role now truly limits even an ADMIN-labelled user. Tenants see only their own bill via their own link. **What passed:** full matrix 220/220, 16/16 unauthenticated 401s, cross-org 404s with zero leakage, portal-token isolation, demo/real separation, no secrets in code or logs. **Must-fix-before-pilot items from this workstream:** none outstanding — the two bypasses found were fixed and re-proved in this same workstream. Remaining privacy notes (not blockers): org-internal reads (notifications, roles list, reminder history, charges) have no per-role gate — any team member in the org can read them; the pilot runs on this single local machine, so the SQLite file and `uploads/` folder are only as safe as the machine itself — the off-machine backup (Workstream 2) is what protects against loss, and it is still blocked on Said connecting Google Drive.

### Test-script errors (not app bugs)

Two intermediate-run failures were my own script's fault, fixed in the script: (1) the generate endpoint returns `bills`, not `createdBills` (the same trap Phase 3 warned about); (2) portal payment returns `paymentId`, not `payment.id`. One expectation was wrong, not the app: Manager creating a union returns 201 because `union.manage` is in the Manager's built-in permissions — correct per the permission map.

---

## Workstream 1 — Real Android Device Testing Prep — DONE (15 Nov 2026)

**Status: PREPARED — real-device pass itself stays with the owner (blocker below). No code changed by this workstream.**

### (a) Viewport tests (Playwright, Pixel 7 / Chrome Android UA, headless Chromium)

Full suite at 390px, plus overflow sweeps at 360px and 400px. 12 of 13 pages PASS with zero horizontal overflow (scrollWidth = clientWidth = 390): Login, Dashboard, Billing, Reminders, Notifications, Union, Properties, Tenants, Payments, Reports, Settings, Tenant portal.

**One real mobile issue found — bill-detail action-button row (NEW, not in Phase 3):** at 390px the bill-detail page measured scrollWidth 441 vs clientWidth 390. The `no-print flex items-start gap-2` action row (Print bill / WhatsApp par bhejo / Send Reminder Again / Cancel bill / Delete bill) had no `flex-wrap`, so it rendered 425px wide inside a 358px content area and the red Delete button was cut off at the right edge (screenshot 40). Note on method: Phase 3 compared `scrollWidth` to `window.innerWidth` and reported zero overflow everywhere — on bill-detail `innerWidth` itself inflates to 441 in mobile emulation, masking the problem; measuring against `documentElement.clientWidth` / `visualViewport` (390) exposes it. Phase 3's "zero overflow" verdict for bill-detail was a measurement artifact, not a pass. **Coordinator fix (after this workstream): `flex-wrap` added to that row (`app/billing/[id]/page.tsx`); clean rebuild; re-verified at 390px — scrollWidth = clientWidth, all buttons fully visible, screenshot 46. Lint + build PASS.**

Other checks: viewport meta `width=device-width, initial-scale=1` present on all pages; touch targets — 161 of 167 interactive elements are below the 44px guideline (systemic: nav links 36px, bell 32px, inputs 38px, primary buttons 40px; everything still tappable in emulation, mis-taps likely — flagged as a real-phone check, not a blocker); text legibility — 0 tiny-text nodes on login/portal, 1 node <12px each on billing/bill-detail/reminders/notifications/union, 5 on dashboard; tenant portal form — all 5 fields present, amount input stays in view when focused. Pre-existing: bill-history and union member tables scroll sideways inside their cards (page itself doesn't move). Phase 3's stale-CSS fix holds: amber Cancel button and red bell badge "9" render correctly.

Screenshots (390px, new 38–45): 38-dashboard, 39-billing, 40-bill-detail (shows the cut-off Delete button, pre-fix), 41-tenant-portal, 42-reminders, 43-login, 44-notifications, 45-union. Raw measurements: `/tmp/kp-p4/results.json`; scripts: `/tmp/kp-p4/mobile-test.mjs`, `recheck.mjs`, `probe-bill*.mjs`.

### (b) Real-device checklist

`work/PILOT-REAL-DEVICE-CHECKLIST.md` — 16 steps with pass/fail checkboxes: open link → owner login → dashboard → create test property/unit/tenant → generate bill → bill detail (flags the known Delete-button issue as Step 7 — now fixed, see above) → tenant portal link → submit payment → owner approve/receipt → send reminder + 24h duplicate-refusal check → reminder history → notifications → union → whole-phone check → clean up test entries. Each step states what "pass" looks like, plus a bug-notes table and an overall result box.

### (c) BLOCKER — the app is localhost-only

**The app runs only on this machine's localhost (`http://localhost:3200`). Said's phone cannot reach it yet — there is no link to open, and the checklist cannot be run until one exists.** Nothing was exposed: no tunnel, no deploy, no port-forward. Two options, with honest risks: (1) temporary tunnel (cloudflared/ngrok — quick, free; public link anyone with the URL can reach, login still required; dies when the tunnel/computer stops; test-only, not for real tenants); (2) staging deploy on a small VPS (proper, recommended for pilot; stable link, same server as the planned live host; needs his approval + ~$5–6/mo on his card).

Side effect to know: the reissue call during testing rotated the portal token for the demo Oct Unpaid bill (Rs. 50,300, Bilal Hussain) — its previous portal link no longer works; a fresh 30-day token was issued. Demo data only; token value not recorded.

---

## Coordinator synthesis — final state (15 Nov 2026)

### Per-item status

| # | Prep item | Status |
|---|---|---|
| 1 | Real Android device testing | **PREPARED, not passed** — viewport checks done (13 pages), checklist written, 1 real bug found + fixed by coordinator (bill-detail overflow, screenshot 46). The real-device pass itself is BLOCKED on the owner: the app is localhost-only; his phone cannot reach it until a tunnel or staging deploy exists. |
| 2 | Automatic daily backups, off-machine | **BLOCKED on the owner** — script built + syntax-checked, local backup re-proved today (245,100 / 130,300 / 114,800), cron text ready. No off-machine copy exists: Google Drive is not connected. One tap by Said unblocks it. |
| 3 | Actual WhatsApp reminders | **PREPARED** — wa.me flow re-verified 33/33 PASS. Real WABA send test BLOCKED on the owner: no WABA credentials exist; checklist written (templates, token via secure vault, USD 0.0150/message). No real message sent. |
| 4 | Permissions + data privacy | **DONE — 220/220 PASS.** Two real security bypasses found and fixed in-workstream (charges gate; custom role not limiting ADMIN). Zero cross-org leakage; 16/16 unauthenticated 401s; secrets scan clean; `.gitignore` added preventively. No must-fix items remain from this workstream. |
| 5 | Owner onboarding + pilot runbook | **DONE** — one-page onboarding guide + 30-day pilot runbook (feedback log, bug triage, weekly check-ins, exit criteria). In-app checklist recommended, not built. |

### Fixes made during Phase 4 (all verified, lint + clean build PASS)

1. **Bill-detail mobile overflow** (coordinator): `flex-wrap` on the action-button row — re-verified at 390px, all buttons visible, screenshot 46.
2. **Charges API gate** (WS4): Manager/custom users could change billing charges — now gated on `settings.manage`.
3. **Custom role not limiting ADMIN** (WS4): `canManageOrgUser()` in `lib/auth.ts` applied to 5 routes + override gate + Settings page.
4. **`.gitignore` added** (WS4): `.env`, `dev.db`, `backups/`, `uploads/` can never be committed.

### Final state verified by the coordinator

Server RUNNING on :3200 with the final fixed build (landing 200). Demo re-verified pristine via `backup-verify.ts` (absolute path — the relative-path invocation fails with a path-resolution error, not a data problem): 1 org, 2 users, 3 properties, 9 units, 8 tenants, 4 bills, 4 payments, 9 notifications, 0 custom roles, 0 reminder logs; totals billed 245,100 / approved 130,300 / outstanding 114,800; spot bill 2026-10 House 12-A Ahmed Raza Rs. 90,300 Paid. All test orgs deleted. No deploy. Local only.

### What the owner must do himself (in order)

1. **Choose pilot access** — temporary tunnel (free, test-only) or staging deploy on a VPS (~$5–6/mo, recommended). Until then, no real-phone test is possible.
2. **Connect Google Drive** (one tap: https://agent.meta.ai/connectors/connect/google_drive) — then first manual `./scripts/backup-to-drive.sh` run, then the coordinator/parent creates cron `kirayapro-daily-backup` (~03:00 PKT, keep newest 14).
3. **Run the real-device checklist** on his Android phone (`work/PILOT-REAL-DEVICE-CHECKLIST.md`) once access exists — 16 steps, pass/fail boxes.
4. **WABA setup** (only if real WhatsApp sends are wanted for the pilot): WhatsApp Business account + Meta verification + approved templates + token via secure vault (`work/WABA-SETUP-CHECKLIST.md`). Manual wa.me works meanwhile.
5. **Name the 3 pilot owners** so onboarding can start.

### Open items / honest caveats

- No real-phone test yet (blocked on item 1 above); touch targets are systemically <44px — usable but mis-tap-prone, verify on the real device.
- No off-machine backup yet (blocked on item 2); pilot data lives on this single machine until Drive connects.
- No real WABA send tested (blocked on item 4); no bank verification connected; bill-history/member tables still scroll sideways inside their cards on mobile (pre-existing).
- The demo Oct Unpaid bill's portal link changed (token rotated during WS1 testing) — demo data only.
- Clean rebuild (`rm -rf .next && npm run build`) remains required before any pilot deploy (stale-CSS lesson from Phase 3).

### Verdict

**Pilot preparation is complete except for the three owner-gated items above (access, Drive, WABA).** Everything verifiable from here passed: permissions/privacy 220/220, wa.me 33/33, mobile viewports 13/13 after the one-line fix, backup/restore re-proved, onboarding + runbook written. The 30-day pilot with 3 real owners can start as soon as the owner picks the access method and names the owners — with Drive connected before any real pilot data is entered.

