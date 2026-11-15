import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Landing() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="min-h-screen bg-[#0b2545] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="text-2xl font-extrabold">Kiraya<span className="text-teal-400">Pro</span></span>
        <div className="flex gap-2">
          <Link href="/login" className="rounded-lg border border-white/40 px-4 py-2 text-sm font-semibold hover:bg-white/10">Log in</Link>
          <Link href="/register" className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600">Start free</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Har Unit Ka Hisaab,<br />Har Malik Ka Aitmaad.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Property and rental management for Pakistani owners — houses, flats, plazas, shops and markets.
          Flexible billing, tenant payment links, digital receipts and clear reports. No app needed for tenants.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/register" className="rounded-xl bg-teal-500 px-6 py-3 font-bold text-white hover:bg-teal-600">Create your organization — free</Link>
          <Link href="/login" className="rounded-xl border border-white/40 px-6 py-3 font-bold hover:bg-white/10">Try the demo (demo@kirayapro.pk / Demo1234)</Link>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Flexible billing", "Rent, maintenance, bijli sub-meter, paani tanker, gas, security — per unit, per property or org-wide. Disabled charges never appear on a bill."],
            ["Tenant payment portal", "Each bill gets a secure link. Tenants pay via Cash, bank, Easypaisa or JazzCash and upload proof — no app, no login."],
            ["Verified receipts", "Approve a payment and a numbered receipt (KP-2026-0001) is issued automatically. Partial payments supported."],
            ["Reports that add up", "Monthly collection, outstanding, occupancy, rent vs maintenance kept separate, expenses and net income. CSV export included."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15">
              <h3 className="font-bold">{t}</h3>
              <p className="mt-2 text-sm text-slate-300">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 text-sm text-slate-400">
          Local only build — your data stays in a file on this computer. Union module, notifications, custom roles and plan limits are included. WhatsApp Business API and live bank verification are NOT connected (manual WhatsApp sharing and manual payment verification instead) — those need the owner&apos;s accounts and approval.
        </p>
      </main>
    </div>
  );
}
