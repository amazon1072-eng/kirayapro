import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { formatPKR, formatDate, periodLabel } from "@/lib/format";
import { Shell, Card, statusBadge, Badge } from "@/components/ui";
import { PrintButton, ReissueLinkButton, RevokeButton, WhatsAppShareButton, DeleteBillButton, CancelBillButton, SendReminderButton } from "@/components/forms";

// Bill detail: snapshot line items, verified paid, remaining, tenant portal
// link (token is NOT shown in full — the link uses the raw token which is
// only known at creation; here we show the bill and a revoke button).
// NOTE: the raw portal token cannot be recovered from its hash, so the
// portal link is returned by the generate API and must be copied then.
// For demo/seeded bills the link is re-issued below via a fresh token.
export default async function BillDetailPage({ params }: PageProps<"/billing/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const bill = await prisma.bill.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { unit: { include: { property: true } }, tenant: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!bill) notFound();
  const items = JSON.parse(bill.itemsJson) as { chargeKey: string; label: string; amount: number; method: string }[];
  const approved = bill.payments.filter((p) => p.status === "Approved").reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, bill.totalAmount - approved);
  // Owner/Admin-only actions: bill deletion and cancellation.
  const perms = await effectivePermissions(user);
  const canDelete = perms.includes("bills.delete");
  const canCancel = perms.includes("bills.cancel");
  // Phase 3 — Send Reminder Again: visible only with reminders.send
  // (Accountant has it; custom roles may hold it). Type follows the bill:
  // past due → overdue_bill, otherwise rent_due.
  const canRemind = perms.includes("reminders.send");
  const isOwnerOrAdmin = user.role === "OWNER" || user.role === "ADMIN";
  const isCancelled = bill.status === "Cancelled";
  const isUnpaid = bill.status === "Unpaid" || bill.status === "Partially Paid";
  const reminderType = bill.dueDate && bill.dueDate < new Date() ? "overdue_bill" : "rent_due";
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3200";
  const proto = host.includes("localhost") ? "http" : "https";
  return (
    <Shell>
      <Link href="/billing" className="text-sm font-semibold text-teal-700">← All bills</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Bill — {periodLabel(bill.billingPeriod)}</h1>
          <p className="text-sm text-slate-500">{bill.unit.property.name} — {bill.unit.unitNo} · {bill.tenant?.fullName ?? "—"} · Due {formatDate(bill.dueDate)}</p>
        </div>
        <div className="no-print flex flex-wrap items-start gap-2">
          <PrintButton />
          <WhatsAppShareButton billId={bill.id} />
          {!isCancelled && isUnpaid && canRemind ? (
            <SendReminderButton type={reminderType} billId={bill.id} isOwnerOrAdmin={isOwnerOrAdmin} />
          ) : null}
          {!isCancelled && canCancel ? <CancelBillButton billId={bill.id} /> : null}
          {!isCancelled && canDelete ? <DeleteBillButton billId={bill.id} /> : null}
        </div>
      </div>
      {!isCancelled && isUnpaid && canRemind ? (
        <p className="mt-2 text-xs text-slate-500">
          Reminder rule: a reminder can be sent again 24 hours after the last one. If no reminder has been sent for this bill yet, the next reminder is due on the bill&apos;s due date ({formatDate(bill.dueDate)}). Full history: <Link href="/reminders" className="font-semibold text-teal-700">Reminders →</Link>
        </p>
      ) : null}
      {isCancelled ? (
        <p className="mt-3 rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
          This bill is cancelled — it no longer counts towards outstanding or collections, and the tenant&apos;s payment link is revoked.
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Charge breakdown (snapshot — never changes)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-2">Charge</th><th>Method</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.chargeKey} className="border-t border-slate-100">
                    <td className="py-2">{it.label}</td><td>{it.method}</td>
                    <td className="text-right font-semibold">{formatPKR(it.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300">
                  <td className="py-2 font-bold" colSpan={2}>Total</td>
                  <td className="py-2 text-right font-bold">{formatPKR(bill.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">Disabled charges (e.g. electricity for a tenant who pays direct) never appear here.</p>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Payment status">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Status</span>{statusBadge(bill.status)}</div>
              <div className="flex justify-between"><span>Total</span><b>{formatPKR(bill.totalAmount)}</b></div>
              <div className="flex justify-between"><span>Verified paid</span><b className="text-emerald-700">{formatPKR(approved)}</b></div>
              <div className="flex justify-between"><span>Remaining</span><b className="text-red-600">{formatPKR(remaining)}</b></div>
              <div className="flex justify-between"><span>Portal link</span>{bill.tokenRevoked ? <Badge tone="red">Revoked</Badge> : <Badge tone="green">Active until {formatDate(bill.tokenExpiresAt)}</Badge>}</div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              The tenant&apos;s secure payment link is created when the bill is generated. Press &ldquo;Copy new payment link&rdquo; to issue a fresh link (old one stops working) and send it via WhatsApp. Tokens are stored hashed, so a link is only shown when it is created.
            </p>
            <ReissueLinkButton billId={bill.id} />
            {!bill.tokenRevoked ? <RevokeButton billId={bill.id} /> : null}
            <p className="mt-2 text-xs text-slate-400">Portal base: {proto}://{host}/pay/&lt;token&gt;</p>
          </Card>
          <Card title="Payments on this bill">
            {bill.payments.length === 0 ? <p className="text-sm text-slate-500">No payments submitted yet.</p> : (
              <ul className="space-y-2 text-sm">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                    <span>{formatPKR(p.amount)} · {p.method}<br /><span className="text-xs text-slate-400">{p.reference ?? ""}</span></span>
                    <span className="text-right">{statusBadge(p.status)}{p.receiptNo ? <span className="block text-xs font-semibold text-teal-700">{p.receiptNo}</span> : null}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/payments" className="mt-2 inline-block text-sm font-semibold text-teal-700">Go to verification →</Link>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
