import { prisma } from "@/lib/prisma";
import { error, json, requireUser, requirePermission } from "@/lib/api";

// GET /api/union/report?unionId= — union fund totals.
// Fund balance = collected union fees − union expenses. Union money never
// touches rent bills or /reports.
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "union.manage");
  if (perm) return perm;
  const unionId = new URL(req.url).searchParams.get("unionId") ?? "";
  if (!unionId) return error("Union is required.");
  const union = await prisma.union.findFirst({ where: { id: unionId, organizationId: user.organizationId } });
  if (!union) return error("Union not found.", 404);
  const [collections, expenses] = await Promise.all([
    prisma.unionFeeCollection.findMany({ where: { unionId, organizationId: user.organizationId } }),
    prisma.unionExpense.findMany({ where: { unionId, organizationId: user.organizationId } }),
  ]);
  const billed = collections.reduce((s, c) => s + c.amount, 0);
  const collected = collections.filter((c) => c.status === "Paid").reduce((s, c) => s + c.amount, 0);
  const pending = billed - collected;
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  return json({
    ok: true,
    report: {
      unionId,
      unionName: union.name,
      feesBilled: billed,
      feesCollected: collected,
      feesPending: pending,
      collectionsCount: collections.length,
      paidCount: collections.filter((c) => c.status === "Paid").length,
      pendingCount: collections.filter((c) => c.status === "Pending").length,
      unionExpenses: totalExpenses,
      expensesCount: expenses.length,
      fundBalance: collected - totalExpenses,
    },
  });
}
