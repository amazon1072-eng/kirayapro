import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { Shell, Card, Badge } from "@/components/ui";
import { NotificationActions, NotificationItem, SendReminderButton } from "@/components/forms";
import { NOTIFICATION_LABELS, type NotificationType } from "@/lib/notifications";

/** Notification type → "Send Reminder Again" type (null = no resend here). */
function reminderFor(n: { type: string; relatedId: string | null }): { type: "rent_due" | "overdue_bill" | "agreement_expiry"; billId?: string; tenantId?: string } | null {
  if (!n.relatedId) return null;
  if (n.type === "rent_reminder") return { type: "rent_due", billId: n.relatedId };
  if (n.type === "overdue") return { type: "overdue_bill", billId: n.relatedId };
  if (n.type === "agreement_expiry") return { type: "agreement_expiry", tenantId: n.relatedId };
  return null;
}

function relativeTime(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(date);
}

const TYPE_TONE: Record<string, "green" | "amber" | "red" | "blue" | "slate" | "teal"> = {
  rent_reminder: "amber",
  overdue: "red",
  agreement_expiry: "blue",
  payment_submitted: "teal",
  payment_approved: "green",
  payment_rejected: "red",
  maintenance_update: "slate",
};

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const filter = typeof sp?.filter === "string" ? sp.filter : "All";
  const unreadOnly = filter === "Unread";
  const perms = await effectivePermissions(user);
  const canRemind = perms.includes("reminders.send");
  const isOwnerOrAdmin = user.role === "OWNER" || user.role === "ADMIN";
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { organizationId: user.organizationId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { organizationId: user.organizationId, isRead: false } }),
  ]);
  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Notifications</h1>
          <p className="mb-5 text-sm text-slate-500">
            Rent reminders, overdue bills, expiring agreements, payments and maintenance updates — generated from your real data. {unreadCount} unread.
          </p>
        </div>
        <NotificationActions />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(["All", "Unread"] as const).map((f) => (
          <Link key={f} href={`/notifications?filter=${f}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${filter === f ? "bg-teal-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300"}`}>
            {f}{f === "Unread" ? ` (${unreadCount})` : ` (${notifications.length})`}
          </Link>
        ))}
      </div>
      {notifications.length === 0 ? (
        <Card><p className="text-sm text-slate-500">No {unreadOnly ? "unread " : ""}notifications yet. Press “Generate now” to scan your bills, tenants, payments and maintenance.</p></Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const reminder = canRemind ? reminderFor(n) : null;
            return (
            <Card key={n.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TYPE_TONE[n.type] ?? "slate"}>{NOTIFICATION_LABELS[n.type as NotificationType] ?? n.type}</Badge>
                    {!n.isRead ? <Badge tone="red">Unread</Badge> : null}
                    <span className="text-xs text-slate-400">{relativeTime(n.createdAt)} · {formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="mt-1 font-semibold">{n.title}</p>
                  <p className="text-sm text-slate-600">{n.body}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <NotificationItem id={n.id} link={n.link} />
                  {reminder ? (
                    <SendReminderButton type={reminder.type} billId={reminder.billId} tenantId={reminder.tenantId} isOwnerOrAdmin={isOwnerOrAdmin} />
                  ) : null}
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-400">
        The engine also runs daily via cron: <span className="font-mono">0 8 * * * cd ~/workspace/kirayapro &amp;&amp; npm run notifications</span>
      </p>
    </Shell>
  );
}
