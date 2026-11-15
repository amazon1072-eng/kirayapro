import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { Shell, Card, Badge } from "@/components/ui";
import { REMINDER_LABELS, getReminderSummaries, type ReminderType } from "@/lib/reminders";

// Reminders history: every "Send Reminder Again" attempt, newest first,
// plus one row per (type, bill/tenant) with Last Reminder Sent and
// Next Reminder Date.
// NEXT REMINDER DATE RULE: if a reminder was sent, Next = last sent + 24h
// (earliest allowed resend). If never sent, Next = the milestone date
// (bill due date for rent/overdue, agreement end date for agreements).
const TYPE_TONE: Record<string, "green" | "amber" | "red" | "blue" | "slate" | "teal"> = {
  rent_due: "amber",
  overdue_bill: "red",
  agreement_expiry: "blue",
};

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  manual_link: "amber",
  sent: "green",
  failed: "red",
};

const STATUS_LABEL: Record<string, string> = {
  manual_link: "Link generated",
  sent: "Sent",
  failed: "Failed",
};

export default async function RemindersPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [rows, summaries] = await Promise.all([
    prisma.reminderLog.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getReminderSummaries(user.organizationId),
  ]);
  return (
    <Shell>
      <h1 className="text-2xl font-extrabold">Reminders</h1>
      <p className="mb-5 text-sm text-slate-500">
        Every &ldquo;Send Reminder Again&rdquo; attempt, newest first. A reminder can be sent again 24 hours after the last one — so
        Next Reminder Date is last sent + 24h. If no reminder has been sent yet, Next is the milestone date (bill due date, or agreement end date).
        Manual reminders only generate a WhatsApp link for you to send — the server never sends them itself.
      </p>

      <div className="mb-5">
        <Card title="Next reminder per bill / tenant" sub="Last Reminder Sent and Next Reminder Date for each bill or agreement that has had a reminder.">
          {summaries.length === 0 ? (
            <p className="text-sm text-slate-500">No reminders sent yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-slate-500"><th className="py-2">Tenant</th><th>Type</th><th>Reference</th><th>Last Reminder Sent</th><th>Next Reminder Date</th></tr></thead>
                <tbody>
                  {summaries.map((s) => (
                    <tr key={`${s.type}-${s.billId ?? s.tenantId}`} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{s.tenantName}</td>
                      <td><Badge tone={TYPE_TONE[s.type] ?? "slate"}>{REMINDER_LABELS[s.type as ReminderType] ?? s.type}</Badge></td>
                      <td>{s.reference}</td>
                      <td>{s.lastSentAt ? formatDateTime(s.lastSentAt) : "—"}</td>
                      <td className="font-semibold">{s.nextReminderDate ? formatDateTime(s.nextReminderDate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title={`Reminder history (${rows.length})`} sub="Date, time, tenant, phone, type, channel, reference, status, sent by, override.">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No reminders sent yet. Use &ldquo;Send Reminder Again&rdquo; on a bill, a tenant row, or a notification.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-2">Date &amp; time</th><th>Tenant</th><th>Phone</th><th>Type</th><th>Channel</th><th>Reference</th><th>Status</th><th>Sent by</th><th>Override</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="py-2">{formatDateTime(r.createdAt)}</td>
                    <td className="font-medium">{r.tenantName}</td>
                    <td>{r.phone}</td>
                    <td><Badge tone={TYPE_TONE[r.type] ?? "slate"}>{REMINDER_LABELS[r.type as ReminderType] ?? r.type}</Badge></td>
                    <td>{r.channel === "manual" ? "Manual (wa.me link)" : "WhatsApp Business API"}</td>
                    <td>{r.reference}</td>
                    <td><Badge tone={STATUS_TONE[r.status] ?? "slate"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                    <td>{r.sentByName}</td>
                    <td>{r.override ? <Badge tone="amber">Override</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-xs text-slate-400">
        Milestone dates: bill due date for rent/overdue reminders, agreement end date for agreement reminders.
      </p>
    </Shell>
  );
}
