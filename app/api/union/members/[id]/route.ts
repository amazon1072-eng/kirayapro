import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";

// PATCH /api/union/members/[id] { status } — toggle Active/Suspended (or edit fields).
export async function PATCH(req: Request, ctx: RouteContext<"/api/union/members/[id]">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const { id } = await ctx.params;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const existing = await prisma.unionMember.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Member not found.", 404);
  if (body.status && !["Active", "Suspended"].includes(String(body.status))) return error("Invalid status.");
  const member = await prisma.unionMember.update({
    where: { id },
    data: {
      ...(body.status ? { status: String(body.status) } : {}),
      ...(body.fullName !== undefined ? { fullName: String(body.fullName).trim() } : {}),
      ...(body.phone !== undefined ? { phone: String(body.phone).trim() } : {}),
      ...(body.cnic !== undefined ? { cnic: String(body.cnic).trim() || null } : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes).trim() || null } : {}),
    },
  });
  return json({ ok: true, member });
}

// DELETE /api/union/members/[id] — remove a member (collections cascade).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/union/members/[id]">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const { id } = await ctx.params;
  const existing = await prisma.unionMember.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Member not found.", 404);
  await prisma.unionMember.delete({ where: { id } });
  return json({ ok: true, message: "Member removed." });
}
