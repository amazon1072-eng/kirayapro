import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { formatPKR, formatDate, formatDateTime } from "@/lib/format";
import { paymentWarningsWithBill } from "@/lib/bank-verification";
import { Shell, Card, statusBadge } from "@/components/ui";
import { VerifyButtons, VoidPaymentButton } from "@/components/forms";

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const canVoid = (await effectivePermissions(user)).includes("financial.adjust");
  const sp = await searchParams;
  const filter = typeof sp?.status === "string" ? sp.status : "Pending";
  const payments = await prisma.payment.findMany({
    where: { organizationId: user.organizationId, ...(filter !== "All" ? { status: filter } : {}) },
    orderBy: { createdAt: "desc" },
    include: { bill: { include: { unit: { include: { property: true } }, tenant: true } } },
    take: 100,
  });
  const counts = await prisma.payment.groupBy({ by: ["status"], where: { organizationId: user.organizationId }, _count: true });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  // Approved-paid sum per bill, for amount-matching warnings.
  const approvedRows = await prisma.payment.findMany({
    where: { organizationId: user.organizationId, status: "Approved", billId: { in: payments.map((p) => p.billId) } },
    select: { billId: true, amount: true },
  });
  const approvedByBill = new Map<string, number>();
  for (const r of approvedRows) approvedByBill.set(r.billId, (approvedByBill.get(r.billId) ?? 0) + r.amount);
  const warningsById = new Map<string, string[]>();
  for (const p of payments) {
    if (p.status !== "Pending") continue;
    warningsById.set(p.id, paymentWarningsWithBill(p, approvedByBill.get(p.billId) ?? 0));
  }
  return (
    <Shell>
      <h1 className="mb-1 text-2xl font-extrabold">Payment Verification</h1>
      <p className="mb-5 text-sm text-slate-500">Tenant submissions with proof. Only APPROVED payments count as verified collections. Partial payments are supported — the remaining balance stays on the bill.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {["Pending", "Approved", "Rejected", "All"].map((s) => (
          <Link key={s} href={`/payments?status=${s}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filter === s ? "bg-teal-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>
            {s} ({s === "All" ? payments.length : (countMap[s] ?? 0)})
          </Link>
        ))}
      </div>
      {payments.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No {filter.toLowerCase()} payments.</p></Card>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => (
            <Card key={p.id} title={`${formatPKR(p.amount)} — ${p.bill.tenant?.fullName ?? "Tenant"}`} sub={`${p.bill.unit.property.name} — ${p.bill.unit.unitNo} · Bill ${p.bill.billingPeriod} (total ${formatPKR(p.bill.totalAmount)}) · ${formatDateTime(p.createdAt)}`}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 text-sm">
                  <p>Method: <b>{p.method}</b></p>
                  <p>Reference: <b>{p.reference ?? "—"}</b></p>
                  <p>Payment date: <b>{formatDate(p.paidDate)}</b></p>
                  <p>Status: {statusBadge(p.status)}</p>
                  {(warningsById.get(p.id) ?? []).length > 0 ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                      <p className="font-semibold">⚠ Check before approving:</p>
                      <ul className="list-disc pl-4">
                        {(warningsById.get(p.id) ?? []).map((w) => <li key={w}>{w}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {p.receiptNo ? <p>Receipt: <Link href={`/receipts/${p.id}`} className="font-bold text-teal-700">{p.receiptNo}</Link></p> : null}
                  {p.rejectReason ? <p className="text-red-600">Reject reason: {p.rejectReason}</p> : null}
                  {p.internalNotes ? <p className="text-slate-500">Notes: {p.internalNotes}</p> : null}
                  <Link href={`/billing/${p.billId}`} className="inline-block font-semibold text-teal-700">View bill →</Link>
                </div>
                <div>
                  {p.proofPath ? (
                    (p.proofPath.toLowerCase().endsWith(".pdf") || (p.proofName ?? "").toLowerCase().endsWith(".pdf")) ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Proof: {p.proofName ?? "proof.pdf"}</p>
                        <a href={`/api/payments/${p.id}/proof`} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-[#0b2545] px-3 py-1.5 text-sm font-semibold text-white">Open proof (PDF) ↗</a>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Proof: {p.proofName ?? "proof"}</p>
                        <a href={`/api/payments/${p.id}/proof`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/payments/${p.id}/proof`} alt={`Payment proof for ${formatPKR(p.amount)}`} className="max-h-64 w-full rounded-lg object-contain ring-1 ring-slate-200" />
                        </a>
                        <p className="text-xs text-slate-500">Click the image to open it full size in a new tab.</p>
                      </div>
                    )
                  ) : (
                    <p className="text-sm text-amber-700">No proof attached.</p>
                  )}
                  {p.status === "Pending" ? <VerifyButtons paymentId={p.id} /> : (
                    <p className="text-sm text-slate-500">Verified by {p.verifiedBy ? "admin" : "—"} on {formatDateTime(p.verifiedAt)}.</p>
                  )}
                  {p.status === "Approved" && canVoid ? <VoidPaymentButton paymentId={p.id} /> : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Shell>
  );
}
