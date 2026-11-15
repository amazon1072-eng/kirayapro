import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { checkLimit, checkModuleGate } from "@/lib/plans";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function requireUser(): Promise<CurrentUser | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return error("Please log in first.", 401);
  return user;
}

/** Returns a 403 Response when the user lacks the permission, else null. */
export async function requirePermission(user: CurrentUser, perm: string): Promise<NextResponse | null> {
  const ok = await hasPermission(user, perm);
  if (!ok) return error(`You do not have permission to do this (${perm}).`, 403);
  return null;
}

/** Returns a 403 Response when the org is at its plan count limit, else null. */
export async function requirePlanLimit(
  user: CurrentUser,
  kind: "properties" | "units" | "users",
): Promise<NextResponse | null> {
  const msg = await checkLimit(user.organizationId, user.orgPlan, kind);
  if (msg) return error(msg, 403);
  return null;
}

/** Returns a 403 Response when the plan does not include the module, else null. */
export function requireModuleGate(user: CurrentUser, kind: "union" | "customRoles"): NextResponse | null {
  const msg = checkModuleGate(user.orgPlan, kind);
  if (msg) return error(msg, 403);
  return null;
}

export async function readBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

export function toPositiveInt(value: unknown): number | null {
  const n = toInt(value, -1);
  return n > 0 ? n : null;
}
