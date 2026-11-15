import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, toInt, requirePermission, requirePlanLimit } from "@/lib/api";

export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const props = await prisma.property.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { units: true } } },
  });
  return json({ ok: true, properties: props });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "properties.manage");
  if (perm) return perm;
  const limit = await requirePlanLimit(user, "properties");
  if (limit) return limit;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const name = String(body.name ?? "").trim();
  if (!name) return error("Property name is required.");
  const prop = await prisma.property.create({
    data: {
      organizationId: user.organizationId,
      name,
      type: String(body.type ?? "Residential"),
      address: String(body.address ?? "").trim() || null,
      city: String(body.city ?? "").trim() || null,
      ownerName: String(body.ownerName ?? "").trim() || null,
      floors: Math.max(1, toInt(body.floors, 1)),
      status: "Active",
    },
  });
  return json({ ok: true, property: prop }, 201);
}
