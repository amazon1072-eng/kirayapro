import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Shell, Card, statusBadge } from "@/components/ui";
import { TenantForm, SendReminderButton } from "@/components/forms";

export default async function TenantsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const perms = await effectivePermissions(user);
  const canRemind = perms.includes("reminders.send");
  const isOwnerOrAdmin = user.role === "OWNER" || user.role === "ADMIN";
  const [tenants, units] = await Promise.all([
    prisma.tenant.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      include: { unit: { include: { property: true } } },
    }),
    prisma.unit.findMany({ where: { organizationId: user.organizationId }, include: { property: true }, orderBy: { unitNo: "asc" } }),
  ]);
  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Tenants</h1>
      <p className="mb-5 text-sm text-slate-500">Tenants, shopkeepers and society members — each linked to a unit.</p>
      <div className="mb-5">
        <Card title="Add a tenant">
          <TenantForm units={units.map((u) => ({ id: u.id, label: `${u.property.name} — ${u.unitNo} (${u.kind}, Rs. ${u.monthlyRent.toLocaleString("en-PK")})` }))} />
        </Card>
      </div>
      <Card title={`${tenants.length} tenant(s)`}>
        {tenants.length === 0 ? (
          <p className="text-sm text-slate-500">No tenants yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-2">Name</th><th>Phone</th><th>CNIC</th><th>Unit</th><th>Type</th><th>Start</th><th>Agreement ends</th><th>Status</th>{canRemind ? <th>Agreement reminder</th> : null}</tr></thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="py-2 font-medium">{t.fullName}{t.membershipNo ? <span className="block text-xs text-slate-400">Member #{t.membershipNo}</span> : null}</td>
                    <td>{t.phone}</td>
                    <td>{t.cnic ?? "—"}</td>
                    <td>{t.unit ? `${t.unit.property.name} — ${t.unit.unitNo}` : "—"}</td>
                    <td>{t.memberType ?? "Tenant"}</td>
                    <td>{formatDate(t.rentalStart)}</td>
                    <td>{formatDate(t.rentalEnd)}</td>
                    <td>{statusBadge(t.status)}</td>
                    {canRemind ? (
                      <td>
                        {t.rentalEnd ? (
                          <SendReminderButton type="agreement_expiry" tenantId={t.id} isOwnerOrAdmin={isOwnerOrAdmin} label="Send Reminder Again" />
                        ) : (
                          <span className="text-xs text-slate-400">No end date</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Shell>
  );
}
