import { prisma } from "@/lib/prisma";
import { createSession, isValidEmail, verifyPassword } from "@/lib/auth";
import { error, json, readBody } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readBody<{ email?: unknown; password?: unknown }>(req);
  if (!body) return error("Invalid request.");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!isValidEmail(email) || !password) return error("Please enter your email and password.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return error("No account found with this email.", 401);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return error("Wrong password. Please try again.", 401);
  await createSession(user.id);
  return json({ ok: true, redirect: "/dashboard" });
}
