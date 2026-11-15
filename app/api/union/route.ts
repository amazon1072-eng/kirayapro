import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission, requireModuleGate } from "@/lib/api";

// GET /api/union — list unions for the org.
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const unions = await prisma.union.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
  return json({ ok: true, unions });
}

// POST /api/union — create a union profile (plan gate: union module).
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const gate = requireModuleGate(user, "union");
  if (gate) return gate;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const name = String(body.name ?? "").trim();
  if (!name) return error("Union name is required.");
  const union = await prisma.union.create({
    data: {
      organizationId: user.organizationId,
      name,
      presidentName: String(body.presidentName ?? "").trim() || null,
      presidentPhone: String(body.presidentPhone ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null,
      city: String(body.city ?? "").trim() || null,
      registrationNo: String(body.registrationNo ?? "").trim() || null,
    },
  });
  return json({ ok: true, union }, 201);
}

// PATCH /api/union { id, ...fields } — update a union profile.
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const id = String(body.id ?? "");
  const existing = await prisma.union.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Union not found.", 404);
  const union = await prisma.union.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.presidentName !== undefined ? { presidentName: String(body.presidentName).trim() || null } : {}),
      ...(body.presidentPhone !== undefined ? { presidentPhone: String(body.presidentPhone).trim() || null } : {}),
      ...(body.address !== undefined ? { address: String(body.address).trim() || null } : {}),
      ...(body.city !== undefined ? { city: String(body.city).trim() || null } : {}),
      ...(body.registrationNo !== undefined ? { registrationNo: String(body.registrationNo).trim() || null } : {}),
    },
  });
  return json({ ok: true, union });
}
