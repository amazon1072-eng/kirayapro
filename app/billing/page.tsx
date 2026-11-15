import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR, formatDate, periodLabel } from "@/lib/format";
import { Shell, Card, statusBadge } from "@/components/ui";
import { BillingGenerator } from "@/components/forms";

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const periodFilter = typeof sp?.period === "string" ? sp.period : undefined;
  const [properties, bills] = await Promise.all([
    prisma.property.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    prisma.bill.findMany({
      where: { organizationId: user.organizationId, ...(periodFilter ? { billingPeriod: periodFilter } : {}) },
      orderBy: [{ billingPeriod: "desc" }, { createdAt: "desc" }],
      include: { unit: { include: { property: true } }, tenant: true, payments: { where: { status: "Approved" } } },
      take: 100,
    }),
  ]);
  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Billing</h1>
      <p className="mb-5 text-sm text-slate-500">Preview every bill with each tenant&apos;s own charges, then generate them in one go. A bill can never be generated twice for the same unit and month.</p>
      <div className="mb-5">
        <Card title="Generate bills" sub="Old bills are snapshots — changing a charge now only affects future bills.">
          <BillingGenerator properties={properties.map((p) => ({ id: p.id, name: p.name }))} />
        </Card>
      </div>
      <Card title="Bill history" sub={periodFilter ? `Filtered: ${periodLabel(periodFilter)}` : "Latest 100 bills"}>
        {bills.length === 0 ? (
          <p className="text-sm text-slate-500">No bills yet. Generate your first month above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-2">Period</th><th>Property / Unit</th><th>Tenant</th><th className="text-right">Total</th><th className="text-right">Paid (verified)</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {bills.map((b) => {
                  const paid = b.payments.reduce((s, p) => s + p.amount, 0);
                  return (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="py-2">{periodLabel(b.billingPeriod)}</td>
                      <td>{b.unit.property.name} — {b.unit.unitNo}</td>
                      <td>{b.tenant?.fullName ?? "—"}</td>
                      <td className="text-right font-semibold">{formatPKR(b.totalAmount)}</td>
                      <td className="text-right text-emerald-700">{formatPKR(paid)}</td>
                      <td>{statusBadge(b.status)}</td>
                      <td className="text-right"><Link href={`/billing/${b.id}`} className="font-semibold text-teal-700">View</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">Due date is the 10th of the billing month. {formatDate(new Date())}</p>
      </Card>
    </Shell>
  );
}
