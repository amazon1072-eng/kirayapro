import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "tenants.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!fullName || !phone) return error("Tenant name and phone are required.");
  const unitId = String(body.unitId ?? "").trim() || null;
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, organizationId: user.organizationId } });
    if (!unit) return error("Unit not found.", 404);
    // B-2 fix: one ACTIVE tenant per unit — a second active tenant is refused.
    const existing = await prisma.tenant.findFirst({ where: { unitId, organizationId: user.organizationId, status: "Active" } });
    if (existing) return error(`This unit already has an active tenant (${existing.fullName}).`, 409);
  }
  const tenant = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        organizationId: user.organizationId,
        fullName,
        phone,
        cnic: String(body.cnic ?? "").trim() || null,
        address: String(body.address ?? "").trim() || null,
        emergencyName: String(body.emergencyName ?? "").trim() || null,
        emergencyPhone: String(body.emergencyPhone ?? "").trim() || null,
        unitId,
        memberType: String(body.memberType ?? "Tenant"),
        membershipNo: String(body.membershipNo ?? "").trim() || null,
        rentalStart: body.rentalStart ? new Date(String(body.rentalStart)) : null,
        rentalEnd: body.rentalEnd ? new Date(String(body.rentalEnd)) : null,
        status: "Active",
        notes: String(body.notes ?? "").trim() || null,
      },
    });
    if (unitId) await tx.unit.update({ where: { id: unitId }, data: { status: "Occupied" } });
    return t;
  });
  return json({ ok: true, tenant }, 201);
}
