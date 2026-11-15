// KirayaPro Phase 2 — daily notification sweep.
// Loops every org and runs the notifications engine (dedupKey prevents
// duplicates). Run daily, e.g.:
//   0 8 * * * cd ~/workspace/kirayapro && npm run notifications
import { prisma } from "../lib/prisma";
import { generateNotifications } from "../lib/notifications";

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    const res = await generateNotifications(org.id);
    console.log(`${org.name}: ${res.created} new, ${res.skipped} already existed.`);
  }
  console.log(`Done — ${orgs.length} org(s) scanned.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
