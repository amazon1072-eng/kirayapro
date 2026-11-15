import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashToken, canManageOrgUser } from "@/lib/auth";
import { error, json, requireUser } from "@/lib/api";

// POST /api/bills/[id]/reissue — issue a FRESH portal token and return the
// full link once. Old token stops working. (Tokens are stored hashed, so
// a link can only be shown at the moment it is created/re-issued.)
export async function POST(req: Request, ctx: RouteContext<"/api/bills/[id]/reissue">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!canManageOrgUser(user)) return error("Only the owner or an admin can issue a payment link.", 403);
  const { id } = await ctx.params;
  const bill = await prisma.bill.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!bill) return error("Bill not found.", 404);
  const raw = randomBytes(32).toString("hex");
  await prisma.bill.update({
    where: { id },
    data: {
      tokenHash: hashToken(raw),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      tokenRevoked: false,
    },
  });
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  return json({ ok: true, portalUrl: `${base}/pay/${raw}`, message: "New payment link issued (valid 30 days)." });
}
