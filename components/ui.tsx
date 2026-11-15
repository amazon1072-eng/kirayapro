import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPKR } from "@/lib/format";

export type StatTone = "teal" | "emerald" | "amber" | "navy" | "red" | "violet" | "sky";

const TONES: Record<StatTone, string> = {
  teal: "from-teal-600 to-teal-500",
  emerald: "from-emerald-600 to-emerald-500",
  amber: "from-amber-500 to-orange-400",
  navy: "from-[#0b2545] to-[#164e78]",
  red: "from-rose-600 to-red-500",
  violet: "from-violet-600 to-purple-500",
  sky: "from-sky-600 to-cyan-500",
};

export function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: StatTone }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className={`bg-gradient-to-r ${TONES[tone]} px-4 py-3`}>
        <p className="text-sm font-semibold text-white">{label}</p>
      </div>
      <div className="px-4 py-4">
        <p className="text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
        {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
      </div>
    </div>
  );
}

export function Card({ title, sub, children, actions }: { title?: string; sub?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="print-card rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {sub ? <p className="text-sm text-slate-500">{sub}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "slate" | "teal"; children: ReactNode }) {
  const cls = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-sky-100 text-sky-800",
    slate: "bg-slate-100 text-slate-700",
    teal: "bg-teal-100 text-teal-800",
  }[tone];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function statusBadge(status: string) {
  const map: Record<string, "green" | "amber" | "red" | "blue" | "slate" | "teal"> = {
    Paid: "green", Approved: "green", Completed: "green", Active: "green", Occupied: "green",
    "Partially Paid": "amber", Pending: "amber", Assigned: "blue", "In Progress": "blue",
    Unpaid: "red", Rejected: "red", Voided: "red", Cancelled: "slate", Vacant: "slate", Inactive: "slate", Left: "slate",
  };
  return <Badge tone={map[status] ?? "slate"}>{status}</Badge>;
}

export function Money({ value }: { value: number }) {
  return <span className="font-semibold">{formatPKR(value)}</span>;
}

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/properties", label: "Properties & Units" },
  { href: "/tenants", label: "Tenants" },
  { href: "/billing", label: "Billing" },
  { href: "/payments", label: "Payment Verification" },
  { href: "/maintenance", label: "Maintenance & Expenses" },
  { href: "/union", label: "Union" },
  { href: "/notifications", label: "Notifications" },
  { href: "/reminders", label: "Reminders" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export async function Shell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const unreadCount = await prisma.notification.count({
    where: { organizationId: user.organizationId, isRead: false },
  });
  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-[#0b2545] text-white md:flex">
        <div className="px-5 pb-4 pt-6">
          <div className="flex items-start justify-between">
            <Link href="/dashboard" className="text-2xl font-extrabold tracking-tight">Kiraya<span className="text-teal-400">Pro</span></Link>
            <Link href="/notifications" className="relative rounded-lg bg-white/10 px-2.5 py-1.5 text-sm" aria-label="Notifications">
              🔔
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>
              ) : null}
            </Link>
          </div>
          <p className="mt-1 text-xs text-slate-300">Har Unit Ka Hisaab, Har Malik Ka Aitmaad</p>
          {user.orgIsDemo ? (
            <span className="mt-3 inline-block rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-amber-950">DEMO DATA</span>
          ) : null}
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              <span>{n.label}</span>
              {n.href === "/notifications" && unreadCount > 0 ? (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-sm">
          <p className="font-semibold">{user.fullName}</p>
          <p className="text-xs text-slate-300">{user.orgName}</p>
          <p className="text-xs text-teal-300">{user.role} · {user.orgPlan} plan</p>
          <form action="/api/auth/logout" method="post" className="mt-3">
            <button className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20">Log out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 md:hidden">
          <Link href="/dashboard" className="text-xl font-extrabold text-[#0b2545]">Kiraya<span className="text-teal-600">Pro</span></Link>
          <div className="flex items-center gap-2">
            <Link href="/notifications" className="relative rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold" aria-label="Notifications">
              🔔
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>
              ) : null}
            </Link>
            <details className="relative">
              <summary className="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold">Menu</summary>
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100">{n.label}</Link>
                ))}
              </div>
            </details>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
