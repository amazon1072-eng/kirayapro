import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR, formatDate, currentPeriod, periodLabel } from "@/lib/format";
import { Shell, StatCard, Card, statusBadge } from "@/components/ui";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const orgId = user.organizationId;

  // Default to the LATEST month that actually has bills for this org, so a
  // first open never shows an empty Rs. 0 dashboard when bills exist for an
  // earlier month (demo bills are October, not the current month).
  const latestBill = await prisma.bill.findFirst({
    where: { organizationId: orgId, status: { not: "Cancelled" } },
    orderBy: { billingPeriod: "desc" },
    select: { billingPeriod: true },
  });
  const current = currentPeriod();
  const period = latestBill?.billingPeriod ?? current;
  const showingLatest = !!latestBill && latestBill.billingPeriod !== current;
  const [py, pm] = period.split("-").map(Number);
  const periodStart = new Date(py, pm - 1, 1);
  const periodEnd = new Date(py, pm, 1);

  const [properties, units, tenants, bills, payments, expenses, maintenance] = await Promise.all([
    prisma.property.findMany({ where: { organizationId: orgId } }),
    prisma.unit.findMany({ where: { organizationId: orgId } }),
    prisma.tenant.findMany({ where: { organizationId: orgId, status: "Active" }, orderBy: { rentalEnd: "asc" } }),
    prisma.bill.findMany({ where: { organizationId: orgId, billingPeriod: period, status: { not: "Cancelled" } }, include: { unit: true, tenant: true } }),
    prisma.payment.findMany({ where: { organizationId: orgId, status: "Approved" }, include: { bill: true } }),
    prisma.expense.findMany({ where: { organizationId: orgId, spentDate: { gte: periodStart, lt: periodEnd } } }),
    prisma.maintenanceRequest.findMany({ where: { organizationId: orgId, status: { in: ["Pending", "Assigned", "In Progress"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const occupied = units.filter((u) => u.status === "Occupied").length;
  const occupancy = units.length ? Math.round((occupied / units.length) * 100) : 0;

  const monthBillsTotal = bills.reduce((s, b) => s + b.totalAmount, 0);
  const monthPayments = payments.filter((p) => p.bill.billingPeriod === period);
  const monthApproved = monthPayments.reduce((s, p) => s + p.amount, 0);

  // Outstanding, PER BILL: sum of max(0, bill total - approved paid for THAT bill).
  // (The old code subtracted the month's total approved from the month's total
  // billed globally, which misstates outstanding whenever a payment lands on
  // a bill from another month or a bill is overpaid.)
  const approvedByBill = new Map<string, number>();
  for (const p of monthPayments) {
    approvedByBill.set(p.billId, (approvedByBill.get(p.billId) ?? 0) + p.amount);
  }
  let outstanding = 0;
  let outstandingCount = 0;
  for (const b of bills) {
    const paid = approvedByBill.get(b.id) ?? 0;
    const left = Math.max(0, b.totalAmount - paid);
    outstanding += left;
    if (left > 0) outstandingCount++;
  }

  // Rent vs maintenance kept SEPARATE (from bill snapshots).
  let rentBilled = 0, maintBilled = 0, rentCollected = 0, maintCollected = 0;
  for (const b of bills) {
    const items = JSON.parse(b.itemsJson) as { chargeKey: string; amount: number }[];
    rentBilled += items.filter((i) => i.chargeKey === "rent").reduce((s, i) => s + i.amount, 0);
    maintBilled += items.filter((i) => i.chargeKey === "maintenance").reduce((s, i) => s + i.amount, 0);
  }
  // Approved payments split pro-rata across rent/maintenance for the report.
  for (const p of monthPayments) {
    const items = JSON.parse(p.bill.itemsJson) as { chargeKey: string; amount: number }[];
    const total = p.bill.totalAmount || 1;
    const rentShare = items.filter((i) => i.chargeKey === "rent").reduce((s, i) => s + i.amount, 0) / total;
    const maintShare = items.filter((i) => i.chargeKey === "maintenance").reduce((s, i) => s + i.amount, 0) / total;
    rentCollected += Math.round(p.amount * rentShare);
    maintCollected += Math.round(p.amount * maintShare);
  }
  // Expenses scoped to the display month only (spentDate within YYYY-MM).
  const monthExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netIncome = monthApproved - monthExpenses;

  const tenantCount = tenants.filter((t) => t.memberType === "Tenant").length;
  const shopkeeperCount = tenants.length - tenantCount;

  const nowMs = new Date().getTime();
  const expiring = tenants.filter((t) => t.rentalEnd && t.rentalEnd.getTime() < nowMs + 60 * 24 * 60 * 60 * 1000);
  const pendingPayments = await prisma.payment.count({ where: { organizationId: orgId, status: "Pending" } });

  // Simple SVG bar chart: billed vs collected per period (last 4 periods
  // ending at the display period, so the chart matches the month shown).
  const periods: string[] = [];
  for (let i = 3; i >= 0; i--) {
    const t = new Date(py, pm - 1 - i, 1);
    periods.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
  }
  const allBills = await prisma.bill.findMany({ where: { organizationId: orgId, billingPeriod: { in: periods }, status: { not: "Cancelled" } }, include: { payments: { where: { status: "Approved" } } } });
  const chart = periods.map((p) => {
    const bs = allBills.filter((b) => b.billingPeriod === p);
    const billed = bs.reduce((s, b) => s + b.totalAmount, 0);
    const collected = bs.reduce((s, b) => s + b.payments.reduce((x, y) => x + y.amount, 0), 0);
    return { period: p, billed, collected };
  });
  const maxVal = Math.max(1, ...chart.map((c) => c.billed));

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard — {user.orgName}</h1>
          <p className="text-sm text-slate-500">{periodLabel(period)} · {user.orgPlan} plan{user.orgIsDemo ? " · DEMO data" : ""}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/billing" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Generate bills</Link>
          <Link href="/payments" className="rounded-lg bg-[#0b2545] px-4 py-2 text-sm font-semibold text-white">Verify payments ({pendingPayments} pending)</Link>
        </div>
      </div>

      {showingLatest ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 ring-1 ring-amber-200">
          Showing {periodLabel(period)} — the latest month with bills.{" "}
          <Link href="/billing" className="font-bold underline">Generate {periodLabel(current)} bills →</Link>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected this month" value={formatPKR(monthApproved)} sub={`${bills.length} bill(s) · ${formatPKR(monthBillsTotal)} billed`} tone="emerald" />
        <StatCard label="Outstanding this month" value={formatPKR(Math.max(0, outstanding))} sub={`${outstandingCount} unpaid / partially paid bill(s)`} tone="amber" />
        <StatCard label="Occupancy" value={`${occupancy}%`} sub={`${occupied} of ${units.length} units occupied`} tone="navy" />
        <StatCard label="Net income (collected − expenses)" value={formatPKR(netIncome)} sub={`Expenses this month ${formatPKR(monthExpenses)}`} tone="teal" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Properties" value={String(properties.length)} sub={`${units.length} units in total`} tone="navy" />
        <StatCard label="Tenants & shopkeepers" value={String(tenants.length)} sub={`${tenantCount} tenant(s) · ${shopkeeperCount} shopkeeper(s) / member(s)`} tone="sky" />
        <StatCard label="Rent collected" value={formatPKR(rentCollected)} sub={`Rent billed ${formatPKR(rentBilled)}`} tone="teal" />
        <StatCard label="Maintenance collected" value={formatPKR(maintCollected)} sub={`Maintenance billed ${formatPKR(maintBilled)}`} tone="emerald" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/payments" className="block">
          <StatCard label="Pending verifications" value={String(pendingPayments)} sub="Tap to verify payments →" tone="amber" />
        </Link>
        <StatCard label="Outstanding bills" value={String(outstandingCount)} sub={`${formatPKR(Math.max(0, outstanding))} still to collect`} tone="red" />
        <StatCard label="Expenses this month" value={formatPKR(monthExpenses)} sub={`${expenses.length} expense(s) in ${periodLabel(period)}`} tone="violet" />
        <StatCard label="Bills this month" value={String(bills.length)} sub={`${formatPKR(monthBillsTotal)} billed in total`} tone="navy" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Rent vs maintenance — this month" sub="Kept separate, as requested. Collected is split from approved payments.">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Rent billed</span><b>{formatPKR(rentBilled)}</b></div>
            <div className="flex justify-between"><span>Rent collected</span><b className="text-emerald-700">{formatPKR(rentCollected)}</b></div>
            <div className="flex justify-between"><span>Maintenance billed</span><b>{formatPKR(maintBilled)}</b></div>
            <div className="flex justify-between"><span>Maintenance collected</span><b className="text-emerald-700">{formatPKR(maintCollected)}</b></div>
          </div>
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold">Billed vs collected (last 4 months)</p>
            <svg viewBox="0 0 400 140" className="w-full">
              {chart.map((c, i) => {
                const x = 20 + i * 95;
                const bh = Math.round((c.billed / maxVal) * 100);
                const ch = Math.round((c.collected / maxVal) * 100);
                return (
                  <g key={c.period}>
                    <rect x={x} y={120 - bh} width={28} height={bh} rx={3} fill="#0f766e" />
                    <rect x={x + 32} y={120 - ch} width={28} height={ch} rx={3} fill="#10b981" />
                    <text x={x + 30} y={135} fontSize={10} textAnchor="middle" fill="#64748b">{c.period.slice(5)}/{c.period.slice(2, 4)}</text>
                  </g>
                );
              })}
            </svg>
            <p className="text-xs text-slate-500"><span className="text-teal-700">■</span> Billed &nbsp; <span className="text-emerald-500">■</span> Collected</p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Agreements expiring soon" sub="Next 60 days — renew or follow up.">
            {expiring.length === 0 ? (
              <p className="text-sm text-slate-500">No agreements expiring in the next 60 days.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {expiring.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                    <span>{t.fullName} <span className="text-slate-400">({t.phone})</span></span>
                    <span className="font-semibold text-amber-700">{formatDate(t.rentalEnd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Open maintenance" sub="Pending / assigned / in progress.">
            {maintenance.length === 0 ? (
              <p className="text-sm text-slate-500">No open maintenance requests. <Link href="/maintenance" className="font-semibold text-teal-700">Add one →</Link></p>
            ) : (
              <ul className="space-y-2 text-sm">
                {maintenance.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                    <span>{m.title}</span>
                    {statusBadge(m.status)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card title={`This month's bills — ${periodLabel(period)}`} actions={<Link href="/billing" className="text-sm font-semibold text-teal-700">All bills →</Link>}>
          {bills.length === 0 ? (
            <p className="text-sm text-slate-500">No bills generated for this month yet. <Link href="/billing" className="font-semibold text-teal-700">Generate them →</Link></p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">Unit</th><th>Tenant</th><th className="text-right">Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-2">{b.unit.unitNo}</td>
                      <td>{b.tenant?.fullName ?? "—"}</td>
                      <td className="text-right font-semibold">{formatPKR(b.totalAmount)}</td>
                      <td>{statusBadge(b.status)}</td>
                      <td className="text-right"><Link href={`/billing/${b.id}`} className="font-semibold text-teal-700">View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
