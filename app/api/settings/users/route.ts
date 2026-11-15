import { prisma } from "@/lib/prisma";
import { hashPassword, isValidEmail } from "@/lib/auth";
import { error, json, readBody, requireUser, requirePermission, requirePlanLimit } from "@/lib/api";

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  // Permission check is the gate: OWNER/ADMIN have users.manage by default,
  // and a custom role grants it only if the role includes users.manage.
  const perm = await requirePermission(user, "users.manage");
  if (perm) return perm;
  const limit = await requirePlanLimit(user, "users");
  if (limit) return limit;
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const role = String(body.role ?? "MANAGER");
  if (!isValidEmail(email)) return error("Please enter a valid email.");
  if (password.length < 8) return error("Password must be at least 8 characters.");
  if (!fullName) return error("Full name is required.");
  if (!["ADMIN", "MANAGER", "ACCOUNTANT"].includes(role)) return error("Invalid role.");
  const customRoleId = String(body.customRoleId ?? "").trim() || null;
  if (customRoleId) {
    const cr = await prisma.customRole.findFirst({ where: { id: customRoleId, organizationId: user.organizationId } });
    if (!cr) return error("Custom role not found.", 404);
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return error("An account with this email already exists.", 409);
  const created = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), fullName, role, customRoleId, organizationId: user.organizationId },
  });
  return json({ ok: true, user: { id: created.id, email: created.email, fullName: created.fullName, role: created.role, customRoleId: created.customRoleId } }, 201);
}
