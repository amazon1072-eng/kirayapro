import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { resolveCharges, buildBillItems } from "@/lib/billing";
import { error, json, readBody, requireUser, toInt, requirePermission } from "@/lib/api";

type Manual = Record<string, Record<string, number>>;

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "bills.generate");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const period = String(body.period ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) return error("Billing month is required (YYYY-MM).");
  const propertyId = String(body.propertyId ?? "ALL");
  const manual: Manual = {};
  const m = body.manualAmounts as Record<string, Record<string, unknown>> | undefined;
  if (m && typeof m === "object") {
    for (const [unitId, charges] of Object.entries(m)) {
      if (charges && typeof charges === "object") {
        manual[unitId] = {};
        for (const [k, v] of Object.entries(charges)) manual[unitId][k] = toInt(v, 0);
      }
    }
  }

  const units = await prisma.unit.findMany({
    where: {
      organizationId: user.organizationId,
      status: "Occupied",
      ...(propertyId !== "ALL" ? { propertyId } : {}),
    },
    include: { tenants: { where: { status: "Active" }, orderBy: { createdAt: "asc" }, take: 1 } },
    orderBy: [{ propertyId: "asc" }, { unitNo: "asc" }],
  });
  const occupied = units.filter((u) => u.tenants.length > 0);
  if (occupied.length === 0) return error("No occupied units with an active tenant found for this selection.");

  const orgConfigs = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "ORG" } });
  const propConfigs = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "PROPERTY" } });
  const unitConfigs = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "UNIT" } });
  const toRow = (c: { chargeKey: string; label: string; enabled: boolean; amount: number; method: string; frequency: string; scope: string; scopeId: string }) => ({
    chargeKey: c.chargeKey, label: c.label, enabled: c.enabled, amount: c.amount, method: c.method, frequency: c.frequency, scope: c.scope, scopeId: c.scopeId,
  });

  let created = 0;
  const duplicates: string[] = [];
  const createdBills: { unitNo: string; portalUrl: string }[] = [];
  for (const u of occupied) {
    const resolved = resolveCharges(
      orgConfigs.filter((c) => c.scopeId === user.organizationId).map(toRow),
      propConfigs.filter((c) => c.scopeId === u.propertyId).map(toRow),
      unitConfigs.filter((c) => c.scopeId === u.id).map(toRow),
      u.monthlyRent,
    );
    const items = buildBillItems(resolved, manual[u.id] ?? {});
    const total = items.reduce((s, i) => s + i.amount, 0);
    if (total <= 0) continue;
    // A CANCELLED bill frees its (unit, period) slot: remove it (it never
    // has verified payments by construction) so the bill can be regenerated.
    const existing = await prisma.bill.findUnique({
      where: { unitId_billingPeriod: { unitId: u.id, billingPeriod: period } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== "Cancelled") {
      duplicates.push(u.unitNo);
      continue;
    }
    if (existing) await prisma.bill.delete({ where: { id: existing.id } });
    const raw = randomBytes(32).toString("hex");
    try {
      await prisma.bill.create({
        data: {
          organizationId: user.organizationId,
          unitId: u.id,
          tenantId: u.tenants[0].id,
          billingPeriod: period,
          itemsJson: JSON.stringify(items),
          totalAmount: total,
          status: "Unpaid",
          // Due date is the 10th of the BILLING month (month is 0-indexed in Date).
          dueDate: new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 10),
          tokenHash: hashToken(raw),
          tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      created++;
      const base = new URL(req.url);
      createdBills.push({ unitNo: u.unitNo, portalUrl: `${base.protocol}//${base.host}/pay/${raw}` });
    } catch {
      // Unique (unitId, billingPeriod) — duplicate billing refused.
      duplicates.push(u.unitNo);
    }
  }
  if (created === 0) {
    return error(
      duplicates.length > 0
        ? `Bills already exist for ${period} for: ${duplicates.join(", ")}. Duplicate billing is blocked.`
        : "No bills could be generated.",
      409,
    );
  }
  return json({
    ok: true,
    created,
    bills: createdBills,
    message: `Generated ${created} bill(s) for ${period}.` +
      (duplicates.length > 0 ? ` Skipped (already billed): ${duplicates.join(", ")}.` : ""),
  });
}
