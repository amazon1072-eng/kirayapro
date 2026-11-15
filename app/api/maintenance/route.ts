import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, toInt, requirePermission } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "maintenance.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const title = String(body.title ?? "").trim();
  if (!title) return error("Title is required.");
  const propertyId = String(body.propertyId ?? "").trim() || null;
  if (propertyId) {
    const p = await prisma.property.findFirst({ where: { id: propertyId, organizationId: user.organizationId } });
    if (!p) return error("Property not found.", 404);
  }
  const created = await prisma.maintenanceRequest.create({
    data: {
      organizationId: user.organizationId,
      propertyId,
      title,
      category: String(body.category ?? "Other"),
      priority: String(body.priority ?? "Medium"),
      assignedStaff: String(body.assignedStaff ?? "").trim() || null,
      status: "Pending",
      description: String(body.description ?? "").trim() || null,
      costEstimate: body.costEstimate ? toInt(body.costEstimate, 0) || null : null,
    },
  });
  return json({ ok: true, request: created }, 201);
}
