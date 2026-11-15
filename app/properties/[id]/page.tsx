import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/format";
import { Shell, Card, Badge } from "@/components/ui";
import { UnitForm, ChargeEditor } from "@/components/forms";

export default async function PropertyDetailPage({ params }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const prop = await prisma.property.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { units: { include: { tenants: { where: { status: "Active" }, take: 1 } }, orderBy: { unitNo: "asc" } } },
  });
  if (!prop) notFound();
  return (
    <Shell>
      <Link href="/properties" className="text-sm font-semibold text-teal-700">← All properties</Link>
      <h1 className="mt-2 text-2xl font-extrabold">{prop.name}</h1>
      <p className="mb-5 text-sm text-slate-500">{prop.type} · {prop.city ?? ""} {prop.address ? "· " + prop.address : ""} · Owner: {prop.ownerName ?? "—"}</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Units">
          {prop.units.length === 0 ? <p className="text-sm text-slate-500">No units yet.</p> : (
            <div className="space-y-3">
              {prop.units.map((u) => (
                <div key={u.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="font-semibold">{u.unitNo} <span className="font-normal text-slate-500">({u.kind}, floor {u.floor}{u.areaSqft ? `, ${u.areaSqft} sq ft` : ""})</span></p>
                    <Badge tone={u.status === "Occupied" ? "green" : "slate"}>{u.status}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">Rent {formatPKR(u.monthlyRent)}/month · Deposit {formatPKR(u.securityDeposit)}</p>
                  <p className="text-sm text-slate-600">Tenant: {u.tenants[0]?.fullName ?? "— vacant —"}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-teal-700">Unit charges (override property / org)</summary>
                    <div className="mt-2"><ChargeEditor scope="UNIT" scopeId={u.id} scopeLabel={`Unit ${u.unitNo}`} /></div>
                  </details>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="mb-2 font-semibold">Add a unit</h3>
            <UnitForm propertyId={prop.id} />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Property charges" sub="Apply to all units in this property unless a unit overrides them.">
            <ChargeEditor scope="PROPERTY" scopeId={prop.id} scopeLabel={`Property ${prop.name}`} />
          </Card>
          <Card title="Organization default charges" sub="Apply everywhere unless a property or unit overrides them.">
            <ChargeEditor scope="ORG" scopeId={user.organizationId} scopeLabel="Organization defaults" />
          </Card>
        </div>
      </div>
    </Shell>
  );
}
