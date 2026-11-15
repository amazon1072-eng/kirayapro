import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { formatPKR, formatDate, periodLabel } from "@/lib/format";
import { statusBadge } from "@/components/ui";
import { PortalPaymentForm } from "@/components/forms";

// Public tenant portal — NO login. Only THIS bill is visible via its token.
export default async function PortalPage({ params }: PageProps<"/pay/[token]">) {
  const { token } = await params;
  const bill = await prisma.bill.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { unit: { include: { property: true } }, tenant: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!bill || bill.tokenRevoked || (bill.tokenExpiresAt && bill.tokenExpiresAt <= new Date())) {
    notFound();
  }
  const items = JSON.parse(bill.itemsJson) as { chargeKey: string; label: string; amount: number; method: string }[];
  const approved = bill.payments.filter((p) => p.status === "Approved").reduce((s, p) => s + p.amount, 0);
  const pending = bill.payments.filter((p) => p.status === "Pending").reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, bill.totalAmount - approved);
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-xl">
        <p className="text-center text-2xl font-extrabold text-[#0b2545]">Kiraya<span className="text-teal-600">Pro</span></p>
        <p className="text-center text-xs text-slate-500">Har Unit Ka Hisaab, Har Malik Ka Aitmaad</p>
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-bold">Your bill — {periodLabel(bill.billingPeriod)}</h1>
          <p className="text-sm text-slate-500">{bill.tenant?.fullName ?? "Tenant"} · {bill.unit.property.name} — {bill.unit.unitNo} · Due {formatDate(bill.dueDate)}</p>
          <div className="mt-4">
            <table className="w-full text-sm">
              <tbody>
                {items.map((it) => (
                  <tr key={it.chargeKey} className="border-t border-slate-100">
                    <td className="py-2">{it.label}</td>
                    <td className="py-2 text-right font-semibold">{formatPKR(it.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300">
                  <td className="py-2 font-bold">Total</td>
                  <td className="py-2 text-right font-bold">{formatPKR(bill.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between"><span>Status</span>{statusBadge(bill.status)}</div>
            <div className="flex justify-between"><span>Verified paid</span><b className="text-emerald-700">{formatPKR(approved)}</b></div>
            {pending > 0 ? (
              <div className="flex justify-between"><span>Submitted — awaiting verification</span><b className="text-amber-700">{formatPKR(pending)}</b></div>
            ) : null}
            <div className="flex justify-between"><span>Remaining balance</span><b className="text-red-600">{formatPKR(remaining)}</b></div>
          </div>
          {remaining > 0 ? (
            <div className="mt-6">
              <h2 className="mb-3 font-bold">Pay &amp; submit proof</h2>
              <PortalPaymentForm token={token} />
              <p className="mt-3 text-xs text-slate-500">Pay by Cash, bank transfer, Easypaisa or JazzCash, then submit the amount, reference and a photo of your proof here. The owner will verify it and your receipt will appear below once approved.</p>
            </div>
          ) : (
            <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">This bill is fully paid. Thank you!</p>
          )}
          {bill.payments.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-2 font-bold">Your payments on this bill</h2>
              <ul className="space-y-2 text-sm">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                    <span>{formatPKR(p.amount)} · {p.method} · {p.reference ?? ""}<br /><span className="text-xs text-slate-400">{formatDate(p.paidDate)}{p.rejectReason ? ` — Rejected: ${p.rejectReason}` : ""}</span></span>
                    <span className="text-right">{statusBadge(p.status)}{p.receiptNo ? <span className="block text-xs font-bold text-teal-700">{p.receiptNo}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">This link shows only your bill. Do not share it with others.</p>
      </div>
    </div>
  );
}
