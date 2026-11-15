import { prisma } from "@/lib/prisma";
import { resolveCharges, buildBillItems } from "@/lib/billing";
import { error, json, readBody, requireUser, toInt, requirePermission } from "@/lib/api";

type Manual = Record<string, Record<string, number>>;

function parseManual(body: Record<string, unknown>): Manual {
  const out: Manual = {};
  const m = body.manualAmounts as Record<string, Record<string, unknown>> | undefined;
  if (m && typeof m === "object") {
    for (const [unitId, charges] of Object.entries(m)) {
      if (charges && typeof charges === "object") {
        out[unitId] = {};
        for (const [k, v] of Object.entries(charges)) out[unitId][k] = toInt(v, 0);
      }
    }
  }
  return out;
}

async function loadUnits(user: { organizationId: string }, propertyId: string) {
  const units = await prisma.unit.findMany({
    where: {
      organizationId: user.organizationId,
      status: "Occupied",
      ...(propertyId !== "ALL" ? { propertyId } : {}),
    },
    include: {
      property: true,
      tenants: { where: { status: "Active" }, orderBy: { createdAt: "asc" }, take: 1 },
    },
    orderBy: [{ propertyId: "asc" }, { unitNo: "asc" }],
  });
  return units.filter((u) => u.tenants.length > 0);
}

async function previewFor(user: { organizationId: string }, period: string, propertyId: string, manual: Manual) {
  const units = await loadUnits(user, propertyId);
  const orgConfigs = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "ORG" } });
  const propConfigs = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "PROPERTY" } });
  const unitConfigs = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "UNIT" } });
  const existing = await prisma.bill.findMany({
    where: { organizationId: user.organizationId, billingPeriod: period },
    select: { unitId: true },
  });
  const existingSet = new Set(existing.map((b) => b.unitId));
  const toRow = (c: { chargeKey: string; label: string; enabled: boolean; amount: number; method: string; frequency: string; scope: string; scopeId: string }) => ({
    chargeKey: c.chargeKey, label: c.label, enabled: c.enabled, amount: c.amount, method: c.method, frequency: c.frequency, scope: c.scope, scopeId: c.scopeId,
  });
  return units.map((u) => {
    const resolved = resolveCharges(
      orgConfigs.filter((c) => c.scopeId === user.organizationId).map(toRow),
      propConfigs.filter((c) => c.scopeId === u.propertyId).map(toRow),
      unitConfigs.filter((c) => c.scopeId === u.id).map(toRow),
      u.monthlyRent,
    );
    const items = buildBillItems(resolved, manual[u.id] ?? {});
    const total = items.reduce((s, i) => s + i.amount, 0);
    return {
      unitId: u.id,
      unitLabel: `${u.property.name} — ${u.unitNo} (${u.kind})`,
      tenantName: u.tenants[0].fullName,
      tenantId: u.tenants[0].id,
      items,
      total,
      alreadyBilled: existingSet.has(u.id),
      skipped: existingSet.has(u.id) ? `Already billed for ${period} — duplicate billing is blocked.` : undefined,
    };
  });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  // Permission-based (not role-based): a custom role with bills.view may
  // preview, and one without it may not — consistent with generate/verify.
  const perm = await requirePermission(user, "bills.view");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const period = String(body.period ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) return error("Billing month is required (YYYY-MM).");
  const propertyId = String(body.propertyId ?? "ALL");
  const manual = parseManual(body);
  const bills = await previewFor(user, period, propertyId, manual);
  return json({ ok: true, bills: bills.filter((b) => !b.alreadyBilled) });
}
