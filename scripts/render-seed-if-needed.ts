// Seed the demo org only when none exists (fresh Render disk or wiped DB).
// The seed itself wipes + recreates ONLY the demo org; real orgs are untouched.
import { prisma } from "../lib/prisma";
import { spawnSync } from "child_process";

async function main() {
  const count = await prisma.organization.count({ where: { isDemo: true } });
  console.log(`Demo orgs in DB: ${count}`);
  if (count === 0) {
    console.log("No demo org found — seeding demo data...");
    const r = spawnSync("npm", ["run", "db:seed"], { stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status ?? 1);
  } else {
    console.log("Demo org already present — skipping seed.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
