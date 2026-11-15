import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, requirePermission, toInt } from "@/lib/api";

// GET /api/union/expenses?unionId= — union expenses (SEPARATE from property Expense).
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const unionId = new URL(req.url).searchParams.get("unionId") ?? "";
  const expenses = await prisma.unionExpense.findMany({
    where: { organizationId: user.organizationId, ...(unionId ? { unionId } : {}) },
    orderBy: { spentDate: "desc" },
  });
  return json({ ok: true, expenses });
}

// POST /api/union/expenses — record a union expense.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const unionId = String(body.unionId ?? "");
  const description = String(body.description ?? "").trim();
  const amount = toInt(body.amount, -1);
  if (!unionId) return error("Union is required.");
  if (!description) return error("Description is required.");
  if (amount <= 0) return error("Amount must be more than zero.");
  const union = await prisma.union.findFirst({ where: { id: unionId, organizationId: user.organizationId } });
  if (!union) return error("Union not found.", 404);
  const expense = await prisma.unionExpense.create({
    data: {
      unionId,
      organizationId: user.organizationId,
      category: String(body.category ?? "Other"),
      description,
      amount,
      vendor: String(body.vendor ?? "").trim() || null,
      spentDate: body.spentDate ? new Date(String(body.spentDate)) : new Date(),
    },
  });
  return json({ ok: true, expense }, 201);
}
