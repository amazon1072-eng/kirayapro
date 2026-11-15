import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission, toInt } from "@/lib/api";

// GET /api/union/fees?unionId= — fee configs for a union.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const unionId = new URL(req.url).searchParams.get("unionId") ?? "";
  const fees = await prisma.unionFee.findMany({
    where: { organizationId: user.organizationId, ...(unionId ? { unionId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return json({ ok: true, fees });
}

// POST /api/union/fees — create a fee config.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const unionId = String(body.unionId ?? "");
  const label = String(body.label ?? "").trim();
  const amount = toInt(body.amount, -1);
  const period = String(body.period ?? "monthly");
  if (!unionId || !label) return error("Union and fee label are required.");
  if (amount <= 0) return error("Fee amount must be more than zero.");
  if (!["monthly", "quarterly", "yearly"].includes(period)) return error("Invalid fee period.");
  const union = await prisma.union.findFirst({ where: { id: unionId, organizationId: user.organizationId } });
  if (!union) return error("Union not found.", 404);
  const fee = await prisma.unionFee.create({
    data: { unionId, organizationId: user.organizationId, label, amount, period, active: true },
  });
  return json({ ok: true, fee }, 201);
}

// PATCH /api/union/fees { id, active?, amount?, label? } — edit / enable / disable a fee config.
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const id = String(body.id ?? "");
  const existing = await prisma.unionFee.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Fee not found.", 404);
  const fee = await prisma.unionFee.update({
    where: { id },
    data: {
      ...(body.label !== undefined ? { label: String(body.label).trim() } : {}),
      ...(body.amount !== undefined ? { amount: toInt(body.amount, existing.amount) } : {}),
      ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
      ...(body.period !== undefined ? { period: String(body.period) } : {}),
    },
  });
  return json({ ok: true, fee });
}
