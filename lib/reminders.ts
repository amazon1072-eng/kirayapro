// KirayaPro Phase 3 — "Send Reminder Again".
// Extends the EXISTING notification/reminder system (lib/notifications.ts):
// resends go through the existing WhatsApp provider (lib/whatsapp.ts) and
// every attempt is logged in ReminderLog + posted as a Notification.
// There is no second reminder system.
//
// NEXT REMINDER DATE RULE (single source of truth — API + UI both use it):
//   - If a reminder was already sent for this bill/tenant:
//         Next = lastSentAt + 24h   (earliest allowed resend = end of cooldown)
//   - If never sent:
//         Next = the milestone date (bill dueDate for rent_due / overdue_bill;
//         agreement rentalEnd for agreement_expiry)
//   - If neither exists, Next is null ("—" in the UI).
import { prisma } from "./prisma";

export const REMINDER_TYPES = ["rent_due", "overdue_bill", "agreement_expiry"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_LABELS: Record<ReminderType, string> = {
  rent_due: "Rent due",
  overdue_bill: "Overdue bill",
  agreement_expiry: "Agreement expiry",
};

/** 24 hours between resends of the same reminder. */
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isReminderType(v: unknown): v is ReminderType {
  return typeof v === "string" && (REMINDER_TYPES as readonly string[]).includes(v);
}

/**
 * Next Reminder Date rule (see header). lastSentAt null = never sent.
 * Returns null only when there is no last send AND no milestone date.
 */
export function nextReminderDate(
  lastSentAt: Date | null,
  milestoneDate: Date | null,
): Date | null {
  if (lastSentAt) return new Date(lastSentAt.getTime() + REMINDER_COOLDOWN_MS);
  if (milestoneDate) return milestoneDate;
  return null;
}

/** Most recent ReminderLog for one (type, bill OR tenant) key in an org. */
export async function findLastReminder(opts: {
  organizationId: string;
  type: ReminderType;
  billId?: string | null;
  tenantId?: string | null;
}) {
  return prisma.reminderLog.findFirst({
    where: {
      organizationId: opts.organizationId,
      type: opts.type,
      ...(opts.billId ? { billId: opts.billId } : {}),
      ...(opts.tenantId && !opts.billId ? { tenantId: opts.tenantId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export type ReminderSummary = {
  type: ReminderType;
  billId: string | null;
  tenantId: string;
  tenantName: string;
  reference: string;
  lastSentAt: string | null;
  milestoneDate: string | null;
  nextReminderDate: string | null;
};

/**
 * One summary row per (type, bill/tenant) key that has at least one log,
 * newest last-sent first. Milestone dates are resolved from the real bill
 * (dueDate) or tenant (rentalEnd) so Next is correct even for keys whose
 * bill/tenant was created after the log.
 */
export async function getReminderSummaries(organizationId: string): Promise<ReminderSummary[]> {
  const logs = await prisma.reminderLog.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  const byKey = new Map<string, (typeof logs)[number]>();
  for (const log of logs) {
    const key = `${log.type}|${log.billId ?? ""}|${log.tenantId}`;
    if (!byKey.has(key)) byKey.set(key, log);
  }
  const billIds = [...new Set([...byKey.values()].map((l) => l.billId).filter((x): x is string => !!x))];
  const tenantIds = [...new Set([...byKey.values()].map((l) => l.tenantId))];
  const [bills, tenants] = await Promise.all([
    billIds.length
      ? prisma.bill.findMany({ where: { id: { in: billIds } }, select: { id: true, dueDate: true } })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, rentalEnd: true } })
      : Promise.resolve([]),
  ]);
  const billDue = new Map(bills.map((b) => [b.id, b.dueDate]));
  const tenantEnd = new Map(tenants.map((t) => [t.id, t.rentalEnd]));
  const summaries: ReminderSummary[] = [...byKey.values()].map((log) => {
    const milestone =
      log.type === "agreement_expiry" ? (tenantEnd.get(log.tenantId) ?? null) : log.billId ? (billDue.get(log.billId) ?? null) : null;
    const next = nextReminderDate(log.createdAt, milestone);
    return {
      type: log.type as ReminderType,
      billId: log.billId,
      tenantId: log.tenantId,
      tenantName: log.tenantName,
      reference: log.reference,
      lastSentAt: log.createdAt.toISOString(),
      milestoneDate: milestone ? milestone.toISOString() : null,
      nextReminderDate: next ? next.toISOString() : null,
    };
  });
  summaries.sort((a, b) => (b.lastSentAt ?? "").localeCompare(a.lastSentAt ?? ""));
  return summaries;
}
