import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR } from "@/lib/format";
import { Shell, Card, Badge } from "@/components/ui";
import { PropertyForm } from "@/components/forms";

export default async function PropertiesPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const props = await prisma.property.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    include: { units: { orderBy: { unitNo: "asc" } } },
  });
  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Properties &amp; Units</h1>
      <p className="mb-5 text-sm text-slate-500">Buildings, plazas and markets — each with its own units, rents and charges.</p>
      <div className="mb-5">
        <Card title="Add a property">
          <PropertyForm />
        </Card>
      </div>
      <div className="grid gap-4">
        {props.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No properties yet. Add your first one above.</p></Card>
        ) : props.map((p) => {
          const occupied = p.units.filter((u) => u.status === "Occupied").length;
          const rent = p.units.reduce((s, u) => s + u.monthlyRent, 0);
          return (
            <Card key={p.id} title={`${p.name}`} sub={`${p.type} · ${p.city ?? ""} ${p.address ? "· " + p.address : ""} · ${p.floors} floor(s)`}
              actions={<Link href={`/properties/${p.id}`} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white">Manage units &amp; charges</Link>}>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="teal">{p.units.length} unit(s)</Badge>
                <Badge tone="green">{occupied} occupied</Badge>
                <Badge tone="blue">Total rent {formatPKR(rent)}/month</Badge>
                <Badge tone="slate">{p.status}</Badge>
              </div>
              {p.units.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-slate-500"><th className="py-1">Unit</th><th>Kind</th><th>Floor</th><th className="text-right">Rent</th><th>Status</th></tr></thead>
                    <tbody>
                      {p.units.map((u) => (
                        <tr key={u.id} className="border-t border-slate-100">
                          <td className="py-1.5 font-medium">{u.unitNo}</td>
                          <td>{u.kind}</td><td>{u.floor}</td>
                          <td className="text-right">{formatPKR(u.monthlyRent)}</td>
                          <td>{u.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mt-2 text-sm text-slate-500">No units yet — open the property to add units.</p>}
            </Card>
          );
        })}
      </div>
    </Shell>
  );
}
