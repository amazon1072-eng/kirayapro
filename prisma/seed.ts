// KirayaPro demo seed — DEMO org only, never mixed with real orgs.
// Demo login: demo@kirayapro.pk / Demo1234
import { prisma } from "../lib/prisma";
import { hashPassword, hashToken } from "../lib/auth";
import { randomBytes } from "crypto";

export const DEMO_EMAIL = "demo@kirayapro.pk";
export const DEMO_PASSWORD = "Demo1234";

function d(offsetDays: number): Date {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
}
function period(offsetMonths: number): string {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  // Wipe previous demo org completely (cascade deletes everything under it).
  const old = await prisma.organization.findFirst({ where: { isDemo: true } });
  if (old) {
    await prisma.organization.delete({ where: { id: old.id } });
    console.log("Cleared old demo org");
  }

  const org = await prisma.organization.create({
    data: {
      name: "KirayaPro Demo Properties",
      managementTypes: JSON.stringify(["Residential", "Commercial", "Market/Union"]),
      city: "Islamabad",
      address: "Demo Office, F-7 Markaz, Islamabad",
      contactName: "Demo Owner",
      contactPhone: "0300-1234567",
      plan: "Professional",
      subscriptionStatus: "active",
      isDemo: true,
    },
  });
  const owner = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      fullName: "Demo Owner",
      phone: "0300-1234567",
      role: "OWNER",
      organizationId: org.id,
    },
  });
  await prisma.user.create({
    data: {
      email: "accountant@kirayapro.pk",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      fullName: "Demo Accountant",
      role: "ACCOUNTANT",
      organizationId: org.id,
    },
  });
  console.log(`Created demo org + ${DEMO_EMAIL}`);

  // --- Org-level default charges (apply everywhere unless overridden) ---
  const orgCharges = [
    { chargeKey: "maintenance", label: "Maintenance Charges", amount: 2000, method: "fixed" },
    { chargeKey: "water", label: "Water Charges", amount: 1000, method: "fixed" },
    { chargeKey: "security", label: "Security Charges", amount: 1500, method: "fixed" },
    { chargeKey: "cleaning", label: "Cleaning Charges", amount: 800, method: "fixed" },
  ];
  for (const c of orgCharges) {
    await prisma.chargeConfig.create({
      data: { organizationId: org.id, scope: "ORG", scopeId: org.id, ...c, enabled: true, frequency: "monthly" },
    });
  }

  // --- Properties ---
  const house = await prisma.property.create({
    data: { organizationId: org.id, name: "Gulberg Residency — House 12", type: "Residential", address: "House 12, Street 5, Gulberg Greens", city: "Islamabad", ownerName: "Demo Owner", floors: 2, isDemo: true },
  });
  const plaza = await prisma.property.create({
    data: { organizationId: org.id, name: "F-7 Markaz Plaza", type: "Commercial", address: "Plot 8, Jinnah Super Market, F-7", city: "Islamabad", ownerName: "Demo Owner", floors: 3, isDemo: true },
  });
  const market = await prisma.property.create({
    data: { organizationId: org.id, name: "Sohan Bazaar Market", type: "Market/Union", address: "Main Sohan Road", city: "Islamabad", ownerName: "Market Union", floors: 1, isDemo: true },
  });

  // Plaza-level: generator charge for shops
  await prisma.chargeConfig.create({
    data: { organizationId: org.id, scope: "PROPERTY", scopeId: plaza.id, propertyId: plaza.id, chargeKey: "generator", label: "Generator Charges", enabled: true, amount: 3000, method: "fixed", frequency: "monthly" },
  });

  // --- Units ---
  const mkUnit = (propertyId: string, unitNo: string, kind: string, floor: number, rent: number, deposit: number) =>
    prisma.unit.create({ data: { organizationId: org.id, propertyId, unitNo, kind, floor, monthlyRent: rent, securityDeposit: deposit, status: "Occupied", isDemo: true } });

  const uHouseA = await mkUnit(house.id, "House 12-A", "House", 0, 85000, 170000);
  const uHouseB = await mkUnit(house.id, "House 12-B", "Flat", 1, 45000, 90000);
  const uHouseC = await mkUnit(house.id, "House 12-C", "Flat", 1, 40000, 80000);
  await prisma.unit.update({ where: { id: uHouseC.id }, data: { status: "Vacant" } });
  const uShop1 = await mkUnit(plaza.id, "Shop 01", "Shop", 0, 60000, 120000);
  const uShop2 = await mkUnit(plaza.id, "Shop 02", "Shop", 0, 55000, 110000);
  const uOffice = await mkUnit(plaza.id, "Office 201", "Office", 2, 120000, 240000);
  const uM1 = await mkUnit(market.id, "Shop M-01", "Shop", 0, 25000, 50000);
  const uM2 = await mkUnit(market.id, "Shop M-02", "Shop", 0, 22000, 44000);
  const uM3 = await mkUnit(market.id, "Shop M-03", "Shop", 0, 28000, 56000);

  // Unit-level override: House 12-A tenant pays electricity DIRECT to the
  // utility — electricity is DISABLED for this unit, so it never appears
  // on their bill. (Org default has no electricity; property-level
  // electricity is enabled for the plaza, but this unit opts out.)
  await prisma.chargeConfig.create({
    data: { organizationId: org.id, scope: "UNIT", scopeId: uHouseA.id, unitId: uHouseA.id, chargeKey: "electricity", label: "Electricity", enabled: false, amount: 0, method: "actual_bill", frequency: "monthly" },
  });
  // Plaza shops: electricity via sub-meter, entered at billing time.
  for (const u of [uShop1, uShop2, uOffice]) {
    await prisma.chargeConfig.create({
      data: { organizationId: org.id, scope: "UNIT", scopeId: u.id, unitId: u.id, chargeKey: "electricity_submeter", label: "Electricity (Sub-meter)", enabled: true, amount: 0, method: "meter", frequency: "monthly" },
    });
  }
  // Market shops: water tanker instead of piped water.
  for (const u of [uM1, uM2, uM3]) {
    await prisma.chargeConfig.create({
      data: { organizationId: org.id, scope: "UNIT", scopeId: u.id, unitId: u.id, chargeKey: "water", label: "Water Charges", enabled: false, amount: 0, method: "fixed", frequency: "monthly" },
    });
    await prisma.chargeConfig.create({
      data: { organizationId: org.id, scope: "UNIT", scopeId: u.id, unitId: u.id, chargeKey: "water_tanker", label: "Water Tanker", enabled: true, amount: 2500, method: "fixed", frequency: "monthly" },
    });
  }

  // --- Tenants ---
  const mkTenant = (fullName: string, phone: string, cnic: string, unitId: string | null, startDaysAgo: number, endDays: number, memberType = "Tenant") =>
    prisma.tenant.create({
      data: { organizationId: org.id, fullName, phone, cnic, unitId, memberType, rentalStart: d(-startDaysAgo), rentalEnd: d(endDays), status: "Active", isDemo: true },
    });
  const t1 = await mkTenant("Ahmed Raza", "0301-1111111", "61101-1234567-1", uHouseA.id, 400, 320);
  const t2 = await mkTenant("Bilal Hussain", "0302-2222222", "61101-7654321-2", uHouseB.id, 200, 160);
  const t3 = await mkTenant("Chaudhry Traders", "0303-3333333", "61101-1112223-3", uShop1.id, 500, 200, "Shopkeeper");
  await mkTenant("Fatima Store", "0304-4444444", "61101-4445556-4", uShop2.id, 300, 60, "Shopkeeper");
  await mkTenant("Usman Ghani", "0305-5555555", "61101-7778889-5", uOffice.id, 150, 540);
  const t6 = await mkTenant("Sohan General Store", "0306-6666666", "61101-9990001-6", uM1.id, 700, 25, "Shopkeeper");
  const t7 = await mkTenant("Malik Cloth House", "0307-7777777", "61101-2223334-7", uM2.id, 90, 640, "Shopkeeper");
  const t8 = await mkTenant("Zara Boutique", "0308-8888888", "61101-5556667-8", uM3.id, 45, 300, "Shopkeeper");

  // --- Last month's bills (snapshot) + payments ---
  // Due date is the 10th of the BILLING period month, so periods and due
  // dates stay consistent. Expense dates are fixed inside the billed month.
  const lastPeriod = period(-1);
  const [lpY, lpM] = lastPeriod.split("-").map(Number);
  const dueDate = new Date(lpY, lpM - 1, 10);
  const inPeriod = (day: number) => new Date(lpY, lpM - 1, day);
  const mkBill = async (unitId: string, tenantId: string, items: { chargeKey: string; label: string; amount: number; method: string }[]) => {
    const total = items.reduce((s, i) => s + i.amount, 0);
    const raw = randomBytes(32).toString("hex");
    return prisma.bill.create({
      data: {
        organizationId: org.id, unitId, tenantId, billingPeriod: lastPeriod,
        itemsJson: JSON.stringify(items), totalAmount: total, status: "Unpaid",
        dueDate, tokenHash: hashToken(raw), tokenExpiresAt: d(30), isDemo: true,
      },
    });
  };
  const b1 = await mkBill(uHouseA.id, t1.id, [
    { chargeKey: "rent", label: "Monthly Rent", amount: 85000, method: "fixed" },
    { chargeKey: "maintenance", label: "Maintenance Charges", amount: 2000, method: "fixed" },
    { chargeKey: "water", label: "Water Charges", amount: 1000, method: "fixed" },
    { chargeKey: "security", label: "Security Charges", amount: 1500, method: "fixed" },
    { chargeKey: "cleaning", label: "Cleaning Charges", amount: 800, method: "fixed" },
  ]); // NOTE: no electricity — disabled for this unit.
  const b2 = await mkBill(uHouseB.id, t2.id, [
    { chargeKey: "rent", label: "Monthly Rent", amount: 45000, method: "fixed" },
    { chargeKey: "maintenance", label: "Maintenance Charges", amount: 2000, method: "fixed" },
    { chargeKey: "water", label: "Water Charges", amount: 1000, method: "fixed" },
    { chargeKey: "security", label: "Security Charges", amount: 1500, method: "fixed" },
    { chargeKey: "cleaning", label: "Cleaning Charges", amount: 800, method: "fixed" },
  ]);
  const b3 = await mkBill(uShop1.id, t3.id, [
    { chargeKey: "rent", label: "Monthly Rent", amount: 60000, method: "fixed" },
    { chargeKey: "maintenance", label: "Maintenance Charges", amount: 2000, method: "fixed" },
    { chargeKey: "electricity_submeter", label: "Electricity (Sub-meter)", amount: 8500, method: "meter" },
    { chargeKey: "generator", label: "Generator Charges", amount: 3000, method: "fixed" },
  ]);
  const b4 = await mkBill(uM1.id, t6.id, [
    { chargeKey: "rent", label: "Monthly Rent", amount: 25000, method: "fixed" },
    { chargeKey: "maintenance", label: "Maintenance Charges", amount: 2000, method: "fixed" },
    { chargeKey: "water_tanker", label: "Water Tanker", amount: 2500, method: "fixed" },
    { chargeKey: "security", label: "Security Charges", amount: 1500, method: "fixed" },
  ]);

  // Receipt numbers are GLOBALLY unique (receiptNo has a unique constraint),
  // so seed numbers are derived from the MAXIMUM existing receipt number —
  // the same approach as the verify API — instead of hard-coded 0001/0002
  // or a count (a count collides when other orgs hold receipts).
  const existingReceipts = await prisma.payment.findMany({ where: { receiptNo: { not: null } }, select: { receiptNo: true } });
  let maxReceipt = 0;
  for (const r of existingReceipts) {
    const m = /^KP-\d{4}-(\d+)$/.exec(r.receiptNo ?? "");
    if (m) maxReceipt = Math.max(maxReceipt, Number(m[1]));
  }
  const receiptNo = (n: number) => `KP-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
  // Approved full payment for b1 -> receipt KP-YYYY-(max+1), bill Paid.
  const receiptNo1 = receiptNo(maxReceipt + 1);
  await prisma.$transaction(async (tx) => {
    const orgRow = await tx.organization.findUnique({ where: { id: org.id } });
    await tx.organization.update({ where: { id: org.id }, data: { receiptCounter: (orgRow?.receiptCounter ?? 0) + 1 } });
    await tx.payment.create({
      data: { organizationId: org.id, billId: b1.id, amount: 90300, method: "Bank transfer", reference: "DEMO-BANK-001", paidDate: d(-10), status: "Approved", receiptNo: receiptNo1, verifiedBy: owner.id, verifiedAt: d(-9), isDemo: true },
    });
    await tx.bill.update({ where: { id: b1.id }, data: { status: "Paid" } });
  });
  // Approved PARTIAL payment for b3 (73,500 total, 40,000 paid -> 33,500 left).
  await prisma.$transaction(async (tx) => {
    const orgRow = await tx.organization.findUnique({ where: { id: org.id } });
    await tx.organization.update({ where: { id: org.id }, data: { receiptCounter: (orgRow?.receiptCounter ?? 0) + 1 } });
    await tx.payment.create({
      data: { organizationId: org.id, billId: b3.id, amount: 40000, method: "JazzCash", reference: "DEMO-JAZZ-002", paidDate: d(-8), status: "Approved", receiptNo: receiptNo(maxReceipt + 2), verifiedBy: owner.id, verifiedAt: d(-7), isDemo: true },
    });
    await tx.bill.update({ where: { id: b3.id }, data: { status: "Partially Paid" } });
  });
  // Rejected payment for b2 (wrong amount / no proof).
  await prisma.payment.create({
    data: { organizationId: org.id, billId: b2.id, amount: 10000, method: "Cash", reference: "DEMO-CASH-003", paidDate: d(-5), status: "Rejected", rejectReason: "Amount does not match the bill and no proof was attached.", internalNotes: "Tenant asked to resubmit with correct amount.", isDemo: true },
  });
  // Pending submission for b4.
  await prisma.payment.create({
    data: { organizationId: org.id, billId: b4.id, amount: 31000, method: "Easypaisa", reference: "DEMO-EASY-004", paidDate: d(-1), status: "Pending", isDemo: true },
  });

  // --- Maintenance + expenses ---
  const m1 = await prisma.maintenanceRequest.create({
    data: { organizationId: org.id, propertyId: plaza.id, unitId: uShop1.id, title: "Leaking water pipe in Shop 01", category: "Plumbing", priority: "High", assignedStaff: "Rashid Plumber", status: "In Progress", description: "Pipe leaking near the back wall.", costEstimate: 8000, isDemo: true },
  });
  await prisma.maintenanceRequest.create({
    data: { organizationId: org.id, propertyId: house.id, unitId: uHouseB.id, title: "Fan not working in bedroom", category: "Electrical", priority: "Medium", assignedStaff: "Imran Electrician", status: "Assigned", description: "Ceiling fan stopped working.", isDemo: true },
  });
  await prisma.maintenanceRequest.create({
    data: { organizationId: org.id, propertyId: market.id, title: "Market gate repaint", category: "Painting", priority: "Low", status: "Completed", description: "Repaint main entrance gate.", isDemo: true },
  });
  await prisma.expense.create({
    data: { organizationId: org.id, maintenanceId: m1.id, propertyId: plaza.id, category: "Maintenance", description: "Plumbing parts for Shop 01 pipe repair", amount: 4500, vendor: "Rashid Plumber", spentDate: inPeriod(5), isDemo: true },
  });
  await prisma.expense.create({
    data: { organizationId: org.id, propertyId: house.id, category: "Cleaning", description: "Monthly deep cleaning — Gulberg Residency", amount: 12000, vendor: "CleanCare Services", spentDate: inPeriod(12), isDemo: true },
  });
  await prisma.expense.create({
    data: { organizationId: org.id, propertyId: plaza.id, category: "Security", description: "Security guard salary — F-7 Plaza (Oct)", amount: 35000, vendor: "SecureGuard Pvt Ltd", spentDate: inPeriod(20), isDemo: true },
  });

  // --- Phase 2: Union (separate from rent bills — demo rent numbers unchanged) ---
  const union = await prisma.union.create({
    data: {
      organizationId: org.id,
      name: "Sohan Bazaar Market Union",
      presidentName: "Haji Saleem",
      presidentPhone: "0300-9998888",
      address: "Main Sohan Road",
      city: "Islamabad",
    },
  });
  const um1 = await prisma.unionMember.create({
    data: { unionId: union.id, organizationId: org.id, membershipNo: "M-001", fullName: "Sohan General Store", phone: "0306-6666666", unitId: uM1.id, tenantId: t6.id, status: "Active", joinedDate: d(-700) },
  });
  const um2 = await prisma.unionMember.create({
    data: { unionId: union.id, organizationId: org.id, membershipNo: "M-002", fullName: "Malik Cloth House", phone: "0307-7777777", unitId: uM2.id, tenantId: t7.id, status: "Active", joinedDate: d(-90) },
  });
  const um3 = await prisma.unionMember.create({
    data: { unionId: union.id, organizationId: org.id, membershipNo: "M-003", fullName: "Zara Boutique", phone: "0308-8888888", unitId: uM3.id, tenantId: t8.id, status: "Active", joinedDate: d(-45) },
  });
  await prisma.unionFee.create({
    data: { unionId: union.id, organizationId: org.id, label: "Monthly membership fee", amount: 2000, period: "monthly", active: true },
  });
  // Oct 2026 collections: 2 paid, 1 pending.
  await prisma.unionFeeCollection.create({
    data: { unionId: union.id, memberId: um1.id, organizationId: org.id, billingPeriod: lastPeriod, amount: 2000, status: "Paid", paidDate: inPeriod(10), method: "Cash" },
  });
  await prisma.unionFeeCollection.create({
    data: { unionId: union.id, memberId: um2.id, organizationId: org.id, billingPeriod: lastPeriod, amount: 2000, status: "Paid", paidDate: inPeriod(12), method: "JazzCash", reference: "DEMO-UNION-002" },
  });
  await prisma.unionFeeCollection.create({
    data: { unionId: union.id, memberId: um3.id, organizationId: org.id, billingPeriod: lastPeriod, amount: 2000, status: "Pending" },
  });
  await prisma.unionExpense.create({
    data: { unionId: union.id, organizationId: org.id, category: "Cleaning", description: "Market cleaning — Sohan Bazaar", amount: 8000, vendor: "CleanCare Services", spentDate: inPeriod(15) },
  });

  console.log("Demo seed done. Login:", DEMO_EMAIL, "/", DEMO_PASSWORD);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
