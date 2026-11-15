// Render boot: create the SQLite tables, seed the demo org ONLY if it is
// missing (never wipes real orgs, never re-seeds an existing demo), then
// start Next.js on Render's $PORT. Demo data only — no real customer data
// belongs on this free deployment.
import { spawnSync } from "child_process";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`FAILED: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

run("npx", ["prisma", "db", "push"]);
run("npx", ["tsx", "scripts/render-seed-if-needed.ts"]);
run("npx", ["next", "start"]);
