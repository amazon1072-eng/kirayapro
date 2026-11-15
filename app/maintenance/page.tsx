import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR, formatDate } from "@/lib/format";
import { Shell, Card } from "@/components/ui";
import { MaintenanceForm, ExpenseForm, ExpenseInvoiceUpload } from "@/components/forms";
import { MaintenanceStatus } from "@/components/MaintenanceStatus";

export default async function MaintenancePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [requests, expenses, properties] = await Promise.all([
    prisma.maintenanceRequest.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, include: { expenses: true } }),
    prisma.expense.findMany({ where: { organizationId: user.organizationId }, orderBy: { spentDate: "desc" }, take: 50 }),
    prisma.property.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Maintenance &amp; Expenses</h1>
      <p className="mb-5 text-sm text-slate-500">Requests with category, priority and assigned staff — plus the money spent on them.</p>
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card title="New maintenance request"><MaintenanceForm properties={properties.map((p) => ({ id: p.id, name: p.name }))} /></Card>
        <Card title="Record an expense"><ExpenseForm properties={properties.map((p) => ({ id: p.id, name: p.name }))} maintenance={requests.map((r) => ({ id: r.id, title: r.title }))} /></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`${requests.length} maintenance request(s)`}>
          {requests.length === 0 ? <p className="text-sm text-slate-500">No requests yet.</p> : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">{r.title}</p>
                    <MaintenanceStatus id={r.id} status={r.status} />
                  </div>
                  <p className="text-sm text-slate-600">{r.category} · Priority: <b>{r.priority}</b> · Assigned: {r.assignedStaff ?? "—"}</p>
                  {r.description ? <p className="text-sm text-slate-500">{r.description}</p> : null}
                  <p className="text-xs text-slate-400">Created {formatDate(r.createdAt)}{r.costEstimate ? ` · Estimate ${formatPKR(r.costEstimate)}` : ""}{r.expenses.length ? ` · Spent ${formatPKR(r.expenses.reduce((s, e) => s + e.amount, 0))}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Expenses">
          {expenses.length === 0 ? <p className="text-sm text-slate-500">No expenses recorded yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-1">Date</th><th>Description</th><th>Vendor</th><th className="text-right">Amount</th><th className="pl-4">Invoice</th></tr></thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="py-1.5">{formatDate(e.spentDate)}</td>
                      <td>{e.description} <span className="text-xs text-slate-400">({e.category})</span></td>
                      <td>{e.vendor ?? "—"}</td>
                      <td className="text-right font-semibold">{formatPKR(e.amount)}</td>
                      <td className="pl-4">
                        {e.invoicePath ? (
                          <a href={`/api/expenses/${e.id}/invoice`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-teal-700">View invoice</a>
                        ) : (
                          <ExpenseInvoiceUpload expenseId={e.id} kind="expense" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-sm">Total shown: <b>{formatPKR(expenses.reduce((s, e) => s + e.amount, 0))}</b></p>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}
