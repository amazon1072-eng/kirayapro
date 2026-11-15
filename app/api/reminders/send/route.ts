import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";
import { sendBillWhatsApp, sendAgreementWhatsApp } from "@/lib/whatsapp";
import { createNotification, type NotificationType } from "@/lib/notifications";
import { formatDate, formatDateTime } from "@/lib/format";
import { canManageOrgUser } from "@/lib/auth";
import {
  REMINDER_COOLDOWN_MS,
  REMINDER_LABELS,
  findLastReminder,
  isReminderType,
  nextReminderDate,
  type ReminderType,
} from "@/lib/reminders";

// POST /api/reminders/send { type, billId?, tenantId?, override? }
// "Send Reminder Again" — resends a rent/overdue/agreement reminder.
// Permission: reminders.send (Accountant has it; custom roles may hold it).
// Cooldown: 24h per (type, bill/tenant). Inside the cooldown the resend is
// refused 409 unless override=true AND the user is OWNER/ADMIN
// (Accountant override → 403). Every delivery ATTEMPT (success or
// failure) is logged in ReminderLog + posted as a Notification; a 409
// cooldown refusal is not an attempt and logs nothing.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "reminders.send");
  if (perm) return perm;
  const body = await readBody<{ type?: string; billId?: string; tenantId?: string; override?: boolean }>(req);
  if (!body || !isReminderType(body.type)) {
    return error("Invalid reminder type. Use rent_due, overdue_bill or agreement_expiry.", 400);
  }
  const type: ReminderType = body.type;
  const override = body.override === true;
  if (override && !canManageOrgUser(user)) {
    return error("Only the Owner or Admin can override the 24-hour reminder cooldown.", 403);
  }

  // --- Resolve tenant + bill from this org (cross-org → 404). ---
  let bill: {
    id: string;
    billingPeriod: string;
    totalAmount: number;
    status: string;
    dueDate: Date | null;
    tenantId: string | null;
    tenant: { id: string; fullName: string; phone: string; rentalEnd: Date | null } | null;
    unit: { property: { name: string }; unitNo: string };
    payments: { amount: number }[];
  } | null = null;
  let tenant: { id: string; fullName: string; phone: string; rentalEnd: Date | null } | null = null;
  let reference = "";
  let milestone: Date | null = null;
  let link = "/reminders";

  if (type === "agreement_expiry") {
    const tenantId = String(body.tenantId ?? "");
    if (!tenantId) return error("tenantId is required for an agreement-expiry reminder.", 400);
    tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, organizationId: user.organizationId },
      select: { id: true, fullName: true, phone: true, rentalEnd: true },
    });
    if (!tenant) return error("Tenant not found.", 404);
    if (!tenant.rentalEnd) return error("This tenant has no agreement end date, so there is nothing to remind about.", 409);
    reference = tenant.rentalEnd.toISOString().slice(0, 10);
    milestone = tenant.rentalEnd;
    link = "/tenants";
  } else {
    const billId = String(body.billId ?? "");
    if (!billId) return error("billId is required for a bill reminder.", 400);
    const found = await prisma.bill.findFirst({
      where: { id: billId, organizationId: user.organizationId },
      include: {
        tenant: { select: { id: true, fullName: true, phone: true, rentalEnd: true } },
        unit: { include: { property: true } },
        payments: { where: { status: "Approved" }, select: { amount: true } },
      },
    });
    if (!found) return error("Bill not found.", 404);
    if (found.status === "Paid") return error("This bill is already paid — no reminder needed.", 409);
    if (found.status === "Cancelled") return error("This bill is cancelled — no reminder can be sent.", 409);
    if (!found.tenant) return error("This bill has no tenant linked, so there is no one to remind.", 404);
    bill = found;
    tenant = found.tenant;
    reference = found.billingPeriod;
    milestone = found.dueDate;
    link = `/billing/${found.id}`;
  }

  // --- Cooldown: 24h per (type, billId OR tenantId). ---
  const last = await findLastReminder({
    organizationId: user.organizationId,
    type,
    billId: bill?.id ?? null,
    tenantId: tenant.id,
  });
  const now = new Date();
  if (last && !override) {
    const elapsed = now.getTime() - last.createdAt.getTime();
    if (elapsed < REMINDER_COOLDOWN_MS) {
      const next = new Date(last.createdAt.getTime() + REMINDER_COOLDOWN_MS);
      return json(
        {
          ok: false,
          error: `A ${REMINDER_LABELS[type].toLowerCase()} reminder was already sent to ${tenant.fullName} at ${formatDateTime(last.createdAt)}. You can send it again after ${formatDateTime(next)} (24 hours later).`,
          lastSentAt: last.createdAt.toISOString(),
          nextReminderDate: next.toISOString(),
          canOverride: canManageOrgUser(user),
        },
        409,
      );
    }
  }

  // --- Delivery through the EXISTING WhatsApp provider module. ---
  const base = new URL(req.url);
  let channel: "manual" | "waba";
  let status: "manual_link" | "sent" | "failed";
  let waLink: string | null = null;
  let deliveryError: string | null = null;
  let deliveryStatus = 200;

  if (type === "agreement_expiry") {
    const result = await sendAgreementWhatsApp({
      organizationId: user.organizationId,
      tenant: { id: tenant.id, fullName: tenant.fullName, phone: tenant.phone },
      orgName: user.orgName,
      endDateLabel: formatDate(tenant.rentalEnd),
    });
    channel = result.provider;
    if (result.ok) {
      status = result.provider === "manual" ? "manual_link" : "sent";
      waLink = result.provider === "manual" ? result.waLink : null;
    } else {
      status = "failed";
      deliveryError = result.error;
      deliveryStatus = result.status;
    }
  } else {
    const approved = bill!.payments.reduce((s, p) => s + p.amount, 0);
    const result = await sendBillWhatsApp({
      organizationId: user.organizationId,
      bill: { id: bill!.id, billingPeriod: bill!.billingPeriod, totalAmount: bill!.totalAmount },
      tenant: { id: tenant.id, fullName: tenant.fullName, phone: tenant.phone },
      unitLabel: `${bill!.unit.property.name} — ${bill!.unit.unitNo}`,
      orgName: user.orgName,
      remaining: Math.max(0, bill!.totalAmount - approved),
      baseUrl: `${base.protocol}//${base.host}`,
      dueDateLabel: formatDate(bill!.dueDate),
    });
    channel = result.provider;
    if (result.ok) {
      status = result.provider === "manual" ? "manual_link" : "sent";
      waLink = result.provider === "manual" ? result.waLink : null;
    } else {
      status = "failed";
      deliveryError = result.error;
      deliveryStatus = result.status;
    }
  }

  // --- Log every attempt, and post a Notification so /notifications shows it. ---
  const log = await prisma.reminderLog.create({
    data: {
      organizationId: user.organizationId,
      type,
      billId: bill?.id ?? null,
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      phone: tenant.phone,
      channel,
      status,
      reference,
      sentBy: user.id,
      sentByName: user.fullName,
      override,
    },
  });
  const notifType: NotificationType =
    type === "agreement_expiry" ? "agreement_expiry" : type === "overdue_bill" ? "overdue" : "rent_reminder";
  await createNotification({
    organizationId: user.organizationId,
    type: notifType,
    title:
      status === "failed"
        ? `Reminder failed — ${tenant.fullName} (${reference})`
        : `Reminder resent — ${tenant.fullName} (${reference})`,
    body:
      status === "failed"
        ? `${REMINDER_LABELS[type]} reminder for ${tenant.fullName} could not be sent (${deliveryError ?? "delivery failed"}). Sent by ${user.fullName}${override ? " (override)" : ""}.`
        : `${REMINDER_LABELS[type]} reminder for ${tenant.fullName} was ${channel === "manual" ? "prepared as a WhatsApp link" : "sent via WhatsApp Business API"} by ${user.fullName}${override ? " (override — inside the 24-hour cooldown)" : ""}.`,
    link,
    relatedId: bill?.id ?? tenant.id,
    dedupKey: `reminder_resent:${log.id}`,
  });

  const next = nextReminderDate(log.createdAt, milestone);
  if (status === "failed") {
    return json(
      {
        ok: false,
        error: deliveryError ?? "Reminder could not be sent.",
        provider: channel,
        reminderLogId: log.id,
        lastSentAt: log.createdAt.toISOString(),
        nextReminderDate: next ? next.toISOString() : null,
      },
      deliveryStatus,
    );
  }
  return json({
    ok: true,
    provider: channel,
    channel,
    status,
    waLink,
    reminderLogId: log.id,
    lastSentAt: log.createdAt.toISOString(),
    nextReminderDate: next ? next.toISOString() : null,
    message:
      channel === "manual"
        ? "WhatsApp link generated — open it to send the reminder from your phone."
        : "Reminder sent via WhatsApp Business API.",
  });
}
