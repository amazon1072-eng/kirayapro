import { prisma } from "@/lib/prisma";
import { error, json, requireUser, requirePermission } from "@/lib/api";

// POST /api/bills/[id]/cancel — cancel (void) a bill. Owner/Admin only (bills.cancel).
// A cancelled bill is excluded from outstanding/collection totals everywhere
// (dashboard, reports, CSV) and its tenant portal link is revoked, so the
// tenant can no longer pay it. A bill with VERIFIED (Approved) payments
// cannot be cancelled — void those payments first. Cancelling frees the
// (unit, period) slot, so the bill can be regenerated afterwards.
export async function POST(_req: Request, ctx: RouteContext<"/api/bills/[id]/cancel">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "bills.cancel");
  if (perm) return perm;
  const { id } = await ctx.params;
  const bill = await prisma.bill.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { payments: { select: { status: true } } },
  });
  if (!bill) return error("Bill not found.", 404);
  if (bill.status === "Cancelled") return error("This bill is already cancelled.", 409);
  if (bill.payments.some((p) => p.status === "Approved")) {
    return error("This bill has verified payments and cannot be cancelled. Void the payments first.", 409);
  }
  await prisma.bill.update({
    where: { id },
    data: { status: "Cancelled", tokenRevoked: true },
  });
  return json({ ok: true, message: "Bill cancelled. It no longer counts towards outstanding or collections." });
}
