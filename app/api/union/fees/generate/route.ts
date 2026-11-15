import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";

// POST /api/union/fees/generate { unionId, period } — one Pending
// UnionFeeCollection per ACTIVE member, using the ACTIVE fee config(s).
// Duplicate period refused 409. Union money never touches rent bills.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<{ unionId?: string; period?: string }>(req);
  if (!body) return error("Invalid request.");
  const unionId = String(body.unionId ?? "");
  const period = String(body.period ?? "").trim();
  if (!unionId) return error("Union is required.");
  if (!/^\d{4}-\d{2}$/.test(period)) return error("Billing month is required (YYYY-MM).");
  const union = await prisma.union.findFirst({ where: { id: unionId, organizationId: user.organizationId } });
  if (!union) return error("Union not found.", 404);
  const activeFees = await prisma.unionFee.findMany({ where: { unionId, organizationId: user.organizationId, active: true } });
  if (activeFees.length === 0) return error("No active fee config for this union. Add a fee first.");
  const members = await prisma.unionMember.findMany({ where: { unionId, organizationId: user.organizationId, status: "Active" } });
  if (members.length === 0) return error("No active members in this union.");
  // Duplicate period refused: any collection already exists for this union+period.
  const existing = await prisma.unionFeeCollection.findFirst({ where: { unionId, billingPeriod: period } });
  if (existing) return error(`Union fees for ${period} were already generated. Duplicate billing is blocked.`, 409);

  // One collection row per member per active fee config (normally one config).
  let created = 0;
  for (const fee of activeFees) {
    for (const m of members) {
      try {
        await prisma.unionFeeCollection.create({
          data: {
            unionId,
            memberId: m.id,
            organizationId: user.organizationId,
            billingPeriod: period,
            amount: fee.amount,
            status: "Pending",
          },
        });
        created++;
      } catch {
        // Unique (memberId, billingPeriod) — skip duplicates.
      }
    }
  }
  if (created === 0) return error(`Union fees for ${period} were already generated. Duplicate billing is blocked.`, 409);
  return json({ ok: true, created, message: `Generated ${created} union fee record(s) for ${period}.` });
}
