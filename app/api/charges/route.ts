import { prisma } from "@/lib/prisma";
import { CHARGE_DEFS, resolveCharges, type ChargeRow } from "@/lib/billing";
import { error, json, readBody, requireUser, requirePermission, toInt } from "@/lib/api";

type ChargeInput = { chargeKey: string; label?: string; enabled?: boolean; amount?: number; method?: string };

function toRow(c: { chargeKey: string; label: string; enabled: boolean; amount: number; method: string; frequency: string; scope: string; scopeId: string }): ChargeRow {
  return {
    chargeKey: c.chargeKey, label: c.label, enabled: c.enabled, amount: c.amount,
    method: c.method, frequency: c.frequency, scope: c.scope, scopeId: c.scopeId,
  };
}

// GET /api/charges?scope=ORG|PROPERTY|UNIT&scopeId=...
// Returns the EFFECTIVE charges for that scope (UNIT > PROPERTY > ORG > default),
// with each charge's source and whether this scope holds an explicit override.
// Untouched inherited charges are shown, never hidden — so an admin can see
// exactly what a unit/property actually pays before saving anything.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "ORG";
  const scopeId = url.searchParams.get("scopeId") ?? user.organizationId;
  if (!["ORG", "PROPERTY", "UNIT"].includes(scope)) return error("Invalid scope.");
  let propertyId: string | null = null;
  let unit: { id: string; propertyId: string; monthlyRent: number } | null = null;
  if (scope === "PROPERTY") {
    const p = await prisma.property.findFirst({ where: { id: scopeId, organizationId: user.organizationId } });
    if (!p) return error("Property not found.", 404);
    propertyId = p.id;
  }
  if (scope === "UNIT") {
    const u = await prisma.unit.findFirst({ where: { id: scopeId, organizationId: user.organizationId } });
    if (!u) return error("Unit not found.", 404);
    unit = u;
    propertyId = u.propertyId;
  }
  const orgRows = await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "ORG" } });
  const propRows = propertyId
    ? await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "PROPERTY", scopeId: propertyId } })
    : [];
  const unitRows = unit
    ? await prisma.chargeConfig.findMany({ where: { organizationId: user.organizationId, scope: "UNIT", scopeId: unit.id } })
    : [];
  // Monthly Rent is set on each unit, never at property/org level — so at
  // those scopes the rent row is informational only: show the real rents
  // of the units underneath (a range when they differ) instead of a fake
  // "0 / Default". A stale property/org rent override row, if one somehow
  // exists, is surfaced explicitly so the display can never lie about it.
  let rentSummary: {
    unitCount: number; unitsWithRent: number; min: number | null; max: number | null;
    override: { scope: string; amount: number } | null;
  } | null = null;
  if (scope !== "UNIT") {
    const scopeUnits = await prisma.unit.findMany({
      where: scope === "PROPERTY" ? { organizationId: user.organizationId, propertyId: propertyId! } : { organizationId: user.organizationId },
      select: { monthlyRent: true },
    });
    const rents = scopeUnits.map((u) => u.monthlyRent).filter((r) => r > 0);
    const propOverride = scope === "PROPERTY" ? propRows.find((r) => r.chargeKey === "rent" && r.enabled && r.amount > 0) : undefined;
    const orgOverride = orgRows.find((r) => r.chargeKey === "rent" && r.enabled && r.amount > 0);
    const overrideRow = propOverride ?? orgOverride;
    rentSummary = {
      unitCount: scopeUnits.length,
      unitsWithRent: rents.length,
      min: rents.length > 0 ? Math.min(...rents) : null,
      max: rents.length > 0 ? Math.max(...rents) : null,
      override: overrideRow ? { scope: propOverride ? "PROPERTY" : "ORG", amount: overrideRow.amount } : null,
    };
  }
  const unitRent = unit?.monthlyRent ?? 0;
  // Effective values at this scope.
  const effective = resolveCharges(orgRows.map(toRow), propRows.map(toRow), unitRows.map(toRow), unitRent);
  // What would apply if this scope held no rows at all (the "inherit" target).
  const inherited = scope === "UNIT"
    ? resolveCharges(orgRows.map(toRow), propRows.map(toRow), [], unitRent)
    : scope === "PROPERTY"
      ? resolveCharges(orgRows.map(toRow), [], [], 0)
      : resolveCharges([], [], [], 0);
  const localRows = scope === "ORG" ? orgRows : scope === "PROPERTY" ? propRows : unitRows;
  const localKeys = new Set(localRows.map((r) => r.chargeKey));
  const charges = effective.map((c, i) => ({
    chargeKey: c.chargeKey,
    label: c.label,
    enabled: c.enabled,
    amount: c.amount,
    method: c.method,
    source: c.level,
    overridden: localKeys.has(c.chargeKey),
    // At property/org level rent is not settable — it comes from the units.
    perUnit: scope !== "UNIT" && c.chargeKey === "rent",
    inherited: {
      enabled: inherited[i].enabled,
      amount: inherited[i].amount,
      method: inherited[i].method,
      label: inherited[i].label,
      source: inherited[i].level,
    },
  }));
  return json({ ok: true, charges, rentSummary });
}

// POST { scope, scopeId, changes?: [...], clears?: [...], charges?: [...] }
// Delta save (preferred): only `changes` rows are upserted and only `clears`
// rows have their scope-local override deleted (reverting to inherited).
// Untouched rows are never written, so saving without changes is a no-op.
// Legacy `charges` (full list upsert) is still accepted for compatibility.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  // Changing billing charges is Owner/Admin only (settings.manage is a
  // restricted permission: never grantable to custom roles). The old check
  // blocked only ACCOUNTANT, so MANAGER and custom-role users could change
  // charges — found by Phase 4 workstream 4.
  const perm = await requirePermission(user, "settings.manage");
  if (perm) return perm;
  const body = await readBody<{
    scope?: string; scopeId?: string;
    charges?: ChargeInput[]; changes?: ChargeInput[]; clears?: string[];
  }>(req);
  if (!body || !body.scope || !body.scopeId) return error("Invalid request.");
  const { scope } = body;
  // ORG scope always keys on the organization id (callers may pass "ORG").
  const scopeId = scope === "ORG" ? user.organizationId : String(body.scopeId ?? "");
  if (!["ORG", "PROPERTY", "UNIT"].includes(scope)) return error("Invalid scope.");
  const legacy = Array.isArray(body.charges) ? body.charges : [];
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const clears = Array.isArray(body.clears) ? body.clears : [];
  if (legacy.length === 0 && changes.length === 0 && clears.length === 0) {
    return error("Nothing to save — no charges were changed.");
  }
  for (const c of [...legacy, ...changes]) {
    if (!CHARGE_DEFS.find((d) => d.key === c.chargeKey)) return error(`Unknown charge: ${c.chargeKey}`);
  }
  for (const k of clears) {
    if (!CHARGE_DEFS.find((d) => d.key === k)) return error(`Unknown charge: ${k}`);
  }
  // Monthly Rent is set on each unit, never at property/org level — a
  // property/org rent amount would silently override every unit's rent,
  // contradicting the editor. Refuse an intentional (delta) rent write
  // here; clearing a stale override is still allowed. Legacy full-list
  // saves always carry the rent row (amount 0 = no-op), so that one is
  // dropped, not refused, to keep the legacy path working.
  let effectiveLegacy = legacy;
  if (scope === "PROPERTY" || scope === "ORG") {
    if (changes.some((c) => c.chargeKey === "rent")) {
      return error("Monthly Rent is set on each unit, not at property or organization level. Edit it on the unit instead.", 400);
    }
    effectiveLegacy = legacy.filter((c) => c.chargeKey !== "rent");
    if (effectiveLegacy.length === 0 && changes.length === 0 && clears.length === 0) {
      return error("Nothing to save — Monthly Rent is set on each unit, not at property or organization level.");
    }
  }
  let propertyId: string | null = null;
  let unitId: string | null = null;
  if (scope === "PROPERTY") {
    const p = await prisma.property.findFirst({ where: { id: scopeId, organizationId: user.organizationId } });
    if (!p) return error("Property not found.", 404);
    propertyId = p.id;
  }
  if (scope === "UNIT") {
    const u = await prisma.unit.findFirst({ where: { id: scopeId, organizationId: user.organizationId }, include: { property: true } });
    if (!u) return error("Unit not found.", 404);
    unitId = u.id;
    propertyId = u.propertyId;
  }
  const upsertOne = async (c: ChargeInput) => {
    const def = CHARGE_DEFS.find((d) => d.key === c.chargeKey)!;
    await prisma.chargeConfig.upsert({
      where: { organizationId_scope_scopeId_chargeKey: { organizationId: user.organizationId, scope, scopeId, chargeKey: c.chargeKey } },
      update: {
        label: c.label || def.label,
        enabled: c.enabled !== false,
        amount: Math.max(0, toInt(c.amount, 0)),
        method: c.method || "fixed",
        propertyId, unitId,
      },
      create: {
        organizationId: user.organizationId, scope, scopeId,
        propertyId, unitId,
        chargeKey: c.chargeKey, label: c.label || def.label,
        enabled: c.enabled !== false,
        amount: Math.max(0, toInt(c.amount, 0)),
        method: c.method || "fixed",
        frequency: "monthly",
      },
    });
  };
  for (const c of effectiveLegacy) await upsertOne(c);
  for (const c of changes) await upsertOne(c);
  let clearedCount = 0;
  for (const k of clears) {
    const r = await prisma.chargeConfig.deleteMany({
      where: { organizationId: user.organizationId, scope, scopeId, chargeKey: k },
    });
    clearedCount += r.count;
  }
  const changedCount = effectiveLegacy.length + changes.length;
  return json({
    ok: true,
    message: clearedCount > 0
      ? `Saved ${changedCount} change(s), reverted ${clearedCount} charge(s) to inherited. They apply to future bills only — old bills never change.`
      : "Charges saved. They apply to future bills only — old bills never change.",
    changed: changedCount,
    cleared: clearedCount,
  });
}
