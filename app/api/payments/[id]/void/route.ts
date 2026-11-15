import { prisma } from "@/lib/prisma";
import { error, json, requireUser, requirePermission } from "@/lib/api";
import { createNotification } from "@/lib/notifications";

// POST /api/payments/[id]/void — void an APPROVED payment (receipt void).
// Owner/Admin only (financial.adjust). This is the ONLY way to undo a
// verified collection: the payment keeps its receipt number (audit trail —
// the number is never reused) but no longer counts as collected, and the
// bill's status/outstanding is recomputed from the remaining APPROVED
// payments. Nothing here ever auto-approves anything.
export async function POST(_req: Request, ctx: RouteContext<"/api/payments/[id]/void">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "financial.adjust");
  if (perm) return perm;
  const { id } = await ctx.params;
  const payment = await prisma.payment.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { bill: { include: { tenant: true } } },
  });
  if (!payment) return error("Payment not found.", 404);
  if (payment.status !== "Approved") {
    return error(`Only an approved payment can be voided (this one is ${payment.status.toLowerCase()}).`, 409);
  }
  const result = await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { status: "Voided" } });
    const approvedSum = await tx.payment.aggregate({
      where: { billId: payment.billId, status: "Approved" },
      _sum: { amount: true },
    });
    const paid = approvedSum._sum.amount ?? 0;
    const status = paid >= payment.bill.totalAmount ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
    await tx.bill.update({ where: { id: payment.billId }, data: { status } });
    return { remaining: Math.max(0, payment.bill.totalAmount - paid), billStatus: status };
  });
  await createNotification({
    organizationId: user.organizationId,
    type: "payment_voided",
    title: `Payment voided — Rs. ${payment.amount.toLocaleString("en-PK")} (${payment.method})`,
    body: `${payment.bill.tenant?.fullName ?? "Tenant"}'s approved payment of Rs. ${payment.amount.toLocaleString("en-PK")} for bill ${payment.bill.billingPeriod} was voided${payment.receiptNo ? ` (receipt ${payment.receiptNo} is no longer valid)` : ""}. The amount is back on the bill as outstanding.`,
    link: "/payments",
    relatedId: payment.id,
    dedupKey: `payment_voided:${payment.id}`,
  });
  return json({
    ok: true,
    message: `Payment voided. Receipt ${payment.receiptNo ?? ""} is no longer valid. Remaining balance: Rs. ${result.remaining.toLocaleString("en-PK")}.`,
    ...result,
  });
}
