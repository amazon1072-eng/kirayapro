// KirayaPro Phase 2 — hard plan limits (single source of truth).
// Trial: 14 days from org creation. Limits are ENFORCED server-side in the
// APIs (see lib/api.ts requirePlanLimit); the Settings page only displays.
import { prisma } from "./prisma";

export type PlanName = "Starter" | "Professional" | "Business" | "Enterprise";

export type PlanLimits = {
  properties: number; // Infinity = unlimited
  units: number;
  users: number;
  union: boolean;
  customRoles: boolean;
};

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  Starter: { properties: 3, units: 30, users: 5, union: false, customRoles: false },
  Professional: { properties: 10, units: 150, users: 15, union: true, customRoles: false },
  Business: { properties: 30, units: 500, users: 50, union: true, customRoles: true },
  Enterprise: { properties: Infinity, units: Infinity, users: Infinity, union: true, customRoles: true },
};

export const TRIAL_DAYS = 14;

export function planNameOf(plan: string): PlanName {
  return (["Starter", "Professional", "Business", "Enterprise"].includes(plan)
    ? plan
    : "Starter") as PlanName;
}

export function planLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[planNameOf(plan)];
}

export function trialEndFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Trial display info for an org (computed outside React components). */
export function trialStatus(org: { subscriptionStatus: string; trialEndsAt: Date | null; createdAt: Date }): {
  trialEnd: Date;
  trialActive: boolean;
  trialDaysLeft: number;
} {
  const trialEnd = org.trialEndsAt ?? trialEndFor(org.createdAt);
  const now = Date.now();
  return {
    trialEnd,
    trialActive: org.subscriptionStatus === "trial" && trialEnd.getTime() > now,
    trialDaysLeft: Math.max(0, Math.ceil((trialEnd.getTime() - now) / (24 * 60 * 60 * 1000))),
  };
}

export function fmtLimit(n: number): string {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}

export async function orgUsage(organizationId: string) {
  const [properties, units, users] = await Promise.all([
    prisma.property.count({ where: { organizationId } }),
    prisma.unit.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
  ]);
  return { properties, units, users };
}

/** Check a count limit. Returns an error message when the limit is hit, else null. */
export async function checkLimit(
  organizationId: string,
  plan: string,
  kind: "properties" | "units" | "users",
): Promise<string | null> {
  const limits = planLimits(plan);
  const limit = limits[kind];
  if (!Number.isFinite(limit)) return null;
  const usage = await orgUsage(organizationId);
  if (usage[kind] >= limit) {
    const label = kind === "properties" ? "properties" : kind === "units" ? "units" : "team members";
    return `${planNameOf(plan)} plan allows ${limit} ${label}. Upgrade to add more.`;
  }
  return null;
}

/** Check a module gate (union / customRoles). Returns an error message when not allowed. */
export function checkModuleGate(plan: string, kind: "union" | "customRoles"): string | null {
  const limits = planLimits(plan);
  if (limits[kind]) return null;
  const label = kind === "union" ? "Union module" : "Custom roles";
  const need = kind === "union" ? "Professional" : "Business";
  return `${label} is not included in the ${planNameOf(plan)} plan. Upgrade to ${need} or higher to use it.`;
}
