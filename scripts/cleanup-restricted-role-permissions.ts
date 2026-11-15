// One-time cleanup (permission refinement, Nov 2026): strip Owner-only
// permissions from any existing custom role. The roles API now refuses to
// grant them and effectivePermissions() filters them at read time, so this
// is belt-and-braces — run with: npx tsx scripts/cleanup-restricted-role-permissions.ts
import { prisma } from "../lib/prisma";
import { RESTRICTED_PERMISSIONS } from "../lib/permissions";

async function main() {
  const roles = await prisma.customRole.findMany();
  let cleaned = 0;
  for (const role of roles) {
    let perms: string[] = [];
    try {
      const parsed = JSON.parse(role.permissionsJson) as unknown;
      if (Array.isArray(parsed)) perms = parsed.filter((p): p is string => typeof p === "string");
    } catch {
      perms = [];
    }
    const stripped = perms.filter((p) => RESTRICTED_PERMISSIONS.includes(p));
    if (stripped.length > 0) {
      const kept = perms.filter((p) => !RESTRICTED_PERMISSIONS.includes(p));
      await prisma.customRole.update({ where: { id: role.id }, data: { permissionsJson: JSON.stringify(kept) } });
      console.log(`Cleaned role "${role.name}" (${role.id}): removed ${stripped.join(", ")}`);
      cleaned++;
    }
  }
  console.log(`Done. ${roles.length} custom role(s) checked, ${cleaned} cleaned.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
