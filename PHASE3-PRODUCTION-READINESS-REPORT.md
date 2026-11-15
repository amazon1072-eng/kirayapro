# KirayaPro — Phase 3 Production-Readiness Report

**Date:** 15 Nov 2026 (evening PKT) · **Build:** local only, NOT live · **Port:** 3200
**Stack:** Next.js 16.4.5 (App Router, webpack build) + React 19 + TypeScript + Tailwind 4 + Prisma 6.14 + SQLite (`prisma/dev.db`) + bcryptjs, httpOnly cookie sessions.
**Scope:** complete production-readiness verification sweep — all Phase 1/2 behaviour re-proved plus the Phase 3 "Send Reminder Again" feature, backup & restore, mobile, security, and a fresh-org end-to-end journey.

## Verdict: PILOT-READY (with open items — see bottom)

Every area passed. One real bug was found by this sweep (stale Tailwind CSS — invisible Cancel button and notification badges) and fixed by a clean rebuild; no source-code change was needed and the fix is verified in the live browser. Nothing was deployed anywhere. Local only.

| Area | Result |
|---|---|
| Workflows (Owner / Admin / Accountant / Tenant portal) | **PASS** — sweep script 90/90, incl. all four roles |
| Billing + financial math | **PASS** — demo numbers re-proved from the DB 3×; sweep-org math exact at every step |
| Backup & restore | **PASS** — backup.sh + backup-verify + scratch restore simulation, all exact |
| Mobile responsiveness + UI polish | **PASS** — 7 pages at 390px, zero horizontal overflow; 1 real CSS bug found + fixed |
| Security & permissions (incl. `reminders.send`) | **PASS** — 93/93 perm + 67/67 reminder + 9/9 WABA + 9× 401s in sweep |
| End-to-end fresh-org journey (Starter) | **PASS** — 90/90 (`/tmp/kp-phase3-sweep.mjs`) |
| Regression (Phase 1 core + Phase 2 spot checks) | **PASS** — 52/52 polish + Phase 1 regression inside perm test + lint/build |
| `npm run lint` | **PASS** — 0 errors, **0 warnings** (the 2 `scripts/backup-verify.ts` warnings from before are gone) |
| `npm run build` (`next build --webpack`, after `rm -rf .next`) | **PASS** |
| Production server on :3200, landing 200, demo + accountant login 200 | **PASS** (left RUNNING on the final build) |

**Total automated checks re-run in this sweep: 311/311** — reminder 67/67, permissions 93/93, polish 52/52, fresh-org sweep 90/90, WABA 9/9. Plus direct DB verification, backup/restore simulation, 7 mobile screenshots, and a computed-style CSS probe.

## 1. Workflows — PASS (90/90 sweep script + role logins)

Fresh Starter org journey (`/tmp/kp-phase3-sweep.mjs`, new script written for this sweep; run 3×, final run 90/90 — the earlier runs' failures were all test-script bugs, listed under "Test-script errors", not app bugs):

- **Onboard:** `POST /api/auth/register` 200 → Starter plan, 14-day trial → owner login, dashboard 200, settings 200.
- **Owner:** property → 2 units (rents Rs. 40,000 / 55,000) → 2 tenants (rentalEnd in 25 / 45 days) → org charges (maintenance 2,000, water 1,000, electricity 5,000) → unit S-1 electricity OFF → preview → bulk generate Nov 2026 → duplicate 409 → portal partial payment → approve → receipt → outstanding math.
- **Admin:** user created via settings API, login 200, dashboard 200.
- **Accountant:** user created, login 200, dashboard 200, generate Dec 2026 bills 200 (accountant billing works per the Option 1 decision).
- **Manager:** login 200, dashboard 200, generate 403, delete bill 403, reminder send 403.
- **Tenant (portal):** `GET /api/portal/[token]` 200 with the right bill, `/pay/[token]` page 200, partial payment submit 200/201 → Pending Rs. 20,000 → owner approve → receipt `KP-2026-xxxx`, remaining Rs. 23,000. Full payment of a Jan 2027 bill → approve → remaining 0.
- **Union flows:** Starter union create refused 403 (plan gate); after a test-only plan flip to Business, union create → 2 members → fee Rs. 2,000 → generate Nov 2026 (2 collections) → duplicate 409 → collect 1 → expense Rs. 8,000 → report billed 4,000 / collected 2,000 / pending 2,000 / expenses 8,000 / fund −6,000 → union page 200. Zero rent bills created by union flows (bill count unchanged).
- **Notifications:** generate 200 → overdue + agreement_expiry present → second generate creates 0 (dedup) → accountant generate 403.
- Demo logins re-checked at the end: demo@kirayapro.pk 200, accountant@kirayapro.pk 200.

## 2. Billing + financial math — PASS

Re-proved directly against the database (SQLite), not just through the UI — three times: before testing, via `backup-verify.ts` on the backup file, and after the final re-seed.

Demo org "KirayaPro Demo Properties" (Professional, `active`): 3 properties, 9 units (8 occupied), 8 tenants, Oct 2026 bills:

| Figure | Verified |
|---|---|
| Bills total (4 bills) | **Rs. 245,100** |
| Approved payments | **Rs. 130,300** |
| Outstanding (per-bill Σ max(0, total − approved)) | **Rs. 114,800** (0 + 50,300 + 33,500 + 31,000) |
| Bill statuses | Paid 1 (Rs. 90,300) · Partially Paid 1 (Rs. 73,500) · Unpaid 2 (Rs. 81,300) |
| Expenses in October | **Rs. 51,500** |
| Receipts | KP-2026-0001 (Rs. 90,300), KP-2026-0002 (Rs. 40,000) |
| Union (Sohan Bazaar Market Union) | 3 members · fees billed Rs. 6,000 · collected Rs. 4,000 · pending Rs. 2,000 · union expenses Rs. 8,000 · fund **Rs. −4,000** |
| Notifications (after cron) | 9 (overdue ×3, agreement expiry ×2 labelled, payment submitted ×1, maintenance ×3) |
| ReminderLog rows in pristine demo | **0** |

Sweep-org math (fresh Starter org, independent of demo): preview S-1 Rs. 43,000 (rent 40k + maintenance 2k + water 1k, electricity OFF) / S-2 Rs. 63,000 (+ electricity 5k) → bulk total **Rs. 106,000** → partial JazzCash Rs. 20,000 on S-1 → remaining **Rs. 23,000** → outstanding S-1 23,000 + S-2 63,000 = **Rs. 86,000** (DB-checked) → full payment of Jan 2027 S-2 bill → remaining **0**. Receipt numbering sequential (`KP-2026-xxxx`, regex-checked on approval). Per-unit charge difference (electricity OFF on one unit only) flows through preview → generate → portal identically.

## 3. Backup & restore — PASS (independently re-run)

Commands run (exact):

```bash
cd ~/workspace/kirayapro
./scripts/backup.sh ./backups
# -> Backup OK: /home/hatch/workspace/kirayapro/./backups/kirayapro-backup-20261114-2104.db (438272 bytes)
#    bills 4, payments 4, tenants 8, notifications 9

DATABASE_URL="file:/home/hatch/workspace/kirayapro/backups/kirayapro-backup-20261114-2104.db" npx tsx scripts/backup-verify.ts
# -> counts: orgs 1, users 2, properties 3, units 9, tenants 8, bills 4, payments 4,
#    notifications 9, customRoles 0
#    totals: billed 245100, approved 130300, outstanding 114800
#    spotBill: 2026-10, House 12-A, Ahmed Raza, Rs. 90,300, Paid, 5 items
```

Restore simulation (scratch copy ONLY — the live DB was never touched):

```bash
mkdir -p /tmp/kp-p3-restore
cp prisma/dev.db /tmp/kp-p3-restore/simulated-live.db
sqlite3 /tmp/kp-p3-restore/simulated-live.db "DELETE FROM Bill; DELETE FROM Payment; DELETE FROM Notification; DELETE FROM ReminderLog;"
# -> after simulated loss: bills 0, payments 0, notifications 0, reminderlogs 0
cp backups/kirayapro-backup-20261114-2104.db /tmp/kp-p3-restore/simulated-live.db
sqlite3 /tmp/kp-p3-restore/simulated-live.db "PRAGMA integrity_check;"   # -> ok
DATABASE_URL="file:/tmp/kp-p3-restore/simulated-live.db" npx tsx scripts/backup-verify.ts
# -> all counts and totals back exactly: 4/4/9, 245,100/130,300/114,800, spot bill intact
sqlite3 /tmp/kp-p3-restore/simulated-live.db "SELECT COUNT(*) FROM ReminderLog;"  # -> 0
sqlite3 /tmp/kp-p3-restore/simulated-live.db "SELECT COUNT(*) FROM Organization;"  # -> 1
```

Restore procedure (as documented in `scripts/backup.sh` — re-verified by this simulation):

1. Stop server: kill the `next-server` process (note: its cmdline is just `next-server (v16.4.5)` — `pkill -f "next start"` does NOT match it; kill by PID).
2. Keep the broken file: `cp prisma/dev.db "prisma/dev.db.broken-$(date +%Y%m%d-%H%M)"`
3. Restore: `cp backups/kirayapro-<date>.db prisma/dev.db`
4. Verify: `DATABASE_URL="file:./prisma/dev.db" npx tsx scripts/backup-verify.ts` (expect billed 245,100 / approved 130,300 / outstanding 114,800 on the demo org, spot bill intact)
5. Start server: `npm start`; log in as demo@kirayapro.pk, check dashboard.

Caveats: backup is a point-in-time snapshot; anything after the backup time is lost on restore. No automated schedule exists yet. Backups live only in `./backups` (local) — no off-machine copy yet (see open items).

## 4. Mobile responsiveness + UI polish — PASS (1 real bug found and fixed)

7 pages screenshotted at 390px (`/tmp/kp-shot/shot-phase3-mobile.mjs`, `shot-portal-mobile.mjs`, `shot-33-retake.mjs`). Every page measured `scrollWidth = 390 = innerWidth` — **zero horizontal page overflow**:

| # | Screenshot | Page | Check |
|---|---|---|---|
| 31 | `31-dashboard-mobile-390.png` | Dashboard | Visually checked: stacks cleanly, figures match demo (130,300 / 114,800 / 51,500 / 245,100) |
| 32 | `32-billing-mobile-390.png` | Billing list | Visually checked: form stacks; bill-history table scrolls horizontally inside the card (pre-existing pattern, same as Phase 2 — Status column partly cut until scrolled) |
| 33 | `33-bill-detail-mobile-390.png` | Bill detail (demo Oct bill) | Visually checked **after the CSS fix**: Cancel button now solid amber and readable |
| 34 | `34-tenant-portal-mobile-390.png` | Tenant portal `/pay/[token]` | Visually checked: bill, totals, payment form all clean, no overlap |
| 35 | `35-notifications-mobile-390.png` | Notifications | No overflow measured; screenshot on file (visually checked at desktop size in shot 30; not re-read at 390px in this sweep) |
| 36 | `36-reminders-mobile-390.png` | `/reminders` | Visually checked: summary + history cards clean, "No reminders sent yet" correct for demo |
| 37 | `37-union-mobile-390.png` | Union | Visually checked: fund cards 6,000 / 4,000 / 8,000 / −4,000, member table scrolls inside the card |

### Bug found and fixed — stale Tailwind CSS (real, user-visible)

**Symptom (found from screenshot 33):** the "Cancel bill" button on the bill-detail page rendered as white text on a white card — effectively invisible. The notification-bell badge ("9") was likewise invisible (white text, no red background).

**Diagnosis:** computed styles in the live browser showed `background-color: rgba(0, 0, 0, 0)` for `bg-amber-600` (Cancel button) and `bg-red-500` (bell badge), and a probe element confirmed `ml-1` → 0px, `max-w-xs` → none, `max-h-64` → none, `object-contain` → fill, `overflow-auto` → visible, `underline` → none. The built CSS (`.next/static/css/1aa6e0484e669ff2.css`, 30 KB) genuinely lacked those utilities even though they are used in `components/forms.tsx`, `components/ui.tsx`, and `app/payments/page.tsx` — same class of issue as the earlier `pl-3` quirk, but broader.

**Fix:** no source change. Clean rebuild:

```bash
rm -rf .next && npm run build   # next build --webpack — PASS
```

After the clean rebuild the new CSS (`.next/static/css/d2789b56d9a9f8a4.css`) contains all of `ml-1`, `bg-red-500`, `bg-amber-600`, `max-w-xs`, `max-h-64`, `object-contain`, `overflow-auto`, `underline`. Re-verified in the live browser: bell badge background is now red (`oklch(0.637 0.237 25.331)`), Cancel button background is amber (`oklch(0.666 0.179 58.318)`), probe element gets `margin-left: 4px`, `max-width: 320px`, `max-height: 256px`, `object-fit: contain`, `overflow: auto`, `text-decoration: underline`. Screenshot 33 was retaken and visually confirms the amber Cancel button.

**Root cause:** stale incremental `.next` cache — the previous build's CSS was generated from an older snapshot of the sources and never refreshed for these utilities. **Recommendation:** always do a clean rebuild (`rm -rf .next && npm run build`) before any pilot deploy or when any styling looks unstyled; consider adding a `build:clean` npm script so the safe path is the easy path.

No other layout breakage found. No redesign was done.

## 5. Security & permissions — PASS

Full matrix re-tested (perm suite 93/93 + reminder suite 67/67 + sweep sections E/H/I + WABA 9/9). `reminders.send` is grantable to custom roles, NOT restricted; ACCOUNTANT holds it; MANAGER does not.

| Action | Owner | Admin | Manager | Accountant | Custom role |
|---|---|---|---|---|---|
| View bills / preview | ✅ | ✅ | ✅ | ✅ | only if granted `bills.view` |
| Generate bills (bulk + single) | ✅ | ✅ | ❌ 403 | ✅ | only if granted `bills.generate` |
| Verify payments / issue receipts | ✅ | ✅ | ❌ 403 | ✅ | only if granted `payments.verify` |
| Delete a bill | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Cancel / void a bill | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Void an issued receipt (`financial.adjust`) | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Create/edit/delete custom roles, assign roles, change user roles | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Manage team members / org settings | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| **Send reminders (`reminders.send`)** | ✅ | ✅ | ❌ 403 | ✅ | only if granted `reminders.send` |
| **Reminder override (resend inside 24h)** | ✅ | ✅ | ❌ | ❌ 403 | ❌ never (Owner/Admin only) |
| Generate notifications | ✅ | ✅ | ❌ | ❌ 403 | — |
| Change charges | ✅ | ✅ | ❌ | ❌ 403 | — |

Proved in this sweep:

- **Reminder matrix:** accountant send 200 + wa.me link + `manual_link` log; manager 403; custom role WITH `reminders.send` 200; custom WITHOUT 403; accountant override 403; owner override 200 with `override=true` in the DB row; cooldown second send 409 with last-sent time and no new log row; invalid type 400; missing billId 400; cross-org bill 404; unknown bill 404; reminder on a Paid bill 409.
- **Reminder history:** `GET /api/reminders/history` shows Last Sent / Next Date; Next = lastSent + 24h (verified to <5s); agreement-expiry Next = lastSent + 24h; rows carry createdAt/lastSentAt.
- **DB-smuggled restriction bypass:** a "Sneaky" role with `bills.delete` inserted directly into the DB still gets 403 on DELETE/CANCEL (read-time filter in `effectivePermissions()` works); its `bills.view` still works. Re-proved in the perm suite run.
- **Guards:** DELETE/CANCEL a bill with an Approved payment → 409; void flow → remaining restored, receipt page shows VOIDED, second void 409; cancel → portal link 404 → CSV excludes the cancelled bill → regenerate works.
- **Unauthenticated (sweep section I):** 9/9 routes return 401 without a session: `POST /api/billing/generate`, `POST /api/reminders/send`, `GET /api/reminders/history`, `POST /api/union`, `GET /api/notifications`, `POST /api/notifications/generate`, `DELETE /api/bills/[id]`, `GET /api/union/report`, `POST /api/payments/[id]/verify`.
- **WABA unconfigured (server restarted with `WHATSAPP_PROVIDER=waba`, no credentials):** reminder send returns honest 503 "not configured", no wa.me link, log row `channel: waba, status: failed`, "Reminder failed" notification posted, second send still 409 (cooldown applies after a failed attempt — deliberate). **No real message was ever sent.** `.env` verified byte-identical afterwards (md5 check passed); server restarted back to manual provider.
- Billing math, union money, tagline, and existing permission behaviour were not changed by this sweep (only the clean rebuild, which changed no source).

## 6. End-to-end fresh-org journey — PASS (90/90)

One brand-new Starter org, every step through the real APIs (`/tmp/kp-phase3-sweep.mjs`, final run 90/90):

onboard (register, Starter/trial) → property → 2 units → 2 tenants (25-day + 45-day agreements) → org charges → per-unit electricity OFF on S-1 → preview (S-1 Rs. 43,000 / S-2 Rs. 63,000) → bulk generate Nov 2026 (2 bills, Rs. 106,000 total) → duplicate 409 → tenant portal partial payment Rs. 20,000 JazzCash (ref SWEEP-REF-001) → owner approve → receipt, remaining Rs. 23,000 → team users (admin/accountant/manager) → accountant generates Dec 2026 → notifications generated (overdue + agreement_expiry, dedup 0 on re-run) → union plan-gate 403 on Starter → plan flip (test-only) → union flows (billed 4,000 / collected 2,000 / pending 2,000 / expenses 8,000 / fund −6,000) → reminders: accountant overdue send 200 → cooldown 409 → accountant override 403 → owner override 200 (override=true in DB) → agreement-expiry send 200 → rent_due send 200 → history ≥4 rows with Last Sent / Next Date → manager reminder 403 → full payment of Jan 2027 S-2 bill → remaining 0 → reminder on Paid bill 409. All 9 unauthenticated checks 401.

## 7. Regression — PASS

- **Phase 1 core** (inside the perm test, fresh Starter org via register): property → units → tenants → charges → preview R-1 Rs. 49,500 / R-2 Rs. 51,000 → generate 2 → duplicate 409 → partial JazzCash Rs. 20,000 → approve → receipt, remaining Rs. 29,500 → dashboard 200 → Starter 4th property refused 403.
- **Phase 2 spot checks:** union create 200, union page 200, notifications generate 200 + list has rows, accountant notifications generate 403, accountant expense create 201, invoice upload 201 / view 200, plan limits (Starter 3 properties, 4th 403; union gate 403 on Starter), notifications dedup (second run 0 new), expense invoice upload/view.
- **Polish (52/52):** one labelled agreement reminder per tenant (nearest window wins; 25→30-day, 45→60-day, 60→60-day, 30→30-day; 70-day and expired get none; no "day(s)" text); Monthly Rent row shows real unit-rent range ("Rs. 40,000 – Rs. 85,000 · 3 units") with Per-unit badge; property/org rent override refused 400; legacy full-list save stores no rent row (DB: zero rent `chargeConfig` rows).
- **Lint/build:** `npm run lint` PASS, 0 errors, 0 warnings; `npm run build` PASS (clean rebuild — see §4).

## Test-script errors (not app bugs)

Three failures in intermediate sweep runs were my own script's fault, fixed in the script, final run 90/90: (1) I read `collections` from the union-fees-generate response, but that endpoint returns only `{created}` — collections come from `GET /api/union/fees/collect`; (2) I read union-report fields as `totalExpenses`/`expenses`, the real keys are `unionExpenses`/`feesBilled`/`feesCollected`/`feesPending`/`fundBalance`; (3) I read bill totals from the generate response, but it returns only `unitNo` + `portalUrl` — totals come from the portal API; and the paid-bill check used Dec 2026, already generated by the accountant earlier in the same run (switched to Jan 2027). The reminder `override` flag is not in the send response — it is verified from the `ReminderLog` DB row. `GET /api/billing` does not exist (404 for a nonexistent route is expected, not a bug) — outstanding was verified from the DB instead.

## Cleanup

All 7 test orgs deleted (`scripts/cleanup-test-orgs.ts` removed 3; `/tmp/kp-cleanup-sweep.ts` removed the 4 sweep orgs whose emails don't match the `test-` prefix), test proof/invoice uploads removed, demo re-seeded pristine (`npm run db:seed`), notifications cron re-run (9 new, 0 already existed), demo numbers re-verified (table in §2). Production server left RUNNING on :3200 with the final clean build. Demo login: **demo@kirayapro.pk / Demo1234**; also seeded: accountant@kirayapro.pk / Demo1234.

## Screenshots — `work/screenshots/`

New in this sweep (31–37, all 390px mobile): `31-dashboard-mobile-390.png` · `32-billing-mobile-390.png` · `33-bill-detail-mobile-390.png` (retaken after the CSS fix — amber Cancel button visible) · `34-tenant-portal-mobile-390.png` · `35-notifications-mobile-390.png` · `36-reminders-mobile-390.png` · `37-union-mobile-390.png`. Earlier shots 1–30 untouched. CSS probe script: `/tmp/kp-shot/check-css.mjs`. Sweep script: `/tmp/kp-phase3-sweep.mjs`. Backup: `backups/kirayapro-backup-20261114-2104.db` (438,272 bytes, integrity ok).

## PILOT-READY verdict — what is still open

The app is **pilot-ready for a small, supervised pilot with real property owners** — every tested area passed and the one bug found was fixed and verified. These items are still open and must not be misread as done:

1. **No real-phone test** — desktop browser + API + Playwright only. A tenant should open a real `/pay/[token]` link on a real phone and submit a payment before pilot customers rely on it.
2. **No off-machine backup** — backups live only in `./backups` on this machine. Before pilot, copy backups off-machine (or add a cron line to run `./scripts/backup.sh` daily and copy the file elsewhere). No automated backup schedule exists yet.
3. **WABA not configured** — manual wa.me links are what actually works today. Real WhatsApp Business API sends need the owner's WhatsApp Business account, an approved `kirayapro_bill_due` / `kirayapro_agreement_expiry` template, and credentials in `.env` (plus Meta's per-message charges).
4. **No live deploy** — still local only. Live deploy needs owner approval + a small Linux VPS (SQLite does not persist on Netlify/Vercel), same as before.
5. **Bank verification not connected** — reference-format warnings, duplicate-reference refusal, and amount warnings only; approval stays manual. No live JazzCash/Easypaisa/bank check.
6. **Known minor UI limitation (pre-existing, not a regression):** on 390px the bill-history and union member tables scroll horizontally inside their cards, so the rightmost column (Status) is partly cut until the user scrolls the table sideways. Same behaviour as Phase 2.
7. **A failed WABA attempt counts toward the 24h reminder cooldown** (deliberate — a broken config can't be hammered), so a failed send blocks a retry for 24h unless an Owner/Admin overrides.
8. **Clean-build discipline:** the stale-CSS bug (§4) came from the incremental `.next` cache. Rebuild clean (`rm -rf .next && npm run build`) before any pilot deploy.
