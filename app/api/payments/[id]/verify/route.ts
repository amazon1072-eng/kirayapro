import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";
import { createNotification } from "@/lib/notifications";

// POST /api/payments/[id]/verify { action: approve|reject, rejectReason?, internalNotes? }
// Approve: issues unique receipt number KP-YYYY-NNNN, marks bill status
// (Paid / Partially Paid) from APPROVED payments only. Reject: reason required.
export async function POST(req: Request, ctx: RouteContext<"/api/payments/[id]/verify">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "payments.verify");
  if (perm) return perm;
  const { id } = await ctx.params;
  const body = await readBody<{ action?: string; rejectReason?: string; internalNotes?: string }>(req);
  if (!body || !["approve", "reject"].includes(String(body.action))) return error("Invalid action.");
  const payment = await prisma.payment.findFirst({ where: { id, organizationId: user.organizationId }, include: { bill: { include: { tenant: true } } } });
  if (!payment) return error("Payment not found.", 404);
  if (payment.status !== "Pending") return error(`This payment was already ${payment.status.toLowerCase()}.`, 409);
  if (body.action === "reject" && !String(body.rejectReason ?? "").trim()) {
    return error("Please give a reason for rejecting this payment.");
  }

  if (body.action === "reject") {
    await prisma.payment.update({
      where: { id },
      data: { status: "Rejected", rejectReason: String(body.rejectReason).trim(), internalNotes: String(body.internalNotes ?? "").trim() || null, verifiedBy: user.id, verifiedAt: new Date() },
    });
    await createNotification({
      organizationId: user.organizationId,
      type: "payment_rejected",
      title: `Payment rejected — Rs. ${payment.amount.toLocaleString("en-PK")} (${payment.method})`,
      body: `${payment.bill.tenant?.fullName ?? "Tenant"}'s payment of Rs. ${payment.amount.toLocaleString("en-PK")} for bill ${payment.bill.billingPeriod} was rejected. Reason: ${String(body.rejectReason).trim()}`,
      link: "/payments",
      relatedId: payment.id,
      dedupKey: `payment_rejected:${payment.id}`,
    });
    return json({ ok: true, message: "Payment rejected." });
  }

  // B-3 fix (verify side): approving a payment that would push the approved
  // total above the bill total is refused — closes the overpayment hole when
  // two pending payments exist for the same bill.
  const approvedSoFar = await prisma.payment.aggregate({
    where: { billId: payment.billId, status: "Approved" },
    _sum: { amount: true },
  });
  const paidSoFar = approvedSoFar._sum.amount ?? 0;
  if (paidSoFar + payment.amount > payment.bill.totalAmount) {
    return error(`Approving this would overpay the bill (remaining Rs. ${Math.max(0, payment.bill.totalAmount - paidSoFar).toLocaleString("en-PK")}).`, 409);
  }

  // Approve inside a transaction. Receipt numbers are GLOBALLY unique
  // (receiptNo has a unique constraint), so the sequence is derived from
  // the MAXIMUM existing receipt number — NOT a count (a count collides
  // when numbers are non-contiguous, e.g. after a re-seed or org delete).
  // The org counter is still bumped for display.
  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: user.organizationId } });
    const next = (org?.receiptCounter ?? 0) + 1;
    await tx.organization.update({ where: { id: user.organizationId }, data: { receiptCounter: next } });
    const existing = await tx.payment.findMany({ where: { receiptNo: { not: null } }, select: { receiptNo: true } });
    let maxReceipt = 0;
    for (const r of existing) {
      const m = /^KP-\d{4}-(\d+)$/.exec(r.receiptNo ?? "");
      if (m) maxReceipt = Math.max(maxReceipt, Number(m[1]));
    }
    const receiptNo = `KP-${new Date().getFullYear()}-${String(maxReceipt + 1).padStart(4, "0")}`;
    await tx.payment.update({
      where: { id },
      data: { status: "Approved", receiptNo, internalNotes: String(body.internalNotes ?? "").trim() || null, verifiedBy: user.id, verifiedAt: new Date() },
    });
    const approvedSum = await tx.payment.aggregate({
      where: { billId: payment.billId, status: "Approved" },
      _sum: { amount: true },
    });
    const paid = approvedSum._sum.amount ?? 0;
    const status = paid >= payment.bill.totalAmount ? "Paid" : paid > 0 ? "Partially Paid" : "Unpaid";
    await tx.bill.update({ where: { id: payment.billId }, data: { status } });
    return { receiptNo, remaining: Math.max(0, payment.bill.totalAmount - paid), billStatus: status };
  });
  await createNotification({
    organizationId: user.organizationId,
    type: "payment_approved",
    title: `Payment approved — Rs. ${payment.amount.toLocaleString("en-PK")} (${payment.method})`,
    body: `${payment.bill.tenant?.fullName ?? "Tenant"}'s payment of Rs. ${payment.amount.toLocaleString("en-PK")} for bill ${payment.bill.billingPeriod} was approved — receipt ${result.receiptNo}.`,
    link: "/payments",
    relatedId: payment.id,
    dedupKey: `payment_approved:${payment.id}`,
  });
  return json({ ok: true, message: `Payment approved. Receipt ${result.receiptNo} issued. Remaining balance: Rs. ${result.remaining.toLocaleString("en-PK")}.`, ...result });
}
