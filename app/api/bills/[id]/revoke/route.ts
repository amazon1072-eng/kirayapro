import { prisma } from "@/lib/prisma";
import { canManageOrgUser } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";

// POST /api/bills/[id]/revoke — revoke the tenant portal link for a bill.
export async function POST(_req: Request, ctx: RouteContext<"/api/bills/[id]/revoke">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!canManageOrgUser(user)) return error("Only the owner or an admin can revoke a payment link.", 403);
  const { id } = await ctx.params;
  const bill = await prisma.bill.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!bill) return error("Bill not found.", 404);
  await prisma.bill.update({ where: { id }, data: { tokenRevoked: true } });
  return json({ ok: true, message: "Payment link revoked. The tenant can no longer open this bill." });
}
