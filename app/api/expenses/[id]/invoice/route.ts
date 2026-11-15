import { randomBytes } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { error, requireUser } from "@/lib/api";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/expenses/[id]/invoice — upload an invoice (image/PDF, max 5MB).
export async function POST(req: Request, ctx: RouteContext<"/api/expenses/[id]/invoice">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const expense = await prisma.expense.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!expense) return error("Expense not found.", 404);
  const form = await req.formData();
  const file = form.get("invoice");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) return error("Please choose an invoice file.");
  const f = file as File;
  if (f.size === 0) return error("Please choose an invoice file.");
  if (f.size > MAX_BYTES) return error("Invoice file must be under 5 MB.");
  if (!ALLOWED.has(f.type)) return error("Invoice must be an image (PNG/JPG/WebP) or a PDF.");
  const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "invoice";
  const filename = `${randomBytes(8).toString("hex")}-${safe}`;
  const dir = path.join(process.cwd(), "uploads", "invoices");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await f.arrayBuffer()));
  const updated = await prisma.expense.update({
    where: { id },
    data: { invoicePath: `uploads/invoices/${filename}`, invoiceName: f.name },
  });
  return Response.json({ ok: true, expense: { id: updated.id, invoicePath: updated.invoicePath, invoiceName: updated.invoiceName } }, { status: 201 });
}

// GET /api/expenses/[id]/invoice — serve the invoice to a same-org session.
export async function GET(_req: Request, ctx: RouteContext<"/api/expenses/[id]/invoice">) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const expense = await prisma.expense.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!expense || !expense.invoicePath) return error("Invoice not found.", 404);
  const full = path.join(process.cwd(), expense.invoicePath);
  if (!full.startsWith(path.join(process.cwd(), "uploads", "invoices"))) return error("Invalid path.", 400);
  try {
    const data = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    const type = ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${expense.invoiceName ?? "invoice"}"` } });
  } catch {
    return error("Invoice file missing.", 404);
  }
}
