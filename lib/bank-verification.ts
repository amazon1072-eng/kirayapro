// KirayaPro Phase 2 — bank verification HOOKS. Honest by design.
// There is NO live bank/JazzCash/Easypaisa verification here: no merchant
// account, no API credentials. This module does format checks, duplicate
// reference detection and amount-matching warnings, and exposes a provider
// interface for a future real integration. NOTHING in this module ever
// changes a payment status — approval stays manual via /api/payments/[id]/verify.
import { prisma } from "./prisma";

export type BankVerificationStatus = "not_configured" | "verified" | "rejected" | "manual_review";

export interface BankVerificationProvider {
  name: string;
  configured: boolean;
  verify(payment: { id: string; amount: number; method: string; reference: string | null }): Promise<{
    status: BankVerificationStatus;
    detail: string;
  }>;
}

/** Default provider: no merchant account configured. */
export const noneProvider: BankVerificationProvider = {
  name: "none",
  configured: false,
  async verify() {
    return {
      status: "not_configured",
      detail:
        "No bank verification provider is configured. A real check needs a merchant account with JazzCash / Easypaisa / your bank, API credentials, and the owner's approval. Until then every payment is verified manually.",
    };
  },
};

/**
 * Documented stub for a future JazzCash / Easypaisa / bank merchant API.
 * To wire a real provider: implement BankVerificationProvider, call the
 * merchant API with the payment's method/reference/amount, and return
 * verified / rejected / manual_review. Never auto-approve from here —
 * return manual_review and let an admin approve via the verify API.
 */
export const stubProviderDoc = {
  name: "jazzcash-easypaisa-bank (stub — NOT connected)",
  needs: [
    "Merchant account with JazzCash / Easypaisa / bank",
    "API credentials (merchant ID + API key / client secret) in .env",
    "Owner approval to enable live verification",
  ],
};

export function getBankVerificationProvider(): BankVerificationProvider {
  // No provider is configured in this build. This is the single place a
  // future provider is selected (e.g. by env BANK_VERIFICATION_PROVIDER).
  return noneProvider;
}

/** Format checks for a transaction reference. Returns warnings (never blocks). */
export function validateReference(method: string, reference: string | null | undefined): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const ref = (reference ?? "").trim();
  const m = (method ?? "").toLowerCase();
  if (!ref) {
    if (m === "cash") return { ok: true, warnings: [] };
    warnings.push("No transaction reference given — ask the tenant for the transaction ID.");
    return { ok: false, warnings };
  }
  if (m === "jazzcash" || m === "easypaisa") {
    const isTxnId = /^[A-Za-z0-9-]{8,}$/.test(ref);
    const isMobile = /^03\d{9}$/.test(ref.replace(/[^0-9]/g, "")) || /^92\d{10}$/.test(ref.replace(/[^0-9]/g, ""));
    if (!isTxnId && !isMobile) {
      warnings.push("Reference does not look like a JazzCash/Easypaisa transaction ID (8+ letters/digits) or a Pakistani mobile number.");
    }
  } else if (m === "bank transfer") {
    if (!/^[A-Za-z0-9-]{6,}$/.test(ref)) {
      warnings.push("Bank reference should be at least 6 letters/digits.");
    }
  }
  return { ok: warnings.length === 0, warnings };
}

/** Duplicate reference check: same (method, reference) on a DIFFERENT bill in the same org. */
export async function findDuplicateReference(
  organizationId: string,
  billId: string,
  method: string,
  reference: string,
): Promise<{ id: string; billId: string } | null> {
  const ref = reference.trim();
  if (!ref) return null;
  const other = await prisma.payment.findFirst({
    where: { organizationId, method, reference: ref, billId: { not: billId } },
    select: { id: true, billId: true },
  });
  return other;
}

/** Full warning computation for a payment, given the bill's approved-paid sum. */
export function paymentWarningsWithBill(payment: {
  amount: number;
  method: string;
  reference: string | null;
  bill: { totalAmount: number; itemsJson: string };
}, approvedPaid: number): string[] {
  const warnings: string[] = [];
  const remaining = Math.max(0, payment.bill.totalAmount - approvedPaid);
  if (payment.amount > remaining) {
    warnings.push(`Amount (Rs. ${payment.amount.toLocaleString("en-PK")}) is more than the remaining balance (Rs. ${remaining.toLocaleString("en-PK")}).`);
  }
  if (payment.amount !== remaining) {
    let items: { amount: number }[] = [];
    try {
      items = JSON.parse(payment.bill.itemsJson) as { amount: number }[];
    } catch {
      items = [];
    }
    const matchesCharge = items.some((i) => i.amount === payment.amount);
    if (!matchesCharge) {
      warnings.push(`Amount (Rs. ${payment.amount.toLocaleString("en-PK")}) does not match the remaining balance or any single charge on this bill — check with the tenant before approving.`);
    }
  }
  warnings.push(...validateReference(payment.method, payment.reference).warnings);
  return warnings;
}
