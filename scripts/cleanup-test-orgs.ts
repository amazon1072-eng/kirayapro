import { prisma } from "../lib/prisma";
async function main() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: "test-" } }, select: { organizationId: true } });
  const orgIds = [...new Set(users.map((u) => u.organizationId))];
  for (const id of orgIds) await prisma.organization.delete({ where: { id } });
  console.log("deleted test orgs:", orgIds.length);
}
main().finally(() => prisma.$disconnect());
