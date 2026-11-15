import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser } from "@/lib/api";

// POST /api/notifications/read { id? | all: true } — mark read.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await readBody<{ id?: string; all?: boolean }>(req);
  if (!body) return error("Invalid request.");
  if (body.all) {
    const res = await prisma.notification.updateMany({
      where: { organizationId: user.organizationId, isRead: false },
      data: { isRead: true },
    });
    return json({ ok: true, marked: res.count });
  }
  if (!body.id) return error("Notification id is required.");
  const n = await prisma.notification.findFirst({ where: { id: body.id, organizationId: user.organizationId } });
  if (!n) return error("Notification not found.", 404);
  await prisma.notification.update({ where: { id: body.id }, data: { isRead: true } });
  return json({ ok: true, marked: 1 });
}
