# KirayaPro — Phase 1 (local only)

Property / rental management SaaS for Pakistani owners. Next.js 16 + React 19 + TypeScript + Tailwind 4, Prisma 6 + SQLite (local file, no monthly fee, no Supabase/Firebase).

## Run it

```bash
cd ~/workspace/kirayapro
npm run db:migrate   # first time only (or: npx prisma migrate dev)
npm run db:seed      # demo data (demo@kirayapro.pk / Demo1234)
npm run build
npm start            # production server on http://localhost:3200
# or: npm run dev    # dev server on :3200
```

Demo login: **demo@kirayapro.pk / Demo1234** (demo org, badged DEMO, clearable from Settings).

## What is in Phase 1

- Landing + register (creates Organization + owner in one flow) + login (bcrypt, httpOnly cookies)
- Properties / Units / Tenants CRUD, org-scoped (multi-tenant isolation at app level)
- Flexible billing: 12 charges, UNIT > PROPERTY > ORG overrides, disabled = never billed, bill snapshots (old bills never change), bulk preview + generate, duplicate (unit, period) blocked
- Tenant portal: unguessable hashed token link per bill, 30-day expiry, revocable; payment + proof upload; only that bill visible
- Payment verification: approve (issues KP-YYYY-NNNN receipt) / reject with reason; partial payments; unique (bill, reference, amount) duplicate guard
- Digital receipts (printable, Save-as-PDF via browser), dashboard + reports (rent vs maintenance separate, occupancy, expenses, net income, CSV export), maintenance + expenses, roles (Owner/Admin/Manager/Accountant), plans shown (not hard-enforced)

## Deliberately NOT in Phase 1

WhatsApp Business API automation (manual wa.me share button instead), bank verification, AI, barcode, full union module, notifications engine, custom roles, hard plan limits.
