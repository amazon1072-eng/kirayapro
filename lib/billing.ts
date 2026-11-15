// Flexible billing config — charge catalogue + UNIT > PROPERTY > ORG resolution.
// Disabled charge = never on the bill. Bills snapshot their line items,
// so later price/config changes only affect FUTURE bills.

export type ChargeDef = { key: string; label: string; group: "Rent" | "Utilities" | "Services" };

export const CHARGE_DEFS: ChargeDef[] = [
  { key: "rent", label: "Monthly Rent", group: "Rent" },
  { key: "maintenance", label: "Maintenance Charges", group: "Services" },
  { key: "electricity", label: "Electricity", group: "Utilities" },
  { key: "electricity_submeter", label: "Electricity (Sub-meter)", group: "Utilities" },
  { key: "water", label: "Water Charges", group: "Utilities" },
  { key: "water_tanker", label: "Water Tanker", group: "Utilities" },
  { key: "gas", label: "Gas", group: "Utilities" },
  { key: "security", label: "Security Charges", group: "Services" },
  { key: "cleaning", label: "Cleaning Charges", group: "Services" },
  { key: "generator", label: "Generator Charges", group: "Services" },
  { key: "parking", label: "Parking Charges", group: "Services" },
  { key: "other", label: "Other Charges", group: "Services" },
];

export const CHARGE_LABELS: Record<string, string> = Object.fromEntries(
  CHARGE_DEFS.map((d) => [d.key, d.label]),
);

export type ResolvedCharge = {
  chargeKey: string;
  label: string;
  enabled: boolean;
  amount: number;
  method: string;
  level: "UNIT" | "PROPERTY" | "ORG" | "DEFAULT";
};

export type ChargeRow = {
  chargeKey: string;
  label: string;
  enabled: boolean;
  amount: number;
  method: string;
  frequency: string;
  scope: string;
  scopeId: string;
};

/** Resolve effective charges for one unit. Later (more specific) levels win. */
export function resolveCharges(
  orgConfigs: ChargeRow[],
  propConfigs: ChargeRow[],
  unitConfigs: ChargeRow[],
  unitRent: number,
): ResolvedCharge[] {
  const byKey = new Map<string, ResolvedCharge>();
  for (const d of CHARGE_DEFS) {
    byKey.set(d.key, {
      chargeKey: d.key,
      label: d.label,
      enabled: d.key === "rent",
      amount: d.key === "rent" ? unitRent : 0,
      method: "fixed",
      level: "DEFAULT",
    });
  }
  const apply = (rows: ChargeRow[], level: "ORG" | "PROPERTY" | "UNIT") => {
    for (const r of rows) {
      const cur = byKey.get(r.chargeKey);
      if (!cur) continue;
      byKey.set(r.chargeKey, {
        chargeKey: r.chargeKey,
        label: r.label || cur.label,
        enabled: r.enabled,
        amount: r.chargeKey === "rent" && r.amount === 0 ? unitRent : r.amount,
        method: r.method,
        level,
      });
    }
  };
  apply(orgConfigs, "ORG");
  apply(propConfigs, "PROPERTY");
  apply(unitConfigs, "UNIT");
  return CHARGE_DEFS.map((d) => byKey.get(d.key)!);
}

/** Bill line items from resolved charges. `manualAmounts` lets the admin
 *  enter meter/actual amounts at billing time (method meter/actual_bill/manual). */
export function buildBillItems(
  resolved: ResolvedCharge[],
  manualAmounts: Record<string, number> = {},
): { chargeKey: string; label: string; amount: number; method: string }[] {
  const items: { chargeKey: string; label: string; amount: number; method: string }[] = [];
  for (const c of resolved) {
    if (!c.enabled) continue;
    let amount = c.amount;
    if (c.method !== "fixed" && manualAmounts[c.chargeKey] !== undefined) {
      amount = manualAmounts[c.chargeKey];
    }
    if (amount <= 0 && c.chargeKey !== "rent") continue;
    if (amount <= 0 && c.chargeKey === "rent") continue;
    items.push({ chargeKey: c.chargeKey, label: c.label, amount, method: c.method });
  }
  return items;
}

export const PLANS: Record<string, { price: string; properties: string; units: string; features: string[] }> = {
  Starter: {
    price: "Rs. 2,500 / month",
    properties: "Up to 3 properties",
    units: "Up to 30 units",
    features: ["Billing & receipts", "Tenant portal links", "Basic reports"],
  },
  Professional: {
    price: "Rs. 5,000 / month",
    properties: "Up to 10 properties",
    units: "Up to 150 units",
    features: ["Everything in Starter", "Maintenance module", "Expense tracking", "CSV export"],
  },
  Business: {
    price: "Rs. 10,000 / month",
    properties: "Up to 30 properties",
    units: "Up to 500 units",
    features: ["Everything in Professional", "Multi-manager roles", "Priority support"],
  },
  Enterprise: {
    price: "Custom",
    properties: "Unlimited properties",
    units: "Unlimited units",
    features: ["Everything in Business", "Dedicated support", "Custom onboarding"],
  },
};

export const MANAGEMENT_TYPES = ["Residential", "Commercial", "Housing Society", "Portfolio", "Market/Union"];
export const ROLES = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"];
