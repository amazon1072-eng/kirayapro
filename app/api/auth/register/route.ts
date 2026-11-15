import { prisma } from "@/lib/prisma";
import { createSession, hashPassword, isValidEmail } from "@/lib/auth";
import { error, json, readBody } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readBody<Record<string, unknown>>(req);
  if (!body) return error("Invalid request.");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.fullName ?? "").trim();
  const orgName = String(body.orgName ?? "").trim();
  if (!isValidEmail(email)) return error("Please enter a valid email.");
  if (password.length < 8) return error("Password must be at least 8 characters.");
  if (!fullName) return error("Please enter your full name.");
  if (!orgName) return error("Please enter your organization name.");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return error("An account with this email already exists.", 409);

  const types = Array.isArray(body.managementTypes)
    ? (body.managementTypes as unknown[]).map(String)
    : body.managementTypes ? [String(body.managementTypes)] : ["Residential"];

  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        managementTypes: JSON.stringify(types),
        city: String(body.city ?? "").trim() || null,
        contactName: fullName,
        contactPhone: String(body.phone ?? "").trim() || null,
        plan: "Starter",
        subscriptionStatus: "trial",
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });
    return tx.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        fullName,
        phone: String(body.phone ?? "").trim() || null,
        role: "OWNER",
        organizationId: org.id,
      },
    });
  });
  await createSession(user.id);
  return json({ ok: true, redirect: "/dashboard" });
}
