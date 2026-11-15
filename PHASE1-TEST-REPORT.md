# KirayaPro — Phase 1 Test Report

**Date:** 14 Nov 2026 (evening PKT) · **Build:** local only, NOT live · **Port:** 3200
**Stack:** Next.js 16.4.5 (App Router, webpack build) + React 19 + TypeScript + Tailwind 4 + Prisma 6.14 + SQLite (`prisma/dev.db`) + bcryptjs, httpOnly cookie sessions.

## Verdict

| Check | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors, 0 warnings |
| `npm run build` | **PASS** (`next build --webpack`, see note below) |
| Production server on :3200, landing 200 | **PASS** |
| Demo login (demo@kirayapro.pk / Demo1234) | **PASS** |
| Full workflow test (30 checks, `/tmp/kp-test.mjs`) | **PASS — 30/30** (run twice, second run after the CSS fix; both 30/30) |
| Screenshots (10, visually checked) | **PASS** — landing + dashboard render with full styling |

## Full workflow test (30/30, against the production server)

Fresh throwaway org → property → 2 units → 2 tenants → org charges (maintenance Rs. 2,000, water Rs. 1,000, electricity Rs. 5,000 actual-bill) → unit-level override disabling electricity for Flat A-1 (tenant pays direct) → preview → bulk generate Nov 2026 → duplicate generate refused (409) → public portal link → partial payment Rs. 20,000 via JazzCash with PNG proof → duplicate payment (same ref + amount) refused (409) → admin approve → receipt issued → receipt page → dashboard + reports CSV reflect verified collection.

Key verified numbers (test org, Nov 2026):
- Flat A-1 bill: rent 50,000 + maintenance 2,000 + water 1,000 = **Rs. 53,000 — electricity ABSENT** (disabled at unit level).
- Flat A-2 bill: 40,000 + 2,000 + 1,000 + electricity 5,000 = **Rs. 48,000** (electricity present).
- Partial payment Rs. 20,000 approved → receipt `KP-2026-0003` (numbers are globally unique — see bug found below), remaining **Rs. 33,000**, bill status **Partially Paid**, dashboard showed verified collection Rs. 20,000, CSV export contained the test bill.

## Bug found and fixed during testing

1. **Receipt-number collision across orgs (found by test, fixed):** receipt numbers were sequenced per-org, so a second org would also issue `KP-2026-0001`, violating the unique constraint → approve returned 500. Fixed: the sequence now counts ALL receipts globally (`KP-YYYY-NNNN`), org counter still kept. Re-tested: 30/30.
2. **ORG charge scope key (found by code review, fixed before test):** the charges API now normalises ORG scope to the organization id, so org defaults actually apply.
3. **Turbopack build panic (environment quirk, worked around):** `next build` (Turbopack) panics on the pre-existing `work/venv` symlink in this project (video tooling — NOT touched). Fix: `npm run build` now runs `next build --webpack`.
4. **Unstyled pages with the webpack build (found by screenshot review, fixed):** Tailwind 4's `@tailwindcss/turbopack` loader does not run under webpack, so pages rendered unstyled. Fix: added `@tailwindcss/postcss` + `postcss.config.mjs`. Screenshots re-taken and visually verified — navy/teal design renders correctly.

## What was built (routes)

**Public:** `/` landing · `/login` · `/register` · `/pay/[token]` tenant portal (no login, only that bill)
**App (login required):** `/dashboard` · `/properties` · `/properties/[id]` (units + unit/property/org charge editors) · `/tenants` · `/billing` · `/billing/[id]` (snapshot breakdown, wa.me share, print, re-issue/revoke portal link) · `/payments` (verification) · `/receipts/[id]` (printable receipt) · `/maintenance` (requests + expenses) · `/reports` (date filters, CSV, print) · `/settings` (org, team/roles, plans, demo controls)
**APIs:** `/api/auth/*` · `/api/properties` · `/api/units` · `/api/tenants` · `/api/charges` · `/api/billing/preview|generate` · `/api/bills/[id]/reissue|revoke` · `/api/portal/[token]` (+ `/proof/[paymentId]`, token-gated) · `/api/payments/[id]/verify` · `/api/maintenance[/[id]]` · `/api/expenses` · `/api/settings/org|users` · `/api/demo` · `/api/reports/csv`

## Demo data (restored after testing)

Demo org "KirayaPro Demo Properties" (Professional plan, badged DEMO): 3 properties (Gulberg Residency house, F-7 Markaz Plaza, Sohan Bazaar Market), 9 units (8 occupied), 8 tenants, Oct 2026 bills incl. one bill with electricity disabled, approved full payment (receipt KP-2026-0001), approved partial payment (KP-2026-0002, Rs. 33,500 remaining), one rejected payment, one pending payment, 3 maintenance requests, 3 expenses. Test orgs created by the workflow test were deleted and the demo re-seeded (`npm run db:seed`) — demo data is pristine. Test proof uploads removed.

## Screenshots — `work/screenshots/`

`01-landing.png` · `02-dashboard.png` · `03-properties.png` · `04-billing.png` · `05-payments-verification.png` · `06-reports.png` · `07-maintenance.png` · `08-settings.png` · `09-receipt.png` · `10-tenant-portal.png`

## Run it

```bash
cd ~/workspace/kirayapro
npm run build
npm start        # http://localhost:3200 (server left RUNNING on :3200)
# dev: npm run dev
# re-seed demo: npm run db:seed
```

Demo login: **demo@kirayapro.pk / Demo1234**. Also seeded: accountant@kirayapro.pk / Demo1234 (Accountant role).

## Deliberately left for Phase 2 (not built)

WhatsApp Business API automation (manual wa.me "WhatsApp par bhejo" button is in), bank verification, AI features, barcode, full union module, notifications engine, custom roles, hard plan-limit enforcement (limits shown only on Settings), day-end bulk entry, invoice upload on expenses (field exists in schema, no upload UI yet), tenant self-edit. No real-phone test done (desktop browser + curl only). NOT live — live deploy needs approval + VPS (SQLite does not persist on Netlify/Vercel).

## Notes / caveats

- Portal links are shown once when a bill is generated (returned by the generate API) and can be re-issued from the bill page — tokens are stored hashed, so a link cannot be re-displayed afterwards. Revoke is on the bill page.
- `scripts/fetch-prisma-engines.sh` is included: in this environment `npm install` fails to download Prisma engines (ECONNRESET); the script fetches them via curl. On a normal network it is not needed.
- `scripts/cleanup-test-orgs.ts` deletes orgs whose owner email starts with `test-` (used by the workflow test).
