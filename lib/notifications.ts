// KirayaPro Phase 2 — notifications engine.
// Scans real data and creates Notification rows with a dedupKey, so
// re-running the engine never duplicates a notification.
import { prisma } from "./prisma";

export type NotificationType =
  | "rent_reminder"
  | "overdue"
  | "agreement_expiry"
  | "payment_submitted"
  | "payment_approved"
  | "payment_rejected"
  | "payment_voided"
  | "maintenance_update";

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  rent_reminder: "Rent reminder",
  overdue: "Overdue bill",
  agreement_expiry: "Agreement expiring",
  payment_submitted: "Payment submitted",
  payment_approved: "Payment approved",
  payment_rejected: "Payment rejected",
  payment_voided: "Payment voided",
  maintenance_update: "Maintenance update",
};

/** Create one notification unless its dedupKey already exists. Returns true if created. */
export async function createNotification(opts: {
  organizationId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  relatedId?: string | null;
  dedupKey: string;
}): Promise<boolean> {
  // Check first (instead of relying on the unique-constraint error) so the
  // daily cron log stays clean — dedup hits are normal, not errors.
  const existing = await prisma.notification.findUnique({ where: { dedupKey: opts.dedupKey }, select: { id: true } });
  if (existing) return false;
  try {
    await prisma.notification.create({
      data: {
        organizationId: opts.organizationId,
        userId: opts.userId ?? null,
        type: opts.type,
        title: opts.title,
        body: opts.body,
        link: opts.link ?? null,
        relatedId: opts.relatedId ?? null,
        dedupKey: opts.dedupKey,
      },
    });
    return true;
  } catch {
    // Unique dedupKey race — already exists, skip.
    return false;
  }
}

const DAY = 24 * 60 * 60 * 1000;

export async function generateNotifications(orgId: string): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const bump = (ok: boolean) => {
    if (ok) created++;
    else skipped++;
  };
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * DAY);

  // (a) Rent reminders: unpaid/partially-paid bills due within the next 3 days.
  const dueSoon = await prisma.bill.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["Unpaid", "Partially Paid"] },
      dueDate: { gte: now, lte: in3Days },
    },
    include: { unit: { include: { property: true } }, tenant: true },
  });
  for (const b of dueSoon) {
    bump(
      await createNotification({
        organizationId: orgId,
        type: "rent_reminder",
        title: `Rent due soon — ${b.unit.property.name} ${b.unit.unitNo}`,
        body: `${b.tenant?.fullName ?? "Tenant"}'s bill for ${b.billingPeriod} (Rs. ${b.totalAmount.toLocaleString("en-PK")}) is due ${b.dueDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`,
        link: `/billing/${b.id}`,
        relatedId: b.id,
        dedupKey: `rent_reminder:${b.id}:${b.billingPeriod}`,
      }),
    );
  }

  // (b) Overdue: past due date and still unpaid.
  const overdue = await prisma.bill.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["Unpaid", "Partially Paid"] },
      dueDate: { lt: now },
    },
    include: { unit: { include: { property: true } }, tenant: true },
  });
  for (const b of overdue) {
    bump(
      await createNotification({
        organizationId: orgId,
        type: "overdue",
        title: `Overdue bill — ${b.unit.property.name} ${b.unit.unitNo}`,
        body: `${b.tenant?.fullName ?? "Tenant"}'s bill for ${b.billingPeriod} (Rs. ${b.totalAmount.toLocaleString("en-PK")}) is past its due date.`,
        link: `/billing/${b.id}`,
        relatedId: b.id,
        dedupKey: `overdue:${b.id}:${b.billingPeriod}`,
      }),
    );
  }

  // (c) Agreement expiry: ONE reminder per tenant — the NEAREST window
  // wins. A tenant 25 days from expiry gets only the 30-day reminder
  // (labelled as such); the 60-day reminder is suppressed, so the same
  // agreement never appears twice. A tenant 31–60 days out gets only the
  // 60-day reminder, and the 30-day one fires later when they enter that
  // window (separate dedupKey per window).
  const tenants = await prisma.tenant.findMany({
    where: { organizationId: orgId, status: "Active", rentalEnd: { not: null } },
  });
  for (const t of tenants) {
    if (!t.rentalEnd) continue;
    const days = Math.ceil((t.rentalEnd.getTime() - now.getTime()) / DAY);
    if (days < 0) continue;
    const windowDays = days <= 30 ? 30 : days <= 60 ? 60 : null;
    if (windowDays === null) continue;
    const dayWord = days === 1 ? "day" : "days";
    const endDate = t.rentalEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    bump(
      await createNotification({
        organizationId: orgId,
        type: "agreement_expiry",
        title: `Agreement expiring in ${days} ${dayWord} (${windowDays}-day reminder) — ${t.fullName}`,
        body: `${t.fullName}'s rental agreement ends ${endDate}. This is the ${windowDays}-day reminder — renew or follow up.`,
        link: "/tenants",
        relatedId: t.id,
        dedupKey: `agreement_expiry:${t.id}:${windowDays}`,
      }),
    );
  }

  // (d) Payments Pending → payment_submitted (one per payment).
  const pending = await prisma.payment.findMany({
    where: { organizationId: orgId, status: "Pending" },
    include: { bill: { include: { unit: { include: { property: true } }, tenant: true } } },
  });
  for (const p of pending) {
    bump(
      await createNotification({
        organizationId: orgId,
        type: "payment_submitted",
        title: `Payment submitted — Rs. ${p.amount.toLocaleString("en-PK")} (${p.method})`,
        body: `${p.bill.tenant?.fullName ?? "Tenant"} submitted Rs. ${p.amount.toLocaleString("en-PK")} for bill ${p.bill.billingPeriod} (${p.bill.unit.property.name} ${p.bill.unit.unitNo}). Awaiting verification.`,
        link: "/payments",
        relatedId: p.id,
        dedupKey: `payment_submitted:${p.id}`,
      }),
    );
  }

  // (e) Payments Approved/Rejected in the last 7 days.
  const since7d = new Date(now.getTime() - 7 * DAY);
  const decided = await prisma.payment.findMany({
    where: { organizationId: orgId, status: { in: ["Approved", "Rejected"] }, verifiedAt: { gte: since7d } },
    include: { bill: { include: { unit: { include: { property: true } }, tenant: true } } },
  });
  for (const p of decided) {
    const type: NotificationType = p.status === "Approved" ? "payment_approved" : "payment_rejected";
    bump(
      await createNotification({
        organizationId: orgId,
        type,
        title: `Payment ${p.status.toLowerCase()} — Rs. ${p.amount.toLocaleString("en-PK")} (${p.method})`,
        body: `${p.bill.tenant?.fullName ?? "Tenant"}'s payment of Rs. ${p.amount.toLocaleString("en-PK")} for bill ${p.bill.billingPeriod} was ${p.status.toLowerCase()}${p.receiptNo ? ` — receipt ${p.receiptNo}` : ""}.`,
        link: "/payments",
        relatedId: p.id,
        dedupKey: `${type}:${p.id}`,
      }),
    );
  }

  // (f) Maintenance requests updated in the last 24h and not Pending.
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const maint = await prisma.maintenanceRequest.findMany({
    where: { organizationId: orgId, status: { not: "Pending" }, updatedAt: { gte: since24h } },
  });
  for (const m of maint) {
    bump(
      await createNotification({
        organizationId: orgId,
        type: "maintenance_update",
        title: `Maintenance: ${m.title} — ${m.status}`,
        body: `Request "${m.title}" (${m.category}) is now ${m.status}.`,
        link: "/maintenance",
        relatedId: m.id,
        dedupKey: `maintenance_update:${m.id}:${m.status}`,
      }),
    );
  }

  return { created, skipped };
}
