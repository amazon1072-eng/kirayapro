import { prisma } from "@/lib/prisma";
import { error, json, requireUser, requirePermission } from "@/lib/api";

// DELETE /api/bills/[id] — delete a bill. Owner/Admin only (bills.delete).
// A bill with VERIFIED (Approved) payments can never be deleted — the money
// is already in the ledger. Void those payments first, or cancel instead.
// Deleting a bill also removes its Pending/Rejected submissions (cascade).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/bills/[id]">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "bills.delete");
  if (perm) return perm;
  const { id } = await ctx.params;
  const bill = await prisma.bill.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { payments: { select: { status: true } } },
  });
  if (!bill) return error("Bill not found.", 404);
  if (bill.payments.some((p) => p.status === "Approved")) {
    return error("This bill has verified payments and cannot be deleted. Void the payments first.", 409);
  }
  await prisma.bill.delete({ where: { id } });
  return json({ ok: true, message: "Bill deleted." });
}
