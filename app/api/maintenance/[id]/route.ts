import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, toInt, requirePermission } from "@/lib/api";
import { createNotification } from "@/lib/notifications";

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
  const req2 = await prisma.maintenanceRequest.create({
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
  return json({ ok: true, request: req2 }, 201);
}

// PATCH /api/maintenance/[id] { status } — update status.
export async function PATCH(req: Request, ctx: RouteContext<"/api/maintenance/[id]">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const body = await readBody<{ status?: string; assignedStaff?: string }>(req);
  if (!body) return error("Invalid request.");
  const existing = await prisma.maintenanceRequest.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Request not found.", 404);
  const valid = ["Pending", "Assigned", "In Progress", "Completed", "Rejected"];
  if (body.status && !valid.includes(body.status)) return error("Invalid status.");
  const updated = await prisma.maintenanceRequest.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.assignedStaff !== undefined ? { assignedStaff: body.assignedStaff || null } : {}),
    },
  });
  if (body.status && body.status !== existing.status) {
    await createNotification({
      organizationId: user.organizationId,
      type: "maintenance_update",
      title: `Maintenance: ${updated.title} — ${updated.status}`,
      body: `Request "${updated.title}" (${updated.category}) is now ${updated.status}.`,
      link: "/maintenance",
      relatedId: updated.id,
      dedupKey: `maintenance_update:${updated.id}:${updated.status}`,
    });
  }
  return json({ ok: true, request: updated });
}
