import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";

// GET /api/reports/csv?from=YYYY-MM-DD&to=YYYY-MM-DD
// CSV export of bills + approved payments + expenses, org-scoped.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const fromDate = from ? new Date(`${from}T00:00:00`) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(`${to}T23:59:59`) : new Date();
  const bills = await prisma.bill.findMany({
    where: { organizationId: user.organizationId, createdAt: { gte: fromDate, lte: toDate }, status: { not: "Cancelled" } },
    include: { unit: { include: { property: true } }, tenant: true, payments: { where: { status: "Approved" } } },
    orderBy: { createdAt: "desc" },
  });
  const expenses = await prisma.expense.findMany({
    where: { organizationId: user.organizationId, spentDate: { gte: fromDate, lte: toDate } },
    orderBy: { spentDate: "desc" },
  });
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push("KirayaPro Report — Bills");
  lines.push("Period,Property,Unit,Tenant,Bill Total (Rs),Approved Paid (Rs),Remaining (Rs),Status");
  for (const b of bills) {
    const paid = b.payments.reduce((s, p) => s + p.amount, 0);
    lines.push([b.billingPeriod, b.unit.property.name, b.unit.unitNo, b.tenant?.fullName ?? "", b.totalAmount, paid, Math.max(0, b.totalAmount - paid), b.status].map(esc).join(","));
  }
  lines.push("");
  lines.push("Expenses");
  lines.push("Date,Category,Description,Vendor,Amount (Rs)");
  for (const e of expenses) {
    lines.push([e.spentDate.toISOString().slice(0, 10), e.category, e.description, e.vendor ?? "", e.amount].map(esc).join(","));
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="kirayapro-report.csv"` },
  });
}
