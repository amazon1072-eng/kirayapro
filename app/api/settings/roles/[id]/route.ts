import { prisma } from "@/lib/prisma";
import { error, json, requireUser, requirePermission } from "@/lib/api";

// DELETE /api/settings/roles/[id] — delete a custom role (users keep their
// built-in role; their customRoleId is cleared by SetNull).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/settings/roles/[id]">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "roles.manage");
  if (perm) return perm;
  const { id } = await ctx.params;
  const existing = await prisma.customRole.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Role not found.", 404);
  await prisma.customRole.delete({ where: { id } });
  return json({ ok: true, message: "Role deleted." });
}
