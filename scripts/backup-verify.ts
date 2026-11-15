// KirayaPro backup/restore verification (read-only).
// Usage: DATABASE_URL="file:/path/to/dev.db" npx tsx /tmp/kp-backup-verify.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [orgs, users, properties, units, tenants, notifications, customRoles] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.property.count(),
      prisma.unit.count(),
      prisma.tenant.count(),
      prisma.notification.count(),
      prisma.customRole.count(),
    ]);
  const billRows = await prisma.bill.findMany({
    select: { id: true, billingPeriod: true, totalAmount: true, status: true },
  });
  const payRows = await prisma.payment.findMany({
    select: { billId: true, amount: true, status: true, receiptNo: true },
  });
  const billed = billRows.reduce((s, b) => s + b.totalAmount, 0);
  const approved = payRows
    .filter((p) => p.status === "Approved")
    .reduce((s, p) => s + p.amount, 0);
  const outstanding = billRows.reduce((s, b) => {
    const paidForBill = payRows
      .filter((p) => p.billId === b.id && p.status === "Approved")
      .reduce((x, p) => x + p.amount, 0);
    return s + Math.max(0, b.totalAmount - paidForBill);
  }, 0);
  // Spot-check one bill in full (items snapshot intact).
  const spot = await prisma.bill.findFirst({
    orderBy: { createdAt: "asc" },
    include: { unit: { select: { unitNo: true } }, tenant: { select: { fullName: true } } },
  });
  console.log(
    JSON.stringify(
      {
        counts: { orgs, users, properties, units, tenants, bills: billRows.length, payments: payRows.length, notifications, customRoles },
        totals: { billed, approved, outstanding },
        spotBill: spot
          ? { period: spot.billingPeriod, unit: spot.unit.unitNo, tenant: spot.tenant?.fullName ?? null, total: spot.totalAmount, status: spot.status, items: JSON.parse(spot.itemsJson).length }
          : null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error("VERIFY FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
