import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { error, requireUser } from "@/lib/api";

// GET /api/payments/[id]/proof — serves a payment's proof file to a LOGGED-IN
// user of the same organization only. Same path validation as the token-gated
// portal proof route: the file must live under uploads/proofs.
export async function GET(_req: Request, ctx: RouteContext<"/api/payments/[id]/proof">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const payment = await prisma.payment.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!payment || !payment.proofPath) return error("Proof not found.", 404);
  const full = path.join(process.cwd(), payment.proofPath);
  if (!full.startsWith(path.join(process.cwd(), "uploads", "proofs"))) return error("Invalid path.", 400);
  try {
    const data = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    const type = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${payment.proofName ?? "proof"}"` } });
  } catch {
    return error("Proof file missing.", 404);
  }
}
