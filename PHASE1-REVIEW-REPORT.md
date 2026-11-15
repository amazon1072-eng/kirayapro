# KirayaPro — Phase 1 Design Review Report

**Date:** 15 Nov 2026 (early morning PKT) · **Build:** local only, NOT live · **Port:** 3200
**Stack:** Next.js 16.4.5 (App Router, webpack build) + React 19 + TypeScript + Tailwind 4 + Prisma 6.14 + SQLite (`prisma/dev.db`) + bcryptjs, httpOnly cookie sessions.
**Scope of this review:** the owner's requested improvements after the Phase 1 review (see `PHASE1-TEST-REPORT.md`). No redesign, no removed functionality, no fake buttons.

## Verdict

| Check | Result |
|---|---|
| `npm run lint` | **PASS** — 0 errors, 0 warnings |
| `npm run build` | **PASS** (`next build --webpack`) |
| Production server on :3200, landing 200 | **PASS** (rebuilt + restarted; left RUNNING) |
| Demo login (demo@kirayapro.pk / Demo1234) | **PASS** |
| Full workflow test (53 checks, `/tmp/kp-review-test.mjs`) | **PASS — 53/53** (final run; earlier runs caught 2 real bugs, both fixed — see below) |
| Screenshots (8 new, visually checked) | **PASS** — 1280px / 768px / 390px |

---

## COMPLETED IMPROVEMENTS

### 1. Dashboard (`app/dashboard/page.tsx`)
- **New stat cards (existing 4 kept, same `StatCard` style, rent & maintenance still financially separate):**
  - Row 2: Properties (count, sub: units in total), Tenants & shopkeepers (count, sub: "X tenant(s) · Y shopkeeper(s) / member(s)"), Rent collected (sub: rent billed), Maintenance collected (sub: maintenance billed).
  - Row 3: Pending verifications (count, whole card links to `/payments`), Outstanding bills (COUNT of unpaid/partially-paid bills, sub: amount still to collect), Expenses this month (own card), Bills this month (count, sub: total billed).
- **BUG fixed — outstanding:** was `Σ bill.total − monthApproved` (global subtraction). Now per-bill: `Σ max(0, bill.totalAmount − approvedPaidForThatBill)`, with an unpaid/partially-paid bill count.
- **BUG fixed — expenses:** `monthExpenses` summed ALL expenses ever while net income was labelled "this month". Expenses are now scoped to the display month via `spentDate` within that `YYYY-MM`. Same check applied to `/reports`: its per-property outstanding was `max(0, billed − collected)` globally — now per-bill; its expenses were already date-filtered (correct) and its bills/expenses tables now have `overflow-auto` wrappers (were vertical-only).
- **Empty-dashboard fix:** the dashboard now defaults to the **latest month that has bills** for the org (falls back to the current period if none), with an amber note: *"Showing October 2026 — the latest month with bills. Generate November 2026 bills →"*. No fake November bills were seeded. The 4-month billed-vs-collected chart now ends at the display period instead of the calendar month, so chart and cards agree.

### 2. Flexible billing — verified (no code change needed)
Verified via the real API against a fresh org (see test results): all 12 charge controls list/save at ORG and UNIT level; two units hold different configs; a charge disabled for one unit is absent from that unit's generated bill — re-proved with a **different charge than Phase 1 (water tanker instead of electricity)**.
- Flat A-1 (water tanker disabled at unit level): rent 50,000 + maintenance 2,000 + water 1,000 + electricity 5,000 = **Rs. 58,000 — water tanker ABSENT**.
- Flat A-2 (inherits org default): rent 40,000 + maintenance 2,000 + water 1,000 + water tanker 3,000 + electricity 5,000 = **Rs. 51,000 — water tanker PRESENT**.

### 3. Tenant portal (`app/pay/[token]/page.tsx`, `PortalPaymentForm` in `components/forms.tsx`)
- After a successful submission the form now calls `router.refresh()` and shows a **green confirmation panel** with the submitted amount, method and reference, so the new payment appears in "Your payments on this bill" without a manual reload.
- New **"Submitted — awaiting verification"** row (sum of Pending payments) alongside "Verified paid" and "Remaining balance".
- Token-gated security unchanged; breakdown, method selector, reference, date, proof upload and history unchanged.

### 4. Payment verification (`app/payments/page.tsx` + new `app/api/payments/[id]/proof/route.ts`)
- **New admin proof endpoint** `GET /api/payments/[id]/proof`: requires a logged-in session, checks the payment belongs to the user's organization, serves the file from `uploads/proofs/` with the same path validation as the portal proof route (must stay under `uploads/proofs`).
- The payments page now renders the proof **inline**: `<img>` preview for images (click to open full size in a new tab) and an **"Open proof (PDF)"** button for PDFs. "No proof attached" shows only when there really is none. The old text telling the admin to "view it from the tenant portal link" is gone.
- Payment date (`paidDate`) added to each card. Approve/Reject + reason + notes + verified history + filter tabs unchanged.
- Verified: endpoint returns **200 + `image/png`** with a session, **401** without one, **404** for an unknown payment id.

### 5. Data consistency audit (`prisma/seed.ts` + `app/api/billing/generate/route.ts`)
- Seed due dates: were `d(5)` (5 days from seed time, i.e. next month). Now **10th of the billing period month** (Oct 10, 2026 for the Oct bills).
- Seed expenses: were relative `d(-6)/d(-12)/d(-15)` straddling two months. Now deterministic inside the billed month: **Oct 5 / Oct 12 / Oct 20**.
- Seed receipts: were hard-coded `KP-YYYY-0001/0002`. Now derived from the **global count of existing receipts** (same approach as the verify API), so seeding can never collide with another org's receipts.
- **Extra bug found during this review (fixed):** the generate API computed due dates as `new Date(year, month, 10)` — JS months are 0-indexed, so a November bill got **10 December** as its due date. Fixed to `month − 1`. The portal screenshot in the previous run proved it ("Due 10 Dec 2026"); after the fix it shows "Due 10 Nov 2026". Seed bills were already fixed the same way.
- Demo re-seeded and verified (see "Verified demo numbers" below).

### 6. Responsive design
- Screenshot-checked at **1280px, 768px and 390px** (dashboard, billing, payments, tenant portal). Sidebar hides below `md` and the existing mobile Menu top bar works; stat cards stack (single column at 390px); tables scroll horizontally without clipped content (billing history already had `overflow-x-auto`; reports tables gained `overflow-auto`); ChargeEditor rows use `flex-wrap` (verified in code; the one responsive caveat is in Remaining Tasks).
- Screenshot method: headless Chromium (Playwright browser binaries present on this machine, `chrome-headless-shell`) driven over CDP with a login + portal-link re-issue — no browser was installed.

---

## VERIFIED DEMO NUMBERS (after final re-seed, checked directly against the database)

Demo org "KirayaPro Demo Properties": 3 properties, 9 units (8 occupied), 8 tenants = **3 tenants · 5 shopkeepers/members**, Oct 2026 bills (due **10 Oct 2026**):

| Figure | Verified |
|---|---|
| Bills total (4 bills) | **Rs. 245,100** |
| Approved payments | **Rs. 130,300** — b1 Rs. 90,300 full (Paid) + b3 Rs. 40,000 partial (Partially Paid) |
| Outstanding (per-bill) | **Rs. 114,800** — b2 50,300 + b3 33,500 + b4 31,000 |
| Rent billed | **Rs. 215,000** |
| Maintenance billed | **Rs. 8,000** |
| Expenses in October | **Rs. 51,500** — Oct 5: 4,500 · Oct 12: 12,000 · Oct 20: 35,000 (all expenses are in October, so "all ever" = "this month" = 51,500) |
| Receipts | KP-2026-0001, KP-2026-0002 |
| Pending verifications | **1** (b4 Easypaisa Rs. 31,000) |
| Dashboard (demo login) | Defaults to **October 2026** with the latest-month note; Collected Rs. 130,300 · Outstanding Rs. 114,800 · Expenses Rs. 51,500 — all shown correctly |

## FULL WORKFLOW TEST — 53/53 PASS (final run, `/tmp/kp-review-test.mjs`)

Fresh throwaway org → property → 2 units → 2 tenants → org charges (maintenance 2,000, water 1,000, water tanker 3,000, electricity 5,000 actual-bill) → unit-level override disabling water tanker for Flat A-1 → preview → bulk generate Nov 2026 → duplicate generate refused **409** → portal links → partial payment Rs. 20,000 via JazzCash with PNG proof → duplicate payment refused **409** → admin proof endpoint 200/401/404 → approve → receipt with global sequence, remaining **Rs. 31,000** (51,000 − 20,000), bill **Partially Paid** → re-approve refused **409** → second payment → reject without reason fails **400** → reject with reason works → dashboard totals match approved payments exactly (collected 20,000; outstanding **89,000** = 58,000 + 31,000; billed 109,000) → demo dashboard checks (Oct defaults + note + all demo numbers above) → reports page 200.

Bugs caught by the test during this review and fixed before the final run: (1) the generate-API due-date off-by-one (Dec 10 instead of Nov 10); (2) two failures in the first run were test-script errors (org-level rent disabled by the test itself; wrong expected arithmetic 61,000 vs the correct 51,000) — the app was correct in both cases.

## Screenshots — `work/screenshots/` (new files, Phase 1 set untouched)

`11-dashboard-desktop.png` · `12-dashboard-mobile-390.png` · `13-dashboard-768.png` · `14-billing.png` · `15-payments-proof.png` · `16-tenant-portal.png` · `17-tenant-portal-mobile-390.png` · `18-payments-mobile-390.png`

Notes from visual review: dashboard shows all 12 stat cards with correct test-org numbers (collected 20,000 · outstanding 89,000 · rent collected 15,686 pro-rata · maintenance collected 784); payments page shows the proof image inline with payment date 14 Nov 2026 and receipt link; portal shows the full breakdown with water tanker, verified paid 20,000, remaining 31,000, "Due 10 Nov 2026". The proof image in the screenshot is a 1×1 test PNG, so it renders as a solid red block — a real tenant photo/screenshot will render normally. Billing history headers "Paid (verified)" and "Status" sit close together at 1280px (readable, not clipped).

## Cleanup

All 6 test orgs created across the review runs were deleted (`scripts/cleanup-test-orgs.ts`), all test proof uploads removed from `uploads/proofs/`, demo re-seeded pristine (`npm run db:seed`). Production server left RUNNING on :3200 with the new build.

---

## UPDATE — ChargeEditor inheritance fix (15 Nov 2026, owner-approved)

The remaining task #1 below is now **FIXED and verified 31/31** (test script `/tmp/kp-charge-fix-test.mjs`, screenshot `work/screenshots/19-charge-editor-inherited.png`).

- **API `app/api/charges/route.ts`:** GET now returns the *effective* charges for the scope (UNIT > PROPERTY > ORG > default) with each charge's `source` (UNIT/PROPERTY/ORG/DEFAULT), `overridden` (whether this scope holds an explicit row) and an `inherited` block (the value that would apply without this scope's row). POST now accepts a delta save — `changes[]` (upsert only those rows) and `clears[]` (delete the scope-local row, reverting to inherited); an empty delta is refused (400 "Nothing to save"). The legacy full-list `charges[]` save is still accepted.
- **UI `components/forms.tsx` (ChargeEditor):** every row shows its source badge — "Set here" (teal), "Inherited · Org", "Inherited · Property", "Default". Rows with an override get a "Revert to inherited" button (with Undo); editing a row back to exactly its inherited values auto-clears the override on save. The Save button is disabled with "No changes — nothing to save." until a row actually changes, and shows the change count ("Save 2 changes").
- **Verified on a fresh org:** org defaults maintenance 2000 / water 1000 / security 1500 → unit GET shows them as source ORG, not overridden; empty save refused and effective charges unchanged; changing only water OFF leaves maintenance/security inherited; bill preview total Rs. 53,500 with water absent; clearing the override restores water from org (1000); property-level generator 3000 inherited by the unit (source PROPERTY, preview total Rs. 57,500); legacy save still works.
- `npm run lint` PASS, `npm run build` PASS (webpack), server left running on :3200, test orgs deleted, demo re-seeded pristine.

## REMAINING TASKS

1. ~~**ChargeEditor inheritance footgun** — FIXED, see update above.~~
2. **Live deploy** — still local only; needs owner approval + VPS (same as before, SQLite does not persist on Netlify/Vercel).
3. **No real-phone test** — desktop browser + curl only, same as Phase 1.
4. **Phase 2 items (unchanged from Phase 1):** WhatsApp Business API automation, bank verification, full union module, notifications, custom roles, hard plan limits, day-end bulk entry, expense invoice upload UI, tenant self-edit.
5. **Portal confirmation state is browser-local:** after submitting, the green confirmation panel shows until the next navigation; the payment itself is persisted and listed as Pending (verified by API + screenshot). No change needed, noted for completeness.
