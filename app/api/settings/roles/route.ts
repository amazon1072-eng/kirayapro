import { prisma } from "@/lib/prisma";
import { PERMISSIONS, RESTRICTED_PERMISSIONS } from "@/lib/permissions";
import { error, json, readBody, requireUser, requirePermission, requireModuleGate } from "@/lib/api";

// GET /api/settings/roles — list custom roles for the org (+ permission catalogue).
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const roles = await prisma.customRole.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true } } },
  });
  return json({
    ok: true,
    roles: roles.map((r) => ({ id: r.id, name: r.name, permissions: JSON.parse(r.permissionsJson) as string[], users: r._count.users })),
    permissions: PERMISSIONS.map((p) => ({ ...p, restricted: RESTRICTED_PERMISSIONS.includes(p.key) })),
  });
}

/** Refuse when a custom role is given Owner-only permissions (403). */
function restrictedRequested(permissions: string[]): string[] {
  return permissions.filter((p) => RESTRICTED_PERMISSIONS.includes(p));
}

// POST /api/settings/roles { name, permissions[] } — create a custom role.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "roles.manage");
  if (perm) return perm;
  const gate = requireModuleGate(user, "customRoles");
  if (gate) return gate;
  const body = await readBody<{ name?: string; permissions?: string[] }>(req);
  if (!body) return error("Invalid request.");
  const name = String(body.name ?? "").trim();
  if (!name) return error("Role name is required.");
  const valid = new Set<string>(PERMISSIONS.map((p) => p.key));
  const permissions = Array.isArray(body.permissions) ? body.permissions.filter((p) => valid.has(p)) : [];
  const blocked = restrictedRequested(permissions);
  if (blocked.length > 0) {
    return error(
      `These permissions are Owner-only and cannot be given to a custom role: ${blocked.join(", ")}.`,
      403,
    );
  }
  const existing = await prisma.customRole.findFirst({ where: { organizationId: user.organizationId, name } });
  if (existing) return error(`A role named "${name}" already exists.`, 409);
  const role = await prisma.customRole.create({
    data: { organizationId: user.organizationId, name, permissionsJson: JSON.stringify(permissions) },
  });
  return json({ ok: true, role: { id: role.id, name: role.name, permissions } }, 201);
}

// PATCH /api/settings/roles { id, name?, permissions? } — edit a custom role.
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "roles.manage");
  if (perm) return perm;
  const body = await readBody<{ id?: string; name?: string; permissions?: string[] }>(req);
  if (!body) return error("Invalid request.");
  const id = String(body.id ?? "");
  const existing = await prisma.customRole.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!existing) return error("Role not found.", 404);
  const valid = new Set<string>(PERMISSIONS.map((p) => p.key));
  let permissions: string[] | undefined;
  if (Array.isArray(body.permissions)) {
    permissions = body.permissions.filter((p) => valid.has(p));
    const blocked = restrictedRequested(permissions);
    if (blocked.length > 0) {
      return error(
        `These permissions are Owner-only and cannot be given to a custom role: ${blocked.join(", ")}.`,
        403,
      );
    }
  }
  const role = await prisma.customRole.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(permissions !== undefined ? { permissionsJson: JSON.stringify(permissions) } : {}),
    },
  });
  return json({ ok: true, role: { id: role.id, name: role.name, permissions: JSON.parse(role.permissionsJson) as string[] } });
}
