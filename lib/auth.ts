import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "kirayapro_session";
const SESSION_DAYS = 7;

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set.");
  }
  return "dev-only-fallback-secret";
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(`${raw}:${secret()}`).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { tokenHash: hashToken(raw), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    expires: expiresAt,
  });
  return raw;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  customRoleId: string | null;
  organizationId: string;
  orgName: string;
  orgIsDemo: boolean;
  orgPlan: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { include: { organization: true } } },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    customRoleId: u.customRoleId ?? null,
    organizationId: u.organizationId,
    orgName: u.organization.name,
    orgIsDemo: u.organization.isDemo,
    orgPlan: u.organization.plan,
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Roles allowed to do finance (billing, verification, receipts, expenses). */
export const FINANCE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"];
/** Roles allowed to change org settings / manage users. */
export const ADMIN_ROLES = ["OWNER", "ADMIN"];

export function canManageOrg(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}
/**
 * Owner/Admin powers that HONOR custom roles. A user on a custom role gets
 * ONLY that role's permissions (see lib/permissions.ts), so the built-in
 * ADMIN label underneath must not grant admin powers — e.g. an ADMIN given
 * a viewer-only custom role must not change org settings, run the
 * notification engine, or issue/revoke bill links. The OWNER always keeps
 * full access (enforced when assigning roles, too).
 */
export function canManageOrgUser(user: Pick<CurrentUser, "role" | "customRoleId">): boolean {
  if (user.customRoleId && user.role !== "OWNER") return false;
  return canManageOrg(user.role);
}
export function canFinance(role: string): boolean {
  return FINANCE_ROLES.includes(role);
}
