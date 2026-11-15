import { randomBytes } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth";
import { error, json, toInt } from "@/lib/api";
import { validateReference, findDuplicateReference } from "@/lib/bank-verification";
import { createNotification } from "@/lib/notifications";

// GET /api/portal/[token] — public: only THIS bill is visible, never a list.
export async function GET(_req: Request, ctx: RouteContext<"/api/portal/[token]">) {
  const { token } = await ctx.params;
  const bill = await prisma.bill.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { unit: { include: { property: true } }, tenant: true, payments: { orderBy: { createdAt: "desc" } } },
  });
  if (!bill || bill.tokenRevoked || (bill.tokenExpiresAt && bill.tokenExpiresAt <= new Date())) {
    return error("This payment link is invalid, expired or revoked.", 404);
  }
  const approved = bill.payments.filter((p) => p.status === "Approved").reduce((s, p) => s + p.amount, 0);
  return json({
    ok: true,
    bill: {
      id: bill.id,
      billingPeriod: bill.billingPeriod,
      items: JSON.parse(bill.itemsJson),
      totalAmount: bill.totalAmount,
      status: bill.status,
      dueDate: bill.dueDate,
      unitLabel: `${bill.unit.property.name} — ${bill.unit.unitNo}`,
      tenantName: bill.tenant?.fullName ?? "Tenant",
      approvedPaid: approved,
      remaining: Math.max(0, bill.totalAmount - approved),
      payments: bill.payments.map((p) => ({
        id: p.id, amount: p.amount, method: p.method, reference: p.reference,
        paidDate: p.paidDate, status: p.status, receiptNo: p.receiptNo,
        rejectReason: p.rejectReason, hasProof: !!p.proofPath,
      })),
    },
  });
}

// POST /api/portal/[token] — tenant submits a payment + proof (multipart).
export async function POST(req: Request, ctx: RouteContext<"/api/portal/[token]">) {
  const { token } = await ctx.params;
  const bill = await prisma.bill.findUnique({ where: { tokenHash: hashToken(token) }, include: { payments: true } });
  if (!bill || bill.tokenRevoked || (bill.tokenExpiresAt && bill.tokenExpiresAt <= new Date())) {
    return error("This payment link is invalid, expired or revoked.", 404);
  }
  const form = await req.formData();
  const amount = toInt(form.get("amount"), -1);
  const method = String(form.get("method") ?? "").trim();
  const reference = String(form.get("reference") ?? "").trim();
  if (amount <= 0) return error("Please enter the amount you paid.");
  if (!method) return error("Please choose a payment method.");
  if (!reference) return error("Please enter the transaction reference.");
  // B-3 fix: refuse payments on a fully-paid bill, and refuse any amount
  // above the remaining balance (approved payments only — same definition
  // the portal shows as "remaining").
  const approvedPaid = bill.payments.filter((p) => p.status === "Approved").reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, bill.totalAmount - approvedPaid);
  if (bill.status === "Paid" || remaining <= 0) return error("This bill is already fully paid.", 409);
  if (amount > remaining) return error(`Amount exceeds the remaining balance of Rs. ${remaining.toLocaleString("en-PK")}.`, 409);
  // Duplicate guard: same bill + reference + amount already submitted.
  const dup = await prisma.payment.findUnique({
    where: { billId_reference_amount: { billId: bill.id, reference, amount } },
  });
  if (dup) return error("This payment was already submitted (same reference and amount).", 409);
  // Duplicate reference across the org: same (method, reference) used on a
  // DIFFERENT bill — refused (bank verification hook, Phase 2).
  const dupRef = await findDuplicateReference(bill.organizationId, bill.id, method, reference);
  if (dupRef) return error("This transaction reference was already used for another bill.", 409);
  // Format warning only — a badly formatted reference is NOT blocked here;
  // it is flagged to the admin on the verification page.
  const refCheck = validateReference(method, reference);
  const warnings = refCheck.warnings;

  let proofPath: string | null = null;
  let proofName: string | null = null;
  const file = form.get("proof");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > 0) {
      if (f.size > 10 * 1024 * 1024) return error("Proof file must be under 10 MB.");
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "proof";
      const filename = `${randomBytes(8).toString("hex")}-${safe}`;
      const dir = path.join(process.cwd(), "uploads", "proofs");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), Buffer.from(await f.arrayBuffer()));
      proofPath = `uploads/proofs/${filename}`;
      proofName = f.name;
    }
  }

  const payment = await prisma.payment.create({
    data: {
      organizationId: bill.organizationId,
      billId: bill.id,
      amount,
      method,
      reference,
      paidDate: form.get("paidDate") ? new Date(String(form.get("paidDate"))) : new Date(),
      proofPath,
      proofName,
      status: "Pending",
    },
  });
  const tenant = await prisma.tenant.findUnique({ where: { id: bill.tenantId ?? "" } });
  await createNotification({
    organizationId: bill.organizationId,
    type: "payment_submitted",
    title: `Payment submitted — Rs. ${amount.toLocaleString("en-PK")} (${method})`,
    body: `${tenant?.fullName ?? "Tenant"} submitted Rs. ${amount.toLocaleString("en-PK")} for bill ${bill.billingPeriod}. Awaiting verification.`,
    link: "/payments",
    relatedId: payment.id,
    dedupKey: `payment_submitted:${payment.id}`,
  });
  return json({ ok: true, paymentId: payment.id, message: "Payment submitted for verification.", warnings }, 201);
}
