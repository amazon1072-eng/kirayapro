import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { error, json, requireUser, requirePermission, toInt } from "@/lib/api";
import { planLimits, orgUsage, planNameOf } from "@/lib/plans";

// Bulk import units for one property from an Excel (.xlsx) or CSV file.
// Each row is one house with its OWN details (owner name, phone, rent).
// All-or-nothing: if any row has an error, nothing is created and the
// errors are returned per row so the file can be fixed and re-uploaded.
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const perm = await requirePermission(user, "properties.manage");
  if (perm) return perm;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return error("Could not read the uploaded file.");
  }
  const propertyId = String(form.get("propertyId") ?? "");
  const file = form.get("file");
  if (!propertyId) return error("Property is required.");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return error("Please choose an Excel (.xlsx) or CSV file.");
  }
  const prop = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: user.organizationId },
  });
  if (!prop) return error("Property not found.", 404);

  let rows: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return error("The file has no sheet with data.");
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  } catch {
    return error("Could not read the file. Please upload a valid .xlsx or .csv file.");
  }
  if (!rows || rows.length < 2) {
    return error("The file has no data rows. Add at least one house below the header row.");
  }

  // Header mapping — flexible names, English + common variants.
  const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[\s_-]/g, "");
  const ALIASES: Record<string, string[]> = {
    unitNo: ["houseno", "unitno", "housenumber", "unitnumber", "gharno", "ghar", "house", "unit"],
    ownerName: ["malikname", "ownername", "malik", "owner", "ownerfullname"],
    ownerPhone: ["malikphone", "ownerphone", "phone", "phonenumber", "mobile", "number", "contact"],
    monthlyRent: ["monthlyrent", "rent", "kiraya", "rentpermonth"],
    securityDeposit: ["securitydeposit", "deposit", "advance"],
    floor: ["floor", "manzil"],
    areaSqft: ["areasqft", "area", "sqft", "size"],
    kind: ["kind", "type", "qism"],
    notes: ["notes", "note", "remarks"],
  };
  const header = (rows[0] as unknown[]).map(norm);
  const col: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (idx >= 0) { col[field] = idx; break; }
    }
  }
  if (col.unitNo === undefined) {
    return error("Header 'House No' not found. Please use the sample template.");
  }
  if (col.monthlyRent === undefined) {
    return error("Header 'Monthly Rent' not found. Please use the sample template.");
  }

  // Existing unit numbers in this property (same org) — duplicates refused.
  const existing = await prisma.unit.findMany({
    where: { propertyId, organizationId: user.organizationId },
    select: { unitNo: true },
  });
  const existingNos = new Set(existing.map((u) => u.unitNo.trim().toLowerCase()));

  type ParsedUnit = {
    unitNo: string; kind: string; floor: number; areaSqft: number | null;
    monthlyRent: number; securityDeposit: number;
    ownerName: string | null; ownerPhone: string | null; notes: string | null;
  };
  const parsed: ParsedUnit[] = [];
  const errors: { row: number; message: string }[] = [];
  const seenInFile = new Set<string>();
  const get = (row: unknown[], field: string) => {
    const idx = col[field];
    return idx === undefined ? "" : row[idx];
  };
  const numOrNull = (v: unknown): number | null => {
    if (v === "" || v === null || v === undefined) return null;
    const n = toInt(v, -1);
    return n >= 0 ? n : null;
  };
  // Excel drops the leading 0 of a bare Pakistani mobile number
  // (03001234567 becomes 3001234567). Restore it: 10 digits starting
  // with 3 is a Pakistani mobile missing its 0.
  const normPhone = (v: unknown): string | null => {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const digits = s.replace(/\D/g, "");
    if (digits.length === 10 && digits.startsWith("3")) return "0" + digits;
    return s;
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const rowNo = i + 1; // 1-based, header is row 1
    const isBlank = row.every((c) => String(c ?? "").trim() === "");
    if (isBlank) continue;
    const unitNo = String(get(row, "unitNo") ?? "").trim();
    const rentRaw = get(row, "monthlyRent");
    const rent = numOrNull(rentRaw);
    if (!unitNo) { errors.push({ row: rowNo, message: "House No is missing." }); continue; }
    if (rent === null) { errors.push({ row: rowNo, message: `Monthly Rent is missing or not a number for '${unitNo}'.` }); continue; }
    const key = unitNo.toLowerCase();
    if (seenInFile.has(key)) { errors.push({ row: rowNo, message: `House No '${unitNo}' appears twice in the file.` }); continue; }
    if (existingNos.has(key)) { errors.push({ row: rowNo, message: `House No '${unitNo}' already exists in this property.` }); continue; }
    seenInFile.add(key);
    const floor = numOrNull(get(row, "floor")) ?? 0;
    const area = numOrNull(get(row, "areaSqft"));
    const deposit = numOrNull(get(row, "securityDeposit")) ?? 0;
    const kind = String(get(row, "kind") ?? "").trim() || "House";
    const ownerName = String(get(row, "ownerName") ?? "").trim() || null;
    const ownerPhone = normPhone(get(row, "ownerPhone"));
    const notes = String(get(row, "notes") ?? "").trim() || null;
    parsed.push({ unitNo, kind, floor, areaSqft: area, monthlyRent: rent, securityDeposit: deposit, ownerName, ownerPhone, notes });
  }

  if (errors.length > 0) {
    return json({ ok: false, created: 0, errors });
  }
  if (parsed.length === 0) {
    return error("No valid rows found in the file.");
  }
  if (parsed.length > 500) {
    return error("The file has more than 500 houses. Please split it into smaller files.");
  }

  // Plan limit: org-wide unit count + new rows must fit the plan.
  const limits = planLimits(user.orgPlan);
  const usage = await orgUsage(user.organizationId);
  if (Number.isFinite(limits.units) && usage.units + parsed.length > limits.units) {
    return error(
      `${planNameOf(user.orgPlan)} plan allows ${limits.units} units. You already have ${usage.units} and the file has ${parsed.length} more. Upgrade to add more.`,
      403,
    );
  }

  await prisma.$transaction(
    parsed.map((u) =>
      prisma.unit.create({
        data: {
          organizationId: user.organizationId,
          propertyId,
          unitNo: u.unitNo,
          kind: u.kind,
          floor: u.floor,
          areaSqft: u.areaSqft,
          monthlyRent: u.monthlyRent,
          securityDeposit: u.securityDeposit,
          status: "Vacant",
          ownerName: u.ownerName,
          ownerPhone: u.ownerPhone,
          notes: u.notes,
        },
      }),
    ),
  );
  return json({ ok: true, created: parsed.length, errors: [] });
}
