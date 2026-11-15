import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR, formatDate, periodLabel, periodsInRange } from "@/lib/format";
import { Shell, Card, statusBadge, StatCard } from "@/components/ui";
import { PrintButton } from "@/components/forms";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const from = typeof sp?.from === "string" && sp.from ? sp.from : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const to = typeof sp?.to === "string" && sp.to ? sp.to : new Date().toISOString().slice(0, 10);
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);

  // B-4 fix: bills are matched by billingPeriod (the month they belong to),
  // not by createdAt (when they were generated) — a late-generated bill
  // lands in its own month's report. Expenses still use their real date.
  const periods = periodsInRange(fromDate, toDate);
  const [bills, expenses, properties] = await Promise.all([
    prisma.bill.findMany({
      where: { organizationId: user.organizationId, billingPeriod: { in: periods }, status: { not: "Cancelled" } },
      include: { unit: { include: { property: true } }, tenant: true, payments: { where: { status: "Approved" } } },
      orderBy: [{ billingPeriod: "desc" }, { createdAt: "desc" }],
    }),
    prisma.expense.findMany({ where: { organizationId: user.organizationId, spentDate: { gte: fromDate, lte: toDate } }, orderBy: { spentDate: "desc" } }),
    prisma.property.findMany({ where: { organizationId: user.organizationId }, include: { units: true } }),
  ]);

  const billed = bills.reduce((s, b) => s + b.totalAmount, 0);
  const collected = bills.reduce((s, b) => s + b.payments.reduce((x, p) => x + p.amount, 0), 0);
  const outstanding = bills.reduce((s, b) => s + Math.max(0, b.totalAmount - b.payments.reduce((x, p) => x + p.amount, 0)), 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  let rentBilled = 0, maintBilled = 0;
  for (const b of bills) {
    const items = JSON.parse(b.itemsJson) as { chargeKey: string; amount: number }[];
    rentBilled += items.filter((i) => i.chargeKey === "rent").reduce((s, i) => s + i.amount, 0);
    maintBilled += items.filter((i) => i.chargeKey === "maintenance").reduce((s, i) => s + i.amount, 0);
  }

  const perProperty = properties.map((p) => {
    const pb = bills.filter((b) => b.unit.propertyId === p.id);
    const pbilled = pb.reduce((s, b) => s + b.totalAmount, 0);
    const pcollected = pb.reduce((s, b) => s + b.payments.reduce((x, y) => x + y.amount, 0), 0);
    const pexp = expenses.filter((e) => e.propertyId === p.id).reduce((s, e) => s + e.amount, 0);
    const pout = pb.reduce((s, b) => s + Math.max(0, b.totalAmount - b.payments.reduce((x, y) => x + y.amount, 0)), 0);
    const occ = p.units.length ? Math.round((p.units.filter((u) => u.status === "Occupied").length / p.units.length) * 100) : 0;
    return { name: p.name, units: p.units.length, occupancy: occ, billed: pbilled, collected: pcollected, outstanding: pout, expenses: pexp };
  });

  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Reports</h1>
      <p className="mb-5 text-sm text-slate-500">Collection, outstanding, occupancy, rent vs maintenance, expenses and net income — bills by billing month, expenses by date.</p>
      <form method="get" className="no-print mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="block"><span className="mb-1 block text-xs font-semibold uppercase text-slate-500">From</span>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold uppercase text-slate-500">To</span>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Apply filter</button>
        <a href={`/api/reports/csv?from=${from}&to=${to}`} className="rounded-lg bg-[#0b2545] px-4 py-2 text-sm font-semibold text-white">Download CSV</a>
        <PrintButton />
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total billed" value={formatPKR(billed)} sub={`Rent ${formatPKR(rentBilled)} · Maintenance ${formatPKR(maintBilled)}`} tone="navy" />
        <StatCard label="Verified collection" value={formatPKR(collected)} sub="Approved payments only" tone="emerald" />
        <StatCard label="Outstanding" value={formatPKR(outstanding)} sub="Billed minus verified paid" tone="amber" />
        <StatCard label="Net income" value={formatPKR(collected - totalExpenses)} sub={`Expenses ${formatPKR(totalExpenses)}`} tone="teal" />
      </div>

      <div className="mt-4">
        <Card title="Property-wise report">
          {perProperty.length === 0 ? <p className="text-sm text-slate-500">No properties yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">Property</th><th>Units</th><th>Occupancy</th><th className="text-right">Billed</th><th className="text-right">Collected</th><th className="text-right">Outstanding</th><th className="text-right">Expenses</th></tr></thead>
                <tbody>
                  {perProperty.map((p) => (
                    <tr key={p.name} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{p.name}</td><td>{p.units}</td><td>{p.occupancy}%</td>
                      <td className="text-right">{formatPKR(p.billed)}</td>
                      <td className="text-right text-emerald-700">{formatPKR(p.collected)}</td>
                      <td className="text-right text-red-600">{formatPKR(p.outstanding)}</td>
                      <td className="text-right">{formatPKR(p.expenses)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Bills in this period">
          {bills.length === 0 ? <p className="text-sm text-slate-500">No bills in this date range.</p> : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Period</th><th>Unit</th><th className="text-right">Total</th><th>Status</th></tr></thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-1.5">{periodLabel(b.billingPeriod)}</td>
                      <td>{b.unit.property.name} — {b.unit.unitNo}</td>
                      <td className="text-right">{formatPKR(b.totalAmount)}</td>
                      <td>{statusBadge(b.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Expenses in this period">
          {expenses.length === 0 ? <p className="text-sm text-slate-500">No expenses in this date range.</p> : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Date</th><th>Description</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="py-1.5">{formatDate(e.spentDate)}</td>
                      <td>{e.description} <span className="text-xs text-slate-400">({e.category}{e.vendor ? ` · ${e.vendor}` : ""})</span></td>
                      <td className="text-right">{formatPKR(e.amount)}</td>
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
