import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { error } from "@/lib/api";

// GET /api/portal/[token]/proof/[paymentId] — serves the proof file ONLY
// when the caller presents the same valid bill token.
export async function GET(_req: Request, ctx: RouteContext<"/api/portal/[token]/proof/[paymentId]">) {
  const { token, paymentId } = await ctx.params;
  const bill = await prisma.bill.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!bill || bill.tokenRevoked || (bill.tokenExpiresAt && bill.tokenExpiresAt <= new Date())) {
    return error("Invalid or expired link.", 404);
  }
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, billId: bill.id } });
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
