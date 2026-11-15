// KirayaPro Phase 2 — permissions + custom roles.
// Built-in roles keep working exactly as before. A user with a customRoleId
// gets ONLY that role's permissions (the built-in map is NOT merged in).
import { prisma } from "./prisma";
import type { CurrentUser } from "./auth";

export const PERMISSIONS = [
  { key: "bills.view", label: "View bills" },
  { key: "bills.generate", label: "Generate bills" },
  { key: "payments.verify", label: "Verify payments" },
  { key: "tenants.manage", label: "Manage tenants" },
  { key: "properties.manage", label: "Manage properties & units" },
  { key: "maintenance.manage", label: "Manage maintenance" },
  { key: "expenses.manage", label: "Manage expenses" },
  { key: "reports.view", label: "View reports" },
  { key: "settings.manage", label: "Manage organization settings" },
  { key: "users.manage", label: "Manage team members" },
  { key: "union.manage", label: "Manage union module" },
  { key: "notifications.view", label: "View notifications" },
  { key: "reminders.send", label: "Send reminders" },
  // Owner/Admin-only permissions (see RESTRICTED_PERMISSIONS below).
  { key: "bills.delete", label: "Delete a bill" },
  { key: "bills.cancel", label: "Cancel / void a bill" },
  { key: "financial.adjust", label: "Void receipts & adjust ledger" },
  { key: "roles.manage", label: "Manage roles & permissions" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: string[] = PERMISSIONS.map((p) => p.key);

/**
 * Owner/Admin-only permissions. A custom role may NEVER hold these — they
 * are hidden/disabled in the role editor AND rejected by the roles API AND
 * filtered out of a custom role's effective permissions (defense in depth).
 * The set is exactly the permissions no built-in non-owner role holds:
 * MANAGER and ACCOUNTANT never have them.
 */
export const RESTRICTED_PERMISSIONS: string[] = [
  "bills.delete",
  "bills.cancel",
  "financial.adjust",
  "roles.manage",
  "users.manage",
  "settings.manage",
];

export function isRestrictedPermission(key: string): boolean {
  return RESTRICTED_PERMISSIONS.includes(key);
}

/** Built-in role permission map. OWNER/ADMIN = everything. */
export const BUILTIN_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS,
  MANAGER: [
    "bills.view",
    "tenants.manage",
    "properties.manage",
    "maintenance.manage",
    "reports.view",
    "union.manage",
    "notifications.view",
  ],
  // Accountant: generate rent/maintenance/utility bills, manage payment
  // records (verify), issue receipts (via approval), expenses, reports,
  // and send reminders (Phase 3 — reminders.send is grantable, NOT
  // Owner-only, so custom roles may hold it too).
  // Bill deletion/cancellation, financial adjustments and role management
  // stay Owner/Admin-only (see RESTRICTED_PERMISSIONS).
  ACCOUNTANT: [
    "bills.view",
    "bills.generate",
    "payments.verify",
    "expenses.manage",
    "reports.view",
    "notifications.view",
    "reminders.send",
  ],
};

/** Effective permissions for a user: custom role wins if assigned. */
export async function effectivePermissions(
  user: Pick<CurrentUser, "role" | "customRoleId" | "organizationId">,
): Promise<string[]> {
  if (user.customRoleId) {
    const role = await prisma.customRole.findFirst({
      where: { id: user.customRoleId, organizationId: user.organizationId },
    });
    if (role) {
      try {
        const parsed = JSON.parse(role.permissionsJson) as unknown;
        if (Array.isArray(parsed)) {
          // Defense in depth: even if a stored custom role somehow contains
          // an Owner-only permission, it never takes effect.
          return parsed.filter(
            (p): p is string => typeof p === "string" && !isRestrictedPermission(p),
          );
        }
      } catch {
        return [];
      }
    }
    return [];
  }
  return BUILTIN_ROLE_PERMISSIONS[user.role] ?? [];
}

export async function hasPermission(
  user: Pick<CurrentUser, "role" | "customRoleId" | "organizationId">,
  perm: string,
): Promise<boolean> {
  const perms = await effectivePermissions(user);
  return perms.includes(perm);
}
