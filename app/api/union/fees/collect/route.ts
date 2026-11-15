import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission } from "@/lib/api";

// GET /api/union/fees/collect?unionId=&period= — list collections.
// POST /api/union/fees/collect { collectionId, method, reference, paidDate } — mark Paid.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const sp = new URL(req.url).searchParams;
  const unionId = sp.get("unionId") ?? "";
  const period = sp.get("period") ?? "";
  const collections = await prisma.unionFeeCollection.findMany({
    where: {
      organizationId: user.organizationId,
      ...(unionId ? { unionId } : {}),
      ...(period ? { billingPeriod: period } : {}),
    },
    orderBy: [{ billingPeriod: "desc" }, { createdAt: "asc" }],
    include: { member: true },
  });
  return json({ ok: true, collections });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const collectionId = String(body.collectionId ?? "");
  const method = String(body.method ?? "").trim();
  if (!collectionId) return error("Collection is required.");
  const col = await prisma.unionFeeCollection.findFirst({ where: { id: collectionId, organizationId: user.organizationId } });
  if (!col) return error("Fee record not found.", 404);
  if (col.status === "Paid") return error("This fee was already collected.", 409);
  const updated = await prisma.unionFeeCollection.update({
    where: { id: collectionId },
    data: {
      status: "Paid",
      paidDate: body.paidDate ? new Date(String(body.paidDate)) : new Date(),
      method: method || "Cash",
      reference: String(body.reference ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
    },
  });
  return json({ ok: true, collection: updated });
}
