import { prisma } from "@/lib/prisma";
import { canManageOrgUser } from "@/lib/auth";
import { error, json, readBody, requireUser } from "@/lib/api";

// POST /api/demo { action: clear | restore }
// Demo data lives in a SEPARATE demo org (isDemo) and never mixes with
// real orgs. Clear deletes the demo org; restore re-seeds it via seed.ts.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!user.orgIsDemo) return error("Demo actions are only available in the demo organization.", 403);
  if (!canManageOrgUser(user)) return error("Only the owner or an admin can manage demo data.", 403);
  const body = await readBody<{ action?: string }>(req);
  if (!body || !["clear", "restore"].includes(String(body.action))) return error("Invalid action.");
  if (body.action === "clear") {
    await prisma.organization.deleteMany({ where: { isDemo: true } });
    return json({ ok: true, message: "Demo data cleared. Log in again to see an empty workspace — or restore the demo from Settings." });
  }
  return json({ ok: true, message: "Restore runs from the server: run `npm run db:seed` in the project folder, then log in again with demo@kirayapro.pk / Demo1234." });
}
