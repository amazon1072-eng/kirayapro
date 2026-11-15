import { prisma } from "@/lib/prisma";
import { error, json, readBody, requireUser, toInt, requirePermission } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "expenses.manage");
  if (perm) return perm;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const description = String(body.description ?? "").trim();
  const amount = toInt(body.amount, -1);
  if (!description) return error("Description is required.");
  if (amount <= 0) return error("Amount must be more than zero.");
  const propertyId = String(body.propertyId ?? "").trim() || null;
  const maintenanceId = String(body.maintenanceId ?? "").trim() || null;
  if (propertyId) {
    const p = await prisma.property.findFirst({ where: { id: propertyId, organizationId: user.organizationId } });
    if (!p) return error("Property not found.", 404);
  }
  if (maintenanceId) {
    const m = await prisma.maintenanceRequest.findFirst({ where: { id: maintenanceId, organizationId: user.organizationId } });
    if (!m) return error("Maintenance request not found.", 404);
  }
  const expense = await prisma.expense.create({
    data: {
      organizationId: user.organizationId,
      maintenanceId,
      propertyId,
      category: String(body.category ?? "Other"),
      description,
      amount,
      vendor: String(body.vendor ?? "").trim() || null,
      spentDate: body.spentDate ? new Date(String(body.spentDate)) : new Date(),
    },
  });
  return json({ ok: true, expense }, 201);
}
