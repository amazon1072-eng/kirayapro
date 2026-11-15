import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";

// GET /api/union/members?unionId= — member directory for one union.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const unionId = new URL(req.url).searchParams.get("unionId") ?? "";
  const where = { organizationId: user.organizationId, ...(unionId ? { unionId } : {}) };
  const members = await prisma.unionMember.findMany({
    where,
    orderBy: { membershipNo: "asc" },
    include: { unit: { include: { property: true } }, tenant: true },
  });
  return json({ ok: true, members });
}

// POST /api/union/members — add a member (membershipNo unique per union).
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const unionId = String(body.unionId ?? "");
  const membershipNo = String(body.membershipNo ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (!unionId || !membershipNo || !fullName || !phone) {
    return error("Union, membership number, name and phone are required.");
  }
  const union = await prisma.union.findFirst({ where: { id: unionId, organizationId: user.organizationId } });
  if (!union) return error("Union not found.", 404);
  const unitId = String(body.unitId ?? "").trim() || null;
  const tenantId = String(body.tenantId ?? "").trim() || null;
  if (unitId) {
    const u = await prisma.unit.findFirst({ where: { id: unitId, organizationId: user.organizationId } });
    if (!u) return error("Unit not found.", 404);
  }
  if (tenantId) {
    const t = await prisma.tenant.findFirst({ where: { id: tenantId, organizationId: user.organizationId } });
    if (!t) return error("Tenant not found.", 404);
  }
  const existing = await prisma.unionMember.findUnique({ where: { unionId_membershipNo: { unionId, membershipNo } } });
  if (existing) return error(`Membership number ${membershipNo} already exists in this union.`, 409);
  const member = await prisma.unionMember.create({
    data: {
      unionId,
      organizationId: user.organizationId,
      membershipNo,
      fullName,
      phone,
      cnic: String(body.cnic ?? "").trim() || null,
      unitId,
      tenantId,
      status: "Active",
      joinedDate: body.joinedDate ? new Date(String(body.joinedDate)) : new Date(),
      notes: String(body.notes ?? "").trim() || null,
    },
  });
  return json({ ok: true, member }, 201);
}
