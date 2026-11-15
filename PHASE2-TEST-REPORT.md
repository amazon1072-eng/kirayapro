# KirayaPro — Phase 2 Test Report

**Date:** 15 Nov 2026 (evening PKT) · **Build:** local only, NOT live · **Port:** 3200
**Stack:** Next.js 16.4.5 (App Router, webpack build) + React 19 + TypeScript + Tailwind 4 + Prisma 6.14 + SQLite (`prisma/dev.db`) + bcryptjs, httpOnly cookie sessions.

## Verdict

| Check | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors, 0 warnings |
| `npm run build` | **PASS** (`next build --webpack`) |
| Production server on :3200, landing 200 | **PASS** (left RUNNING) |
| Demo login (demo@kirayapro.pk / Demo1234) | **PASS** |
| Phase 2 workflow test (63 checks, `/tmp/kp-phase2-test.ts`) | **PASS — 63/63** (final run; an earlier run caught 1 real bug, fixed — see below) |
| WABA not-configured test (`/tmp/kp-waba-test.ts`) | **PASS** — honest 503, nothing sent |
| Notifications cron script (`npm run notifications`) | **PASS** — clean logs, dedup works |
| Screenshots (7 new, visually checked) | **PASS** — 1280px + 390px |

## What was built

### 1. Schema (`prisma/schema.prisma`, migration `20261114195042_phase2`)
New models, all org-scoped with cascade on org delete: `Union`, `UnionMember`, `UnionFee`, `UnionFeeCollection` (unique member+period), `UnionExpense`, `Notification` (unique `dedupKey`), `CustomRole`, `WhatsAppMessage`. `User.customRoleId` → CustomRole (SetNull). `Organization.trialEndsAt` + `subscriptionStatus` (`trial`/`active`/`past_due`/`cancelled`); new orgs get a 14-day trial from registration; demo org is `active`.

### 2. Permissions + custom roles (`lib/permissions.ts`)
12 permission keys (`bills.view`, `bills.generate`, `payments.verify`, `tenants.manage`, `properties.manage`, `maintenance.manage`, `expenses.manage`, `reports.view`, `settings.manage`, `users.manage`, `union.manage`, `notifications.view`). Built-in map: OWNER/ADMIN = all; MANAGER = bills.view, tenants/properties/maintenance manage, reports.view, union.manage, notifications.view; ACCOUNTANT = bills.view, payments.verify, expenses.manage, reports.view, notifications.view. A user with a custom role gets ONLY that role's permissions. `requirePermission()` in `lib/api.ts` returns 403; enforced in the APIs for bills generate, payments verify, tenants create, properties/units create, union APIs, expenses create, settings users/roles. Settings page: "Custom roles" section — create role (name + permission checkboxes), list roles, assign/remove a role per team member (dropdown), delete role. **Proved by test:** a "Billing Viewer" role (bills.view only) gets 403 on `POST /api/billing/generate`, 403 on union create and payment verify, and 200 on the billing list page.
Note: per the specified map, ACCOUNTANT no longer has `bills.generate` (Phase 1 allowed accountant billing). OWNER/ADMIN still generate bills.

### 3. Hard plan limits (`lib/plans.ts`)
Single config: Starter {3 properties, 30 units, 5 users, union: no, customRoles: no}, Professional {10, 150, 15, union: yes, customRoles: no}, Business {30, 500, 50, union: yes, customRoles: yes}, Enterprise {unlimited, union: yes, customRoles: yes}. Trial 14 days from org creation. Enforced server-side in `POST /api/properties`, `POST /api/units`, `POST /api/settings/users`, `POST /api/union` (module gate), `POST /api/settings/roles` (customRoles gate) — refused with 403 + message, e.g. "Starter plan allows 3 properties. Upgrade to add more." Settings page shows current plan, usage vs limit (e.g. "1 / 30 properties"), module inclusion, and trial status + end date + renewal note. **Proved by test:** Starter org creates 3 properties OK, 4th refused 403; union create on Starter refused 403.

### 4. Full union module (`/union`, `app/api/union/*`)
Profile create/edit, member directory (membership no., name, phone, linked shop/unit + tenant record, Active/Suspended toggle, remove), fee config CRUD, "Generate fees for period" (one Pending collection per Active member from the active fee config; duplicate period refused 409), Collect action (marks Paid with method/reference/date), union expenses (with invoice upload), report API + fund cards (billed, collected, pending, expenses, fund balance = collected − expenses). Union money NEVER touches rent bills — no Bill/Payment rows are created by union flows (proved: 0 rent bills in the union test org); union reports are separate from `/reports`. Sidebar NAV: "Union" after Maintenance & Expenses.
Demo seed: "Sohan Bazaar Market Union" (president Haji Saleem, 0300-9998888), members M-001..M-003 linked to the 3 market shops + tenant records, monthly fee Rs. 2,000, Oct 2026 collections (2 paid, 1 pending), one union expense Rs. 8,000 (market cleaning, Oct 15). Demo rent numbers unchanged.

### 5. Notifications engine (`lib/notifications.ts`, `/notifications`, `scripts/generate-notifications.ts`)
`generateNotifications(orgId)` scans real data with dedupKeys: bills due within 3 days → rent_reminder; past-due unpaid bills → overdue; tenants with rentalEnd within 30 days AND within 60 days (one per tenant per window) → agreement_expiry; Pending payments → payment_submitted; Approved/Rejected in last 7 days → payment_approved/rejected; maintenance updated in last 24h and not Pending → maintenance_update. Live events wired: portal payment submission, verify approve/reject, maintenance status change. APIs: `GET /api/notifications` (`?unread=1`, `unreadCount`), `POST /api/notifications/read` (one or all), `POST /api/notifications/generate` (OWNER/ADMIN only). Bell in the Shell (desktop sidebar header + mobile header) with server-fetched unread badge, linking to `/notifications`. Page: All/Unread filter tabs, type badge + relative time, click marks read, "Mark all read" + "Generate now". Cron: `npm run notifications` (script `scripts/generate-notifications.ts`, loops all orgs). Documented cron line:
`0 8 * * * cd ~/workspace/kirayapro && npm run notifications`
**Proved by test:** engine produced rent_reminder + overdue + agreement_expiry + payment_approved from real test data; second run created 0 new (dedup).

### 6. Expense invoice upload
`POST /api/expenses/[id]/invoice` (multipart, session + org check, images/PDF only, max 5MB, stored under `uploads/invoices/`) and `GET` (same checks, serves the file). Same pattern for union expenses (`/api/union/expenses/[id]/invoice`). Maintenance page: every expense row shows "Upload invoice" or "View invoice" when present. **Proved by test:** upload 201, view 200 `image/png`, view without session 401.

### 7. WhatsApp provider module (`lib/whatsapp.ts`)
Providers `manual` (default) and `waba`, from env `WHATSAPP_PROVIDER`, `WABA_PHONE_NUMBER_ID`, `WABA_ACCESS_TOKEN`, `WABA_BUSINESS_ID` (added empty with comments to `.env`). `sendBillWhatsApp`: manual builds the same wa.me link as before, logs a `WhatsAppMessage` row (`status: manual`), returns the link; waba without credentials logs `not_configured` and returns an honest 503; waba configured builds the Cloud API payload for utility template `kirayapro_bill_due` (tenant name, bill total, due date, portal link) and only sends on a real (non-dry-run) call. `POST /api/whatsapp/send` is the single entry point; `GET /api/whatsapp/status` reports provider/configured/missing. Bill page: the direct wa.me anchor is replaced by a button that calls the API and opens the returned link — the manual flow works exactly as before. **Proved by test:** manual send returns provider `manual` + waLink and logs a row; status endpoint reports manual/configured; WABA test (env set only for that test process, `.env` untouched) returns 503 `not_configured` and logs a `not_configured` row. **No real message was ever sent.**

### 8. Bank verification hooks (`lib/bank-verification.ts`) — honest, no fake verification
`validateReference` (JazzCash/Easypaisa: transaction ID 8+ chars or 11-digit PK mobile; bank transfer: 6+ chars; cash: reference optional), duplicate-reference detection across bills in the same org (refused 409 "This transaction reference was already used"), amount-matching warnings on the `/payments` page (amount > remaining; amount matches neither remaining nor any single charge; bad reference format) shown as an amber "Check before approving" box. Provider interface `BankVerificationProvider` with a `none` provider (default, always `not_configured`) and a documented stub for a future JazzCash/Easypaisa/bank merchant API. `GET /api/bank-verification/status` reports provider + configured + what is needed. **Nothing in this module ever changes a payment status — approval stays manual via the verify API. Proved by test:** cross-bill duplicate reference refused 409, bad reference accepted with a format warning, re-approve refused 409.

## Bugs found and fixed during testing

1. **Receipt-number collision (found by test, fixed):** receipt numbers were sequenced from the GLOBAL COUNT of receipts. After a re-seed (or org delete) the count no longer matched the highest number, so an approval tried to re-issue an existing number → 500. Fixed in BOTH places: `app/api/payments/[id]/verify/route.ts` and `prisma/seed.ts` now derive the next number from the MAXIMUM existing receipt number (`KP-YYYY-(max+1)`). Re-tested: 63/63.
2. **Noisy cron log (found by test, fixed):** the notifications engine relied on the unique-constraint error for dedup, which Prisma logged as an error on every re-run. `createNotification` now checks for the dedupKey first; the cron log is clean.
3. **Tailwind quirk (found by screenshot review):** the `pl-3` utility was not generated in the production CSS despite being in source (Tailwind v4 scanner quirk in this build). Used `pl-4` (already generated) for the invoice-column spacing instead; verified in the built CSS and screenshots.

## Full workflow test — 63/63 PASS (`/tmp/kp-phase2-test.ts`, final run)

Fresh Starter org → 3 properties OK, 4th refused 403 → 2 units → 2 tenants (one expiring in 20 days) → org charges (maintenance 2,000, water 1,000, electricity 5,000) → unit override electricity OFF for A-1 → preview A-1 Rs. 53,000 / A-2 Rs. 48,000 → bulk generate Nov 2026 → duplicate refused 409 → portal partial payment Rs. 20,000 JazzCash (ref TEST-REF-001, PNG proof) → duplicate refused 409 → same reference on another bill refused 409 → bad reference "abc" accepted with warning → approve → receipt issued, remaining Rs. 33,000, bill Partially Paid → re-approve refused 409 → notifications (bill due in 2 days, bill overdue, tenant expiring) → generate run 1 creates >0, run 2 creates 0 → expense + invoice upload 201 / view 200 / anon 401 → WhatsApp manual send + status → bank-verification status → union gate 403 on Starter → payments page shows warnings. Fresh Business org → union → 2 members → fee Rs. 2,000 → generate Nov 2026 (2) → duplicate 409 → collect 1 → union expense Rs. 8,000 → report billed 4,000 / collected 2,000 / pending 2,000 / expenses 8,000 / fund −6,000 → 0 rent bills from union flows → custom role (bills.view only) → 403 on generate/union/verify, 200 on billing list. Demo login + union/notifications pages 200.

## Phase 1 regression — PASS

The same script re-proves the Phase 1 core workflow (property → units → tenants → charges → preview → bulk bill → duplicate refused → portal partial payment → approve → receipt, remaining correct). No Phase 1 behaviour changed except the two intentional spec changes: ACCOUNTANT no longer has `bills.generate` (per the Phase 2 permission map), and receipt numbers are now max-based (same values in normal use).

## Verified demo numbers (after final re-seed, checked directly against the database)

Demo org "KirayaPro Demo Properties" (Professional, `active`): 3 properties, 9 units (8 occupied), 8 tenants, Oct 2026 bills (due 10 Oct 2026):

| Figure | Verified |
|---|---|
| Bills total (4 bills) | **Rs. 245,100** |
| Approved payments | **Rs. 130,300** |
| Outstanding (per-bill) | **Rs. 114,800** |
| Expenses in October | **Rs. 51,500** |
| Receipts | KP-2026-0001, KP-2026-0002 |
| Union (Sohan Bazaar Market Union) | 3 members · fees billed Rs. 6,000 · collected Rs. 4,000 · pending Rs. 2,000 · union expenses Rs. 8,000 · fund **Rs. −4,000** |
| Notifications (cron run after re-seed) | 10 (overdue ×3, agreement expiry ×3, payment submitted ×1, maintenance ×3) |

## Screenshots — `work/screenshots/` (new files, Phase 1 set untouched)

`20-union.png` · `20b-union-mobile-390.png` · `21-notifications.png` · `21b-notifications-mobile-390.png` · `22-roles.png` · `23-plan-limits.png` · `24-expense-invoice.png`

Visually checked: union page shows the demo union (Rs. 6,000 billed, Rs. 4,000 collected, Rs. 8,000 expenses, fund Rs. −4,000, 3 members M-001..M-003 with linked shops); notifications page shows 10 unread with type badges and the bell badge "10" in the sidebar; roles screenshot shows the "Billing Viewer" custom role, permission checkboxes and the per-user role dropdown; plan-limits screenshot shows Business current, usage "1 / 30 properties · 2 / 500 units · 2 / 50 team members", Union/Custom roles "Included", trial "14 day(s) left (ends 28 Nov 2026)"; expense-invoice screenshot shows "View invoice" on the Rs. 4,500 expense and "Upload invoice" on the others. Mobile 390px: union page stacks to a single column; tables scroll horizontally.

## Cleanup

All 11 test orgs deleted (`scripts/cleanup-test-orgs.ts`), all test proof/invoice uploads removed from `uploads/proofs/` and `uploads/invoices/`, demo re-seeded pristine (`npm run db:seed`), demo numbers re-verified (table above). Production server left RUNNING on :3200 with the final build.

## Run it

```bash
cd ~/workspace/kirayapro
npm run build
npm start        # http://localhost:3200 (server left RUNNING on :3200)
# daily notifications cron:
#   0 8 * * * cd ~/workspace/kirayapro && npm run notifications
# re-seed demo: npm run db:seed
```

Demo login: **demo@kirayapro.pk / Demo1234**. Also seeded: accountant@kirayapro.pk / Demo1234 (Accountant role).

## WHAT IS DELIBERATELY NOT LIVE

### WhatsApp Business API (WABA) — NOT connected
The code is integration-ready (`lib/whatsapp.ts`, `POST /api/whatsapp/send`), but **no message has ever been sent through Meta's API** and no credentials exist in this build. Manual wa.me sharing (free, opens WhatsApp on the owner's phone) is what actually works today. To go live, the owner needs:
1. A WhatsApp Business account (business phone number) + Meta Business verification.
2. A phone number registered on the WhatsApp Business Platform (gives `WABA_PHONE_NUMBER_ID`).
3. An approved **utility template** in Meta Business Manager (the code uses template name `kirayapro_bill_due`, language `en`, with body parameters: tenant name, bill total, due date, portal link) — templates must be approved by Meta before they can be sent.
4. A permanent access token (`WABA_ACCESS_TOKEN`) with `whatsapp_business_messaging` permission.
5. Set `WHATSAPP_PROVIDER=waba` plus the three values in `.env`, restart, and test with one real bill (dry-run first: the provider supports `dryRun: true`, which validates the payload without sending).
6. Meta charges per WhatsApp conversation (utility-template messages are paid, price varies by country); the owner should check Meta's current WhatsApp pricing before enabling.

### Bank verification — NOT connected
There is **no live JazzCash / Easypaisa / bank check** in this build. What exists: reference-format warnings, duplicate-reference refusal (409), and amount-matching warnings on the verification page. Approval is always manual. To go live, the owner needs:
1. A merchant account with JazzCash, Easypaisa, or their bank.
2. API credentials from that provider (merchant ID + API key / client secret) and the provider's transaction-verification API documentation.
3. Owner approval to enable live verification, then implement `BankVerificationProvider` in `lib/bank-verification.ts` (the interface + stub are documented there). Even then, the module must never auto-approve — it returns `verified` / `rejected` / `manual_review` and an admin still approves via the existing verify API.

### Live deploy — still local only
Needs owner approval + a small Linux VPS (SQLite does not persist on Netlify/Vercel), same as Phase 1. No real-phone test done (desktop browser + curl only).

## Notes / caveats

- The `pl-3` Tailwind utility was not generated in the production CSS in this build (scanner quirk); invoice-column spacing uses `pl-4`, which is generated. If new utilities ever render unstyled, check the built CSS in `.next/static/css/` first.
- Receipt numbers are now max-based in both the verify API and the seed (see bug 1 above) — re-seeding with test orgs present no longer collides.
- The union fund can go negative (demo: Rs. −4,000) — that is correct arithmetic (Rs. 4,000 collected − Rs. 8,000 spent), not a bug.
- Notifications for the demo org were regenerated by the cron after the final re-seed (10 unread) — the bell badge shows real demo data.
- The demo invoice uploaded for screenshot 24 was removed with the other test uploads during cleanup; the demo org has no invoice files after the final re-seed (the upload UI is still there — "Upload invoice" on every expense row).

---

## Permission refinement (15 Nov 2026, after Phase 2) — Owner chose Option 1

**Verdict: PASS — 93/93 checks** (`/tmp/kp-perm-test.mjs`, final run). `npm run lint` PASS, `npm run build` PASS, server left running on :3200, demo re-seeded pristine (4 bills, 2 approved payments, 0 custom roles), demo login 200.

### Permission matrix (final)

| Action | Owner | Admin | Manager | Accountant | Custom role |
|---|---|---|---|---|---|
| View bills / preview | ✅ | ✅ | ✅ | ✅ | only if granted `bills.view` |
| Generate rent/maintenance/utility bills (bulk + single) | ✅ | ✅ | ❌ 403 | ✅ (NEW) | only if granted `bills.generate` |
| Manage payment records (verify approve/reject) | ✅ | ✅ | ❌ 403 | ✅ | only if granted `payments.verify` |
| Issue receipts (via approval) | ✅ | ✅ | ❌ | ✅ | only if granted `payments.verify` |
| Delete a bill | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Cancel / void a bill | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Void an issued receipt (`financial.adjust`) | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Edit a generated bill's amounts/items | ❌ no such API — bills are immutable snapshots | | | | |
| Retroactive charge changes | ❌ impossible by design — charge changes apply to future bills only | | | | |
| Create/edit/delete custom roles, assign roles, change user roles | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Manage team members (add users) | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |
| Change organization settings | ✅ | ✅ | ❌ 403 | ❌ 403 | ❌ never grantable |

### What changed (files)

- `lib/permissions.ts` — 4 new permission keys (`bills.delete`, `bills.cancel`, `financial.adjust`, `roles.manage`); `RESTRICTED_PERMISSIONS` = the 6 Owner-only keys (`bills.delete`, `bills.cancel`, `financial.adjust`, `roles.manage`, `users.manage`, `settings.manage` — exactly the permissions no MANAGER/ACCOUNTANT holds); ACCOUNTANT gains `bills.generate`; `effectivePermissions()` filters restricted keys out of custom roles at read time (defense in depth).
- `app/api/bills/[id]/route.ts` (NEW) — `DELETE`, `bills.delete`. Refuses 409 if the bill has any Approved payment (ledger integrity); deletes Pending/Rejected submissions with it.
- `app/api/bills/[id]/cancel/route.ts` (NEW) — `POST`, `bills.cancel`. Sets status `Cancelled`, revokes the portal token. Refuses 409 if already cancelled or if any Approved payment exists. Cancelled bills are excluded from dashboard / reports / CSV totals; cancelling frees the (unit, period) slot so the bill can be regenerated.
- `app/api/payments/[id]/void/route.ts` (NEW) — `POST`, `financial.adjust`. Only Approved payments can be voided (409 otherwise). Keeps the receipt number (audit trail — never reused), sets status `Voided`, recomputes the bill status from remaining Approved payments, posts a `payment_voided` notification.
- `app/api/settings/roles/route.ts` + `app/api/settings/roles/[id]/route.ts` — gate changed from `users.manage` to `roles.manage`; POST/PATCH refuse 403 when restricted permissions are requested; GET returns `restricted: true` flags in the catalogue.
- `app/api/settings/users/[id]/route.ts` — role assignment gate changed from `users.manage` to `roles.manage`.
- `app/api/billing/preview/route.ts` — fixed a real inconsistency found during testing: preview used role-based `canFinance`, so a custom role with `bills.view` was wrongly refused. Now permission-based (`bills.view`).
- `app/api/billing/generate/route.ts` — a Cancelled bill no longer blocks regeneration (deleted first; it never has verified payments by construction).
- Totals: `app/dashboard/page.tsx`, `app/reports/page.tsx`, `app/api/reports/csv/route.ts` — all bill queries exclude `status: Cancelled`.
- UI: `components/forms.tsx` — `CustomRoleForm` renders Owner-only permissions disabled with an amber "Owner only" badge + explanation; new `DeleteBillButton`, `CancelBillButton`, `VoidPaymentButton`. `app/billing/[id]/page.tsx` — Delete/Cancel buttons (Owner/Admin only) + cancelled banner. `app/payments/page.tsx` — Void button on Approved payments (Owner/Admin only). `app/receipts/[id]/page.tsx` — voided receipts open with a VOIDED banner. `app/settings/page.tsx` — passes restricted flags, updated Team & roles text. `components/ui.tsx` — `statusBadge` handles `Cancelled` (slate) and `Voided` (red).
- `scripts/cleanup-restricted-role-permissions.ts` (NEW) — strips restricted permissions from any existing custom role; run once: 0 roles existed, 0 cleaned (the read-time filter covers any future case regardless).

### Test evidence — 93/93 (`/tmp/kp-perm-test.mjs`)

- Accountant: generate 200 (2 bills, A-1 Rs. 54,500 electricity OFF / A-2 Rs. 49,500 electricity 5,000), duplicate 409, portal partial JazzCash Rs. 20,000 → approve 200, receipt issued, remaining Rs. 34,500, receipt page 200.
- Accountant refusals, all 403: DELETE bill, CANCEL bill, VOID payment, CREATE role, ASSIGN role, change charges.
- Manager: generate 403, verify 403. Billing Viewer (bills.view only): billing page 200, preview 200, generate/verify/delete/cancel/void/roles/assign all 403. Phase 2 Billing Viewer case still holds.
- Defense in depth: a "Sneaky" role with `bills.delete` inserted DIRECTLY into the DB → DELETE/CANCEL still 403 (read-time filter works), bills.view still works.
- Owner: create role with `bills.delete` / `roles.manage` / `financial.adjust` → 403 each; create allowed role 201; PATCH add `bills.cancel` → 403; PATCH add `tenants.manage` → 200; assign role 200; delete role 200.
- Guards: DELETE/CANCEL a bill with an Approved payment → 409 each. VOID flow: owner void 200 → remaining back to Rs. 54,500, bill back to Unpaid, receipt page shows VOIDED; void again 409; accountant void 403.
- Cancel flow: cancel 200 → portal link 404 → CSV excludes the cancelled bill → regenerate 200 (created 1, A-2 only) → DELETE regenerated bill 200 → DELETE again 404 → CANCEL deleted bill 404.
- Phase 2 spot checks: union create 200, union page 200, notifications generate 200 + list has rows, accountant notifications generate 403, accountant expense create 201, invoice upload 201 / view 200.
- Phase 1 regression (fresh Starter org): property/units/tenants/charges → preview R-1 Rs. 49,500 (no electricity) / R-2 Rs. 51,000 (electricity 3,500) → generate 2 → duplicate 409 → partial JazzCash Rs. 20,000 → approve → receipt, remaining Rs. 29,500 → dashboard 200 → Starter 4th property refused 403.
- First run: 89/92 — the 3 failures were test-script errors (portal returns 201 not 200; preview bills use `unitLabel` not `unitNo`; my R-2 arithmetic said 53,000, correct total is 51,000). Fixed the script, re-ran from a clean state: 93/93.

### Screenshot

- `25-custom-role-permissions.png` — permission grid with the 6 Owner-only permissions disabled + "Owner only" badges (also shows the DB-smuggled "Sneaky" role listed as `bills.delete, bills.view`, which the filter neutralises).

### Caveats

- "Monthly Rent" still shows 0/Default in the property-level charge editor (pre-existing: rent comes from units).
- The `Sneaky` test role was deleted with the test orgs during cleanup; the read-time filter + API refusal are the permanent protections.
- No real-phone test (desktop + API only), same as before. Still local only — live deploy needs approval + VPS.


---

## Polish fixes (15 Nov 2026) — duplicate agreement notifications + Monthly Rent display

**Verdict: PASS — 52/52 checks** (`/tmp/kp-polish-test.ts`, final run from a clean setup; first run was 50/52 — the 2 failures were test-script errors, a wrong regex for the expected error text, not code bugs). `npm run lint` PASS, `npm run build` PASS, server restarted with the new build and left running on :3200, demo re-seeded pristine (numbers below), test org deleted.

Both items were flagged to the owner earlier and explicitly requested in the owner's 15 Nov message (next focus: complete testing, UI polish, deployment readiness; do not deploy to real customers until security, backup and hosting are ready).

### Fix 1 — Duplicate agreement-expiry notifications

**Problem:** `/notifications` showed "Agreement expiring in 25 day(s) — Sohan General Store" twice — the 30-day and 60-day windows both fired with identical text and no window label.

**Change (`lib/notifications.ts`, section c only):** one reminder per tenant — the *nearest* window wins. A tenant ≤30 days from expiry gets only the 30-day reminder, labelled in the title and body, e.g. "Agreement expiring in 25 days (30-day reminder) — Sohan General Store" / "This is the 30-day reminder — renew or follow up." A tenant 31–60 days out gets only the 60-day reminder; the 30-day one fires later when they enter that window (separate dedupKey per window, so staged reminders still work — just never two at once). Also fixed the "day(s)" wording to proper singular/plural ("in 1 day" / "in 25 days").

**Test evidence:** test org with tenants ending in 25/45/10/70/60/30 days + one already expired. Generate run 1 created exactly 5 agreement_expiry notifications (25→30-day, 45→60-day, 10→30-day, 60→60-day, 30→30-day); 70-day and expired tenants got none; no duplicate titles; no old "day(s)" text. Run 2 created 0 (dedup). After generating bills (due 10 Nov 2026, past), run 3 created exactly the 4 overdue notifications and agreement_expiry stayed at 5.

**Live demo effect:** after re-seed + cron, the demo org has **9 notifications (was 10)** — the duplicate is gone: Sohan General Store appears once ("in 25 days (30-day reminder)"), Fatima Store once ("in 60 days (60-day reminder)").

### Fix 2 — Monthly Rent display in the property-level charge editor

**Problem:** the "Monthly Rent" row showed amount 0 / "Default" at property level, because rent comes from each unit's `monthlyRent`, not the property. (Confirmed: zero rent `chargeConfig` rows exist anywhere in the DB — rent was always per-unit.)

**Change:**
- `app/api/charges/route.ts` (GET): at PROPERTY/ORG scope the rent row is now flagged `perUnit: true` and the response carries a `rentSummary` computed from the scope's real unit rents — `{ unitCount, unitsWithRent, min, max, override }`. A stale property/org rent override row, if one somehow exists, is surfaced explicitly in the summary instead of being hidden.
- `app/api/charges/route.ts` (POST): setting rent at PROPERTY/ORG scope is refused with 400 ("Monthly Rent is set on each unit, not at property or organization level. Edit it on the unit instead."); *clearing* a stale override is still allowed. Legacy full-list saves (which always carry the rent row) have the rent entry dropped at those scopes, not refused, so the legacy path keeps working and no rent row is ever stored.
- `components/forms.tsx` (ChargeEditor): the rent row at property/org level is now a read-only summary — e.g. "Rs. 40,000 – Rs. 85,000 · 3 units" (single value when all units agree, "No rent set on any unit yet" when none do), with a sky "Per unit" badge and the note "Rent — set on each unit, not here." It is excluded from dirty-tracking and saves; a "Remove override" button appears only when a stale override exists. UNIT-scope rent editing is unchanged (it edits that unit's rent).

**Test evidence:** property with 4 units (40,000 / 45,000 / 85,000 / unset) → summary min 40,000 max 85,000, 4 units, 3 with rent, no override; property with 2 equal rents → 60,000/60,000; property with no units → "no units", min/max null; ORG scope covers all 6 units. Rent delta at PROPERTY and ORG → 400 with the per-unit message; empty delta save still 400. Billing preview math unchanged: U-1 Rs. 45,000 (rent 40k + maintenance 2k + generator 3k, water OFF), U-2 Rs. 51,000, U-3 Rs. 91,000, U-4 Rs. 6,000 (no rent); generate created 4, duplicate refused 409. Inheritance subset re-proved: unit water OFF leaves maintenance (ORG 2000) and generator (PROPERTY 3000) inherited; property water OFF works; legacy full-list save at PROPERTY stores security 1500 and stores no rent row (DB: zero rent rows). Stale-override safety net: a PROPERTY rent row of 70,000 inserted directly in the DB is surfaced as the override, then cleared via the API, and the range display returns.

### Screenshots

- `26-notifications-labelled.png` — notifications page: Sohan General Store appears once, "Agreement expiring in 25 days (30-day reminder)", Fatima Store once with the 60-day label; 9 unread (was 10).
- `27-charge-editor-rent.png` — Gulberg Residency property page: "Monthly Rent — Rs. 40,000 – Rs. 85,000 · 3 units" with the "Per unit" badge and "Rent — set on each unit, not here."; other rows keep their normal badges.

### Caveats

- The "Monthly Rent 0/Default" caveat from the permission section is now resolved — the row above replaces it.
- No real-phone test (desktop + API + Playwright screenshots only), same as before. Still local only — live deploy needs approval + VPS, and the owner's note stands: do not use it for real customers' financial records until security, backup and hosting are properly ready.
- Roles, permissions, billing math and the tagline were not touched.
