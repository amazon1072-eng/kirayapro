import { prisma } from "@/lib/prisma";
import { json, requireUser } from "@/lib/api";

// GET /api/notifications?unread=1 — list org notifications, newest first.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const unreadOnly = new URL(req.url).searchParams.get("unread") === "1";
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { organizationId: user.organizationId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { organizationId: user.organizationId, isRead: false } }),
  ]);
  return json({ ok: true, notifications, unreadCount });
}
