import { prisma } from "@/lib/prisma";
import { json, requireUser } from "@/lib/api";
import { getReminderSummaries } from "@/lib/reminders";

// GET /api/reminders/history — full ReminderLog history for the org
// (newest first) plus, per (type, bill/tenant), lastSentAt and
// nextReminderDate. Next rule: lastSent + 24h if sent before, else the
// milestone date (bill dueDate / agreement rentalEnd).
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const [rows, summaries] = await Promise.all([
    prisma.reminderLog.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getReminderSummaries(user.organizationId),
  ]);
  return json({ ok: true, reminders: rows, summaries });
}
