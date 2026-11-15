import { canManageOrgUser } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";
import { generateNotifications } from "@/lib/notifications";

// POST /api/notifications/generate — ADMIN+ only, runs the engine for the org.
export async function POST() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!canManageOrgUser(user)) return error("Only the owner or an admin can run the notification engine.", 403);
  const result = await generateNotifications(user.organizationId);
  return json({ ok: true, ...result, message: `Notifications generated: ${result.created} new, ${result.skipped} already existed.` });
}
