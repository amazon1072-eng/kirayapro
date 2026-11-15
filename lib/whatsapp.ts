// KirayaPro Phase 2 — WhatsApp provider module. Integration-ready, honest.
// Providers:
//  - "manual" (default, free): builds the same wa.me link the bill page
//    already used, logs a WhatsAppMessage row with status "manual", and
//    returns the link for the user to open. No API, no cost, no sending.
//  - "waba": WhatsApp Business Cloud API. Needs a WhatsApp Business
//    account, Meta Business verification, a phone number, an APPROVED
//    utility template (e.g. "kirayapro_bill_due"), and an access token.
//    Without credentials it returns an honest 503 / not_configured —
//    it never pretends a message was sent.
// NEVER send a real message in tests. Use dryRun to validate the payload.
import { prisma } from "./prisma";
import { formatPKR, periodLabel } from "./format";

export type WhatsAppProviderName = "manual" | "waba";

export function whatsappProviderName(): WhatsAppProviderName {
  return process.env.WHATSAPP_PROVIDER === "waba" ? "waba" : "manual";
}

export function whatsappStatus(): { provider: WhatsAppProviderName; configured: boolean; missing: string[] } {
  const provider = whatsappProviderName();
  if (provider === "manual") return { provider, configured: true, missing: [] };
  const missing: string[] = [];
  if (!process.env.WABA_PHONE_NUMBER_ID?.trim()) missing.push("WABA_PHONE_NUMBER_ID");
  if (!process.env.WABA_ACCESS_TOKEN?.trim()) missing.push("WABA_ACCESS_TOKEN");
  return { provider, configured: missing.length === 0, missing };
}

export function waPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").replace(/^0/, "92");
}

export function billMessageText(opts: {
  tenantName: string;
  period: string;
  total: number;
  remaining: number;
  unitLabel: string;
  orgName: string;
  portalUrl?: string | null;
}): string {
  const portal = opts.portalUrl ? ` Pay here: ${opts.portalUrl}` : "";
  return `Assalam-o-Alaikum ${opts.tenantName}, your KirayaPro bill for ${periodLabel(opts.period)} is ${formatPKR(opts.total)} (${opts.unitLabel}). Remaining: ${formatPKR(opts.remaining)}. Please pay and share proof.${portal} — ${opts.orgName}`;
}

export function agreementMessageText(opts: {
  tenantName: string;
  endDateLabel: string;
  orgName: string;
}): string {
  return `Assalam-o-Alaikum ${opts.tenantName}, your rental agreement with ${opts.orgName} ends on ${opts.endDateLabel}. Please contact us to renew it in time. — ${opts.orgName}`;
}

export type SendAgreementResult =
  | { ok: true; provider: "manual"; waLink: string; messageId: string }
  | { ok: true; provider: "waba"; messageId: string; externalId?: string; payload?: unknown }
  | { ok: false; provider: "waba"; error: string; status: number; messageId: string };

/** Phase 3 — agreement-expiry reminder. Same manual/waba pattern as
 * sendBillWhatsApp: manual builds a wa.me link (never claims a send);
 * waba without credentials returns an honest 503 and logs not_configured.
 * Uses template "kirayapro_agreement_expiry" (must be Meta-approved
 * before any real WABA send, same as the bill template). */
export async function sendAgreementWhatsApp(opts: {
  organizationId: string;
  tenant: { id: string; fullName: string; phone: string };
  orgName: string;
  endDateLabel: string;
  dryRun?: boolean;
}): Promise<SendAgreementResult> {
  const phone = opts.tenant.phone;
  const text = agreementMessageText({
    tenantName: opts.tenant.fullName,
    endDateLabel: opts.endDateLabel,
    orgName: opts.orgName,
  });
  const provider = whatsappProviderName();

  if (provider === "manual") {
    const waLink = `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId: opts.organizationId,
        billId: null,
        tenantId: opts.tenant.id,
        phone,
        templateName: null,
        body: text,
        provider: "manual",
        status: "manual",
      },
    });
    return { ok: true, provider: "manual", waLink, messageId: row.id };
  }

  // WABA path.
  const status = whatsappStatus();
  if (!status.configured) {
    const err =
      "WhatsApp Business API is not configured. Add WABA_PHONE_NUMBER_ID and WABA_ACCESS_TOKEN to .env — see PHASE2 report.";
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId: opts.organizationId,
        billId: null,
        tenantId: opts.tenant.id,
        phone,
        templateName: "kirayapro_agreement_expiry",
        body: text,
        provider: "waba",
        status: "not_configured",
        error: err,
      },
    });
    return { ok: false, provider: "waba", error: err, status: 503, messageId: row.id };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: waPhone(phone),
    type: "template",
    template: {
      name: "kirayapro_agreement_expiry",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.tenant.fullName },
            { type: "text", text: opts.endDateLabel },
          ],
        },
      ],
    },
  };

  if (opts.dryRun) {
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId: opts.organizationId,
        billId: null,
        tenantId: opts.tenant.id,
        phone,
        templateName: "kirayapro_agreement_expiry",
        body: text,
        provider: "waba",
        status: "queued",
      },
    });
    return { ok: true, provider: "waba", messageId: row.id, payload };
  }

  const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID!;
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WABA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  const row = await prisma.whatsAppMessage.create({
    data: {
      organizationId: opts.organizationId,
      billId: null,
      tenantId: opts.tenant.id,
      phone,
      templateName: "kirayapro_agreement_expiry",
      body: text,
      provider: "waba",
      status: res.ok ? "sent" : "failed",
      externalId: data.messages?.[0]?.id ?? null,
      error: res.ok ? null : (data.error?.message ?? `Meta API returned ${res.status}`),
    },
  });
  if (!res.ok) {
    return { ok: false, provider: "waba", error: row.error ?? "WhatsApp Business API call failed.", status: 502, messageId: row.id };
  }
  return { ok: true, provider: "waba", messageId: row.id, externalId: data.messages?.[0]?.id };
}

export type SendBillResult =
  | { ok: true; provider: "manual"; waLink: string; messageId: string }
  | { ok: true; provider: "waba"; messageId: string; externalId?: string; payload?: unknown }
  | { ok: false; provider: "waba"; error: string; status: number; messageId: string };

export async function sendBillWhatsApp(opts: {
  organizationId: string;
  bill: { id: string; billingPeriod: string; totalAmount: number };
  tenant: { id: string | null; fullName: string; phone: string } | null;
  unitLabel: string;
  orgName: string;
  remaining: number;
  portalUrl?: string | null;
  baseUrl: string;
  dryRun?: boolean;
  dueDateLabel?: string;
}): Promise<SendBillResult> {
  const phone = opts.tenant?.phone ?? "";
  const text = billMessageText({
    tenantName: opts.tenant?.fullName ?? "Tenant",
    period: opts.bill.billingPeriod,
    total: opts.bill.totalAmount,
    remaining: opts.remaining,
    unitLabel: opts.unitLabel,
    orgName: opts.orgName,
    portalUrl: opts.portalUrl,
  });
  const provider = whatsappProviderName();

  if (provider === "manual") {
    const waLink = `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId: opts.organizationId,
        billId: opts.bill.id,
        tenantId: opts.tenant?.id ?? null,
        phone,
        templateName: null,
        body: text,
        provider: "manual",
        status: "manual",
      },
    });
    return { ok: true, provider: "manual", waLink, messageId: row.id };
  }

  // WABA path.
  const status = whatsappStatus();
  if (!status.configured) {
    const err =
      "WhatsApp Business API is not configured. Add WABA_PHONE_NUMBER_ID and WABA_ACCESS_TOKEN to .env — see PHASE2 report.";
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId: opts.organizationId,
        billId: opts.bill.id,
        tenantId: opts.tenant?.id ?? null,
        phone,
        templateName: "kirayapro_bill_due",
        body: text,
        provider: "waba",
        status: "not_configured",
        error: err,
      },
    });
    return { ok: false, provider: "waba", error: err, status: 503, messageId: row.id };
  }

  const payload = {
    messaging_product: "whatsapp",
    to: waPhone(phone),
    type: "template",
    template: {
      name: "kirayapro_bill_due",
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.tenant?.fullName ?? "Tenant" },
            { type: "text", text: formatPKR(opts.bill.totalAmount) },
            { type: "text", text: opts.dueDateLabel ?? periodLabel(opts.bill.billingPeriod) },
            { type: "text", text: opts.portalUrl ?? opts.baseUrl },
          ],
        },
      ],
    },
  };

  if (opts.dryRun) {
    const row = await prisma.whatsAppMessage.create({
      data: {
        organizationId: opts.organizationId,
        billId: opts.bill.id,
        tenantId: opts.tenant?.id ?? null,
        phone,
        templateName: "kirayapro_bill_due",
        body: text,
        provider: "waba",
        status: "queued",
      },
    });
    return { ok: true, provider: "waba", messageId: row.id, payload };
  }

  const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID!;
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WABA_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  const row = await prisma.whatsAppMessage.create({
    data: {
      organizationId: opts.organizationId,
      billId: opts.bill.id,
      tenantId: opts.tenant?.id ?? null,
      phone,
      templateName: "kirayapro_bill_due",
      body: text,
      provider: "waba",
      status: res.ok ? "sent" : "failed",
      externalId: data.messages?.[0]?.id ?? null,
      error: res.ok ? null : (data.error?.message ?? `Meta API returned ${res.status}`),
    },
  });
  if (!res.ok) {
    return { ok: false, provider: "waba", error: row.error ?? "WhatsApp Business API call failed.", status: 502, messageId: row.id };
  }
  return { ok: true, provider: "waba", messageId: row.id, externalId: data.messages?.[0]?.id };
}
