import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";

// PATCH /api/settings/users/[id] { customRoleId | null } — assign / remove a custom role.
// Role assignment is role management: Owner/Admin only (roles.manage).
export async function PATCH(req: Request, ctx: RouteContext<"/api/settings/users/[id]">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "roles.manage");
  if (perm) return perm;
  const { id } = await ctx.params;
  const body = await readBody<{ customRoleId?: string | null }>(req);
  if (!body) return error("Invalid request.");
  const target = await prisma.user.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!target) return error("User not found.", 404);
  if (target.role === "OWNER") return error("The owner always keeps full access.", 403);
  const customRoleId = body.customRoleId ? String(body.customRoleId) : null;
  if (customRoleId) {
    const cr = await prisma.customRole.findFirst({ where: { id: customRoleId, organizationId: user.organizationId } });
    if (!cr) return error("Custom role not found.", 404);
  }
  const updated = await prisma.user.update({ where: { id }, data: { customRoleId } });
  return json({ ok: true, user: { id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role, customRoleId: updated.customRoleId } });
}
