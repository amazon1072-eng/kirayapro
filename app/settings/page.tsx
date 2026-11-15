import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageOrgUser } from "@/lib/auth";
import { PLANS } from "@/lib/billing";
import { planLimits, fmtLimit, trialStatus, TRIAL_DAYS } from "@/lib/plans";
import { PERMISSIONS, RESTRICTED_PERMISSIONS } from "@/lib/permissions";
import { Shell, Card, Badge } from "@/components/ui";
import { OrgForm, AddUserForm, DemoButtons, CustomRoleForm, AssignRoleSelect, DeleteRoleButton } from "@/components/forms";
import { formatDate } from "@/lib/format";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [org, users, counts, roles] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.organizationId } }),
    prisma.user.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" } }),
    Promise.all([
      prisma.property.count({ where: { organizationId: user.organizationId } }),
      prisma.unit.count({ where: { organizationId: user.organizationId } }),
      prisma.tenant.count({ where: { organizationId: user.organizationId } }),
    ]),
    prisma.customRole.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { users: true } } } }),
  ]);
  if (!org) return null;
  const types = JSON.parse(org.managementTypes) as string[];
  const isAdmin = canManageOrgUser(user);
  const limits = planLimits(org.plan);
  const { trialEnd, trialActive, trialDaysLeft } = trialStatus(org);
  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Settings</h1>
      <p className="mb-5 text-sm text-slate-500">Organization, team, plan and demo data.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Organization" sub={`Managing: ${types.join(", ") || "—"}`}>
          {isAdmin ? (
            <OrgForm org={{ name: org.name, city: org.city, address: org.address, contactName: org.contactName, contactPhone: org.contactPhone, plan: org.plan }} />
          ) : (
            <div className="text-sm text-slate-600">
              <p><b>{org.name}</b></p>
              <p>{org.city} {org.address ? `· ${org.address}` : ""}</p>
              <p>Contact: {org.contactName ?? "—"} · {org.contactPhone ?? "—"}</p>
              <p className="mt-2 text-slate-500">Only the owner or an admin can change organization settings.</p>
            </div>
          )}
        </Card>
        <Card title={`Subscription — ${org.plan} plan`} sub="Limits are now hard-enforced: over-limit creates are refused with a 403.">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(PLANS).map(([name, p]) => (
              <div key={name} className={`rounded-xl border p-3 ${name === org.plan ? "border-teal-600 bg-teal-50" : "border-slate-200"}`}>
                <p className="font-bold">{name} {name === org.plan ? <Badge tone="teal">Current</Badge> : null}</p>
                <p className="text-sm text-slate-600">{p.price}</p>
                <p className="text-sm text-slate-600">{p.properties} · {p.units}</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p>Usage: <b>{counts[0]} / {fmtLimit(limits.properties)} properties</b> · <b>{counts[1]} / {fmtLimit(limits.units)} units</b> · <b>{users.length} / {fmtLimit(limits.users)} team members</b></p>
            <p>Union module: <b>{limits.union ? "Included" : "Not included — upgrade to Professional"}</b> · Custom roles: <b>{limits.customRoles ? "Included" : "Not included — upgrade to Business"}</b></p>
            {org.subscriptionStatus === "trial" ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                {trialActive
                  ? `Trial — ${trialDaysLeft} day(s) left (ends ${formatDate(trialEnd)}). After the ${TRIAL_DAYS}-day trial, renew your ${org.plan} plan to keep full access.`
                  : `Trial ended ${formatDate(trialEnd)}. Renew your ${org.plan} plan to keep full access.`}
              </p>
            ) : (
              <p>Subscription: <b>{org.subscriptionStatus}</b>{org.trialEndsAt ? ` · trial ended ${formatDate(org.trialEndsAt)}` : ""}</p>
            )}
          </div>
        </Card>
        <Card title="Team & roles" sub="Owner: full access · Admin: full access · Manager: no org settings · Accountant: bills, payments, receipts, expenses. Bill deletion/cancellation, receipt voiding and role management are Owner/Admin only. Custom roles override the built-in role's permissions.">
          <ul className="space-y-2 text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span>{u.fullName} <span className="text-slate-400">({u.email})</span></span>
                <span className="flex items-center gap-2">
                  <Badge tone={u.role === "OWNER" ? "teal" : u.role === "ACCOUNTANT" ? "blue" : "slate"}>{u.role}</Badge>
                  {isAdmin && u.role !== "OWNER" ? (
                    <AssignRoleSelect userId={u.id} customRoleId={u.customRoleId} roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
                  ) : u.customRoleId ? (
                    <Badge tone="teal">Custom role</Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {isAdmin ? <div className="mt-4 border-t border-slate-100 pt-4"><h3 className="mb-2 font-semibold">Add a team member</h3><AddUserForm /></div> : null}
        </Card>
        <Card title="Custom roles" sub={limits.customRoles ? "Create a role with exactly the permissions you choose, then assign it from the team list." : "Custom roles need the Business plan or higher — your plan does not include them."}>
          {roles.length === 0 ? <p className="mb-3 text-sm text-slate-500">No custom roles yet.</p> : (
            <ul className="mb-3 space-y-2 text-sm">
              {roles.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <span><b>{r.name}</b> <span className="text-slate-400">({r._count.users} user(s))</span><br /><span className="text-xs text-slate-500">{(JSON.parse(r.permissionsJson) as string[]).join(", ") || "No permissions"}</span></span>
                  {isAdmin ? <DeleteRoleButton roleId={r.id} /> : null}
                </li>
              ))}
            </ul>
          )}
          {isAdmin && limits.customRoles ? <CustomRoleForm permissions={PERMISSIONS.map((p) => ({ key: p.key, label: p.label, restricted: RESTRICTED_PERMISSIONS.includes(p.key) }))} /> : null}
          {isAdmin && !limits.customRoles ? <p className="text-sm text-amber-700">Upgrade to Business to create custom roles.</p> : null}
        </Card>
        <Card title="Demo data" sub="Demo data lives in a separate demo organization and never mixes with real data.">
          <DemoButtons isDemo={org.isDemo} />
          {!org.isDemo ? <p className="mt-2 text-sm text-slate-500">This is a real organization — demo controls are disabled here.</p> : null}
        </Card>
        <Card title="Phase 2 — integrations status">
          <ul className="list-disc pl-5 text-sm text-slate-600">
            <li>WhatsApp: manual wa.me sharing is live (free). WhatsApp Business API is NOT configured — no credentials in this build.</li>
            <li>Bank verification: NOT connected — payments are verified manually. Format checks, duplicate-reference detection and amount warnings are live.</li>
            <li>Notifications engine: live in-app; daily run via cron <span className="font-mono text-xs">npm run notifications</span>.</li>
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
