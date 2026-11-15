import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR, formatDate, currentPeriod } from "@/lib/format";
import { Shell, Card, StatCard, statusBadge, Badge } from "@/components/ui";
import {
  UnionProfileForm, UnionMemberForm, UnionMemberActions, UnionFeeForm,
  UnionFeeGenerate, UnionFeeCollect, UnionExpenseForm, ExpenseInvoiceUpload,
} from "@/components/forms";

export default async function UnionPage({ searchParams }: PageProps<"/union">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const unionIdParam = typeof sp?.unionId === "string" ? sp.unionId : "";
  const period = typeof sp?.period === "string" && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriod();

  const unions = await prisma.union.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
  });
  const union = unions.find((u) => u.id === unionIdParam) ?? unions[0] ?? null;

  const [members, fees, collections, expenses, units, tenants] = union
    ? await Promise.all([
        prisma.unionMember.findMany({ where: { unionId: union.id }, orderBy: { membershipNo: "asc" }, include: { unit: { include: { property: true } }, tenant: true } }),
        prisma.unionFee.findMany({ where: { unionId: union.id }, orderBy: { createdAt: "asc" } }),
        prisma.unionFeeCollection.findMany({ where: { unionId: union.id, billingPeriod: period }, orderBy: { createdAt: "asc" }, include: { member: true } }),
        prisma.unionExpense.findMany({ where: { unionId: union.id }, orderBy: { spentDate: "desc" }, take: 50 }),
        prisma.unit.findMany({ where: { organizationId: user.organizationId }, orderBy: { unitNo: "asc" }, include: { property: true } }),
        prisma.tenant.findMany({ where: { organizationId: user.organizationId }, orderBy: { fullName: "asc" } }),
      ])
    : [[], [], [], [], [], []];

  const allCollections = union
    ? await prisma.unionFeeCollection.findMany({ where: { unionId: union.id } })
    : [];
  const allExpenses = union
    ? await prisma.unionExpense.findMany({ where: { unionId: union.id } })
    : [];
  // Previous month link for the collections card (demo data lives in last month).
  const [py, pm] = period.split("-").map(Number);
  const prevDate = new Date(py, pm - 2, 1);
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const billed = allCollections.reduce((s, c) => s + c.amount, 0);
  const collected = allCollections.filter((c) => c.status === "Paid").reduce((s, c) => s + c.amount, 0);
  const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Union</h1>
      <p className="mb-5 text-sm text-slate-500">
        Market / traders union — members, monthly fees and union expenses. Union money is kept completely separate from rent bills and never appears in rent reports.
      </p>

      {unions.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {unions.map((u) => (
            <Link key={u.id} href={`/union?unionId=${u.id}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${union?.id === u.id ? "bg-teal-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>
              {u.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Union profile" sub="President, contact and registration.">
          <UnionProfileForm union={union} />
        </Card>
        {union ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Fees billed (all time)" value={formatPKR(billed)} sub={`${allCollections.length} fee record(s)`} tone="navy" />
            <StatCard label="Fees collected" value={formatPKR(collected)} sub={`Pending: ${formatPKR(billed - collected)}`} tone="teal" />
            <StatCard label="Union expenses" value={formatPKR(totalExpenses)} sub={`${allExpenses.length} expense(s)`} tone="amber" />
            <StatCard label="Union fund balance" value={formatPKR(collected - totalExpenses)} sub="Collected − expenses" tone="emerald" />
          </div>
        ) : (
          <Card title="No union yet"><p className="text-sm text-slate-500">Create a union profile to add members, fees and expenses.</p></Card>
        )}
      </div>

      {union ? (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card title="Add a member" sub="Membership, shop ownership and tenancy are separate records.">
              <UnionMemberForm
                unionId={union.id}
                units={units.map((u) => ({ id: u.id, label: `${u.property.name} — ${u.unitNo}` }))}
                tenants={tenants.map((t) => ({ id: t.id, name: t.fullName }))}
              />
            </Card>
            <Card title="Fee config" sub="Active fees are used when generating a period.">
              <UnionFeeForm unionId={union.id} />
              {fees.length === 0 ? <p className="mt-2 text-sm text-slate-500">No fee config yet.</p> : (
                <ul className="mt-3 space-y-1 text-sm">
                  {fees.map((f) => (
                    <li key={f.id} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                      <span>{f.label} · {f.period}</span>
                      <span><b>{formatPKR(f.amount)}</b> {f.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title={`${members.length} member(s)`} sub="Membership no., name, phone, linked shop, status.">
            {members.length === 0 ? <p className="text-sm text-slate-500">No members yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-500"><th className="py-1">No.</th><th>Name</th><th>Phone</th><th>Shop / unit</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="py-1.5 font-semibold">{m.membershipNo}</td>
                        <td>{m.fullName}</td>
                        <td>{m.phone}</td>
                        <td>{m.unit ? `${m.unit.property.name} — ${m.unit.unitNo}` : "—"}</td>
                        <td>{statusBadge(m.status)}</td>
                        <td><UnionMemberActions memberId={m.id} status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="mt-4">
            <Card title={`Fee collections — ${period}`} sub="Generate once per month per member; duplicates are refused.">
              <UnionFeeGenerate unionId={union.id} />
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Link href={`/union?unionId=${union.id}&period=${period}`} className="rounded-full bg-teal-700 px-3 py-1 font-semibold text-white">This month ({period})</Link>
                <Link href={`/union?unionId=${union.id}&period=${prevPeriod}`} className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700 ring-1 ring-slate-300">Previous month ({prevPeriod})</Link>
              </div>
              {collections.length === 0 ? <p className="mt-3 text-sm text-slate-500">No fee records for {period} yet — generate them above.</p> : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Member</th><th className="text-right">Amount</th><th>Status</th><th>Method</th><th>Action</th></tr></thead>
                    <tbody>
                      {collections.map((c) => (
                        <tr key={c.id} className="border-t border-slate-100">
                          <td className="py-1.5">{c.member.fullName} <span className="text-xs text-slate-400">({c.member.membershipNo})</span></td>
                          <td className="text-right font-semibold">{formatPKR(c.amount)}</td>
                          <td>{statusBadge(c.status)}</td>
                          <td>{c.method ?? "—"}{c.paidDate ? <span className="block text-xs text-slate-400">{formatDate(c.paidDate)}</span> : null}</td>
                          <td>{c.status === "Pending" ? <UnionFeeCollect collectionId={c.id} /> : <span className="text-xs text-emerald-700">Collected</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Record a union expense" sub="Separate from property expenses.">
              <UnionExpenseForm unionId={union.id} />
            </Card>
            <Card title="Union expenses">
              {expenses.length === 0 ? <p className="text-sm text-slate-500">No union expenses yet.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Date</th><th>Description</th><th className="text-right">Amount</th><th className="pl-4">Invoice</th></tr></thead>
                    <tbody>
                      {expenses.map((e) => (
                        <tr key={e.id} className="border-t border-slate-100">
                          <td className="py-1.5">{formatDate(e.spentDate)}</td>
                          <td>{e.description} <span className="text-xs text-slate-400">({e.category}{e.vendor ? ` · ${e.vendor}` : ""})</span></td>
                          <td className="text-right font-semibold">{formatPKR(e.amount)}</td>
                          <td className="pl-4">
                            {e.invoicePath ? (
                              <a href={`/api/union/expenses/${e.id}/invoice`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-700">View invoice</a>
                            ) : (
                              <ExpenseInvoiceUpload expenseId={e.id} kind="union-expense" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-sm">Total union expenses: <b>{formatPKR(totalExpenses)}</b> · Fund balance: <b>{formatPKR(collected - totalExpenses)}</b></p>
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </Shell>
  );
}
