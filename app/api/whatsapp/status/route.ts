import { json, requireUser } from "@/lib/api";
import { whatsappStatus } from "@/lib/whatsapp";

// GET /api/whatsapp/status — which provider is active and what is missing.
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return json({ ok: true, ...whatsappStatus() });
}
