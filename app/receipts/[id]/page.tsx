import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatPKR, formatDate, periodLabel } from "@/lib/format";
import { Shell, Card } from "@/components/ui";
import { PrintButton } from "@/components/forms";

export default async function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return null;
  const payment = await prisma.payment.findFirst({
    where: { id, organizationId: user.organizationId, status: { in: ["Approved", "Voided"] } },
    include: { bill: { include: { unit: { include: { property: true } }, tenant: true, payments: { where: { status: "Approved" } } } } },
  });
  if (!payment || !payment.receiptNo) notFound();
  const isVoided = payment.status === "Voided";
  const approvedTotal = payment.bill.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, payment.bill.totalAmount - approvedTotal);
  return (
    <Shell>
      <Link href="/payments" className="text-sm font-semibold text-teal-700">← Payments</Link>
      {isVoided ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-200">
          VOIDED — this receipt is no longer valid. The payment was voided by an Owner/Admin and the amount is back on the bill as outstanding.
        </p>
      ) : null}
      <div className="mt-4 flex justify-end no-print"><PrintButton /></div>
      <div className="print-card mx-auto mt-2 max-w-xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="border-b border-slate-200 pb-4 text-center">
          <p className="text-2xl font-extrabold text-[#0b2545]">Kiraya<span className="text-teal-600">Pro</span></p>
          <p className="text-xs text-slate-500">Har Unit Ka Hisaab, Har Malik Ka Aitmaad</p>
          <h1 className="mt-3 text-xl font-bold">Payment Receipt</h1>
          <p className="text-lg font-extrabold text-teal-700">{payment.receiptNo}</p>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Received from</dt><dd className="font-semibold">{payment.bill.tenant?.fullName ?? "Tenant"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Property / Unit</dt><dd className="font-semibold">{payment.bill.unit.property.name} — {payment.bill.unit.unitNo}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Bill period</dt><dd>{periodLabel(payment.bill.billingPeriod)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Bill total</dt><dd>{formatPKR(payment.bill.totalAmount)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Amount received</dt><dd className="text-base font-extrabold">{formatPKR(payment.amount)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Payment method</dt><dd>{payment.method}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Reference</dt><dd>{payment.reference ?? "—"}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Date paid</dt><dd>{formatDate(payment.paidDate)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Verified on</dt><dd>{formatDate(payment.verifiedAt)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-2"><dt className="font-semibold">Remaining balance</dt><dd className="font-bold text-red-600">{formatPKR(remaining)}</dd></div>
        </dl>
        <p className="mt-6 text-center text-xs text-slate-400">This is a computer-generated receipt from {user.orgName}. Verification status: {isVoided ? "Voided" : "Approved"}.</p>
      </div>
      <p className="mt-3 text-center text-sm text-slate-500">
        Shareable with the tenant via their payment link: <Link href={`/billing/${payment.billId}`} className="font-semibold text-teal-700">open the bill →</Link>
      </p>
      <Card><p className="text-sm text-slate-500">Print this page (Ctrl/Cmd + P) for a paper copy, or use your browser&apos;s &ldquo;Save as PDF&rdquo;.</p></Card>
    </Shell>
  );
}
