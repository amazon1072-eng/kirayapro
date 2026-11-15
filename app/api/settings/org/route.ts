import { prisma } from "@/lib/prisma";
import { canManageOrgUser } from "@/lib/auth";
import { error, json, readBody, requireUser } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (!canManageOrgUser(user)) return error("Only the owner or an admin can change organization settings.", 403);
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const name = String(body.name ?? "").trim();
  if (!name) return error("Organization name is required.");
  const types = Array.isArray(body.managementTypes)
    ? (body.managementTypes as unknown[]).map(String)
    : undefined;
  const org = await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      name,
      city: String(body.city ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null,
      contactName: String(body.contactName ?? "").trim() || null,
      contactPhone: String(body.contactPhone ?? "").trim() || null,
      ...(types ? { managementTypes: JSON.stringify(types) } : {}),
    },
  });
  return json({ ok: true, org });
}
