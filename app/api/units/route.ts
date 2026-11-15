import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, toInt, requirePermission, requirePlanLimit } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "properties.manage");
  if (perm) return perm;
  const limit = await requirePlanLimit(user, "units");
  if (limit) return limit;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const propertyId = String(body.propertyId ?? "");
  const unitNo = String(body.unitNo ?? "").trim();
  if (!propertyId || !unitNo) return error("Property and unit number are required.");
  const prop = await prisma.property.findFirst({ where: { id: propertyId, organizationId: user.organizationId } });
  if (!prop) return error("Property not found.", 404);
  const rent = toInt(body.monthlyRent, -1);
  if (rent < 0) return error("Monthly rent is required.");
  const unit = await prisma.unit.create({
    data: {
      organizationId: user.organizationId,
      propertyId,
      unitNo,
      kind: String(body.kind ?? "Other"),
      floor: toInt(body.floor, 0),
      areaSqft: body.areaSqft ? toInt(body.areaSqft, 0) || null : null,
      monthlyRent: rent,
      securityDeposit: Math.max(0, toInt(body.securityDeposit, 0)),
      status: "Vacant",
      notes: String(body.notes ?? "").trim() || null,
    },
  });
  return json({ ok: true, unit }, 201);
}
