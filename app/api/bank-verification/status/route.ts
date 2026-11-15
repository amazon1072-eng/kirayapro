import { json, requireUser } from "@/lib/api";
import { getBankVerificationProvider, stubProviderDoc } from "@/lib/bank-verification";

// GET /api/bank-verification/status — honest: no live provider is configured.
// Nothing here ever approves a payment.
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const provider = getBankVerificationProvider();
  return json({
    ok: true,
    provider: provider.name,
    configured: provider.configured,
    future: stubProviderDoc,
    note: "Payments are verified manually. Format checks, duplicate-reference detection and amount warnings run on submission and on the verification page.",
  });
}
