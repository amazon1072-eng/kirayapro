import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";
import { sendBillWhatsApp } from "@/lib/whatsapp";
import { formatDate } from "@/lib/format";

// POST /api/whatsapp/send { billId } — single entry point for bill sharing.
// Manual provider (default): returns a wa.me link to open. WABA without
// credentials: honest 503, nothing sent.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "bills.view");
  if (perm) return perm;
  const body = await readBody<{ billId?: string }>(req);
  if (!body) return error("Invalid request.");
  const billId = String(body.billId ?? "");
  const bill = await prisma.bill.findFirst({
    where: { id: billId, organizationId: user.organizationId },
    include: { unit: { include: { property: true } }, tenant: true, payments: { where: { status: "Approved" } } },
  });
  if (!bill) return error("Bill not found.", 404);
  const approved = bill.payments.reduce((s, p) => s + p.amount, 0);
  const base = new URL(req.url);
  const result = await sendBillWhatsApp({
    organizationId: user.organizationId,
    bill: { id: bill.id, billingPeriod: bill.billingPeriod, totalAmount: bill.totalAmount },
    tenant: bill.tenant ? { id: bill.tenant.id, fullName: bill.tenant.fullName, phone: bill.tenant.phone } : null,
    unitLabel: `${bill.unit.property.name} — ${bill.unit.unitNo}`,
    orgName: user.orgName,
    remaining: Math.max(0, bill.totalAmount - approved),
    baseUrl: `${base.protocol}//${base.host}`,
    dueDateLabel: formatDate(bill.dueDate),
  });
  if (!result.ok) return json({ ok: false, error: result.error, provider: result.provider, messageId: result.messageId }, result.status);
  return json({ ...result });
}
