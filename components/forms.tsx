"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CHARGE_DEFS } from "@/lib/billing";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function useSubmit() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (url: string, body: unknown, okMsg = "Saved.") => {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const data = await postJson(url, body);
      setMsg(data.message || okMsg);
      router.refresh();
      return data;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { msg, err, busy, submit, setMsg, setErr };
}

export function FormMsg({ msg, err }: { msg?: string | null; err?: string | null }) {
  return (
    <>
      {msg ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</p> : null}
    </>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:outline-none";
const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const btnCls = "rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

/* ---------------- Auth ---------------- */

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(fd.entries());
    if (body.managementTypes) {
      body.managementTypes = fd.getAll("managementTypes");
    }
    try {
      const data = await postJson(`/api/auth/${mode}`, body);
      if (data.redirect) router.push(data.redirect);
      else router.push("/dashboard");
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormMsg err={err} />
      {!isLogin ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your full name"><input name="fullName" required className={inputCls} placeholder="Said Nawab" /></Field>
            <Field label="Phone"><input name="phone" className={inputCls} placeholder="0300-1234567" /></Field>
          </div>
          <Field label="Organization / business name"><input name="orgName" required className={inputCls} placeholder="e.g. Nawab Properties" /></Field>
          <Field label="City"><input name="city" className={inputCls} placeholder="Islamabad" /></Field>
          <div>
            <span className={labelCls}>What do you manage? (tick all that apply)</span>
            <div className="flex flex-wrap gap-2">
              {["Residential", "Commercial", "Housing Society", "Portfolio", "Market/Union"].map((t) => (
                <label key={t} className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-sm">
                  <input type="checkbox" name="managementTypes" value={t} defaultChecked={t === "Residential"} /> {t}
                </label>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <Field label="Email"><input name="email" type="email" required className={inputCls} placeholder="you@example.com" /></Field>
      <Field label="Password"><input name="password" type="password" required minLength={8} className={inputCls} placeholder={isLogin ? "Your password" : "At least 8 characters"} /></Field>
      <button disabled={busy} className={`${btnCls} w-full py-2.5`}>
        {busy ? "Please wait…" : isLogin ? "Log in" : "Create my organization"}
      </button>
      <p className="text-center text-xs text-slate-500">
        Demo login: <span className="font-mono font-semibold">demo@kirayapro.pk</span> / <span className="font-mono font-semibold">Demo1234</span>
      </p>
    </form>
  );
}

/* ---------------- Property / Unit / Tenant ---------------- */

export function PropertyForm() {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/properties", Object.fromEntries(fd.entries()), "Property added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Property name *"><input name="name" required className={inputCls} placeholder="e.g. F-7 Markaz Plaza" /></Field>
        <Field label="Type">
          <select name="type" className={inputCls} defaultValue="Residential">
            {["Residential", "Commercial", "Housing Society", "Market/Union", "Portfolio"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="City"><input name="city" className={inputCls} placeholder="Islamabad" /></Field>
        <Field label="Floors"><input name="floors" type="number" min={1} defaultValue={1} className={inputCls} /></Field>
        <Field label="Owner name"><input name="ownerName" className={inputCls} /></Field>
        <Field label="Address"><input name="address" className={inputCls} placeholder="Street, area" /></Field>
      </div>
      <button disabled={busy} className={btnCls}>Add property</button>
    </form>
  );
}

export function UnitForm({ propertyId }: { propertyId: string }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/units", { ...Object.fromEntries(fd.entries()), propertyId }, "Unit added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Unit no. *"><input name="unitNo" required className={inputCls} placeholder="Shop 01 / Flat 2-A" /></Field>
        <Field label="Kind">
          <select name="kind" className={inputCls} defaultValue="Shop">
            {["House", "Flat", "Apartment", "Shop", "Office", "Other"].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Floor"><input name="floor" type="number" defaultValue={0} className={inputCls} /></Field>
        <Field label="Area (sq ft)"><input name="areaSqft" type="number" min={0} className={inputCls} /></Field>
        <Field label="Monthly rent (Rs.) *"><input name="monthlyRent" type="number" min={0} required className={inputCls} placeholder="60000" /></Field>
        <Field label="Security deposit (Rs.)"><input name="securityDeposit" type="number" min={0} defaultValue={0} className={inputCls} /></Field>
        <Field label="Owner (malik) name"><input name="ownerName" className={inputCls} placeholder="e.g. Ahmed Khan" /></Field>
        <Field label="Owner (malik) phone"><input name="ownerPhone" className={inputCls} placeholder="03xx-xxxxxxx" /></Field>
      </div>
      <Field label="Notes"><input name="notes" className={inputCls} /></Field>
      <button disabled={busy} className={btnCls}>Add unit</button>
    </form>
  );
}

type ImportError = { row: number; message: string };

export function UnitImportForm({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<ImportError[]>([]);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!file || (file instanceof File && file.size === 0)) {
      setErr("Please choose an Excel (.xlsx) or CSV file first.");
      return;
    }
    setErr(null); setMsg(null); setRowErrors([]); setBusy(true);
    try {
      const res = await fetch("/api/units/import", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Import failed.");
      if (data.ok === false) {
        setRowErrors(data.errors ?? []);
        setErr(`Nothing was added — ${data.errors?.length ?? 0} row(s) have errors. Fix the file and upload again.`);
        return;
      }
      setMsg(`${data.created} house(s) added.`);
      e.currentTarget.reset();
      setFileName(null);
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <p className="text-sm text-slate-600">
        Upload an Excel (.xlsx) or CSV list — one house per row, each with its own owner, phone and rent.{" "}
        <a href="/unit-import-template.csv" download className="font-semibold text-teal-700 underline">Download sample template</a>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Choose file
          <input
            name="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
          />
        </label>
        <span className="text-sm text-slate-500">{fileName ?? "No file chosen"}</span>
        <input type="hidden" name="propertyId" value={propertyId} />
        <button disabled={busy} className={btnCls}>Upload &amp; add houses</button>
      </div>
      {rowErrors.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-red-200">
          <table className="w-full text-sm">
            <thead><tr className="bg-red-50 text-left"><th className="px-3 py-2">Row</th><th className="px-3 py-2">Problem</th></tr></thead>
            <tbody>
              {rowErrors.map((r) => (
                <tr key={r.row} className="border-t border-red-100">
                  <td className="px-3 py-2 font-semibold">{r.row}</td>
                  <td className="px-3 py-2">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </form>
  );
}

export function TenantForm({ units }: { units: { id: string; label: string }[] }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/tenants", Object.fromEntries(fd.entries()), "Tenant added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *"><input name="fullName" required className={inputCls} placeholder="Tenant / shopkeeper name" /></Field>
        <Field label="Phone *"><input name="phone" required className={inputCls} placeholder="0300-1234567" /></Field>
        <Field label="CNIC"><input name="cnic" className={inputCls} placeholder="61101-1234567-1" /></Field>
        <Field label="Assign unit">
          <select name="unitId" className={inputCls} defaultValue="">
            <option value="">— No unit yet —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select name="memberType" className={inputCls} defaultValue="Tenant">
            <option>Tenant</option><option>Shopkeeper</option><option>Member</option>
          </select>
        </Field>
        <Field label="Membership no. (shops / societies)"><input name="membershipNo" className={inputCls} /></Field>
        <Field label="Rental start date"><input name="rentalStart" type="date" className={inputCls} /></Field>
        <Field label="Agreement end date"><input name="rentalEnd" type="date" className={inputCls} /></Field>
        <Field label="Emergency contact name"><input name="emergencyName" className={inputCls} /></Field>
        <Field label="Emergency contact phone"><input name="emergencyPhone" className={inputCls} /></Field>
        <Field label="Address"><input name="address" className={inputCls} /></Field>
        <Field label="Notes"><input name="notes" className={inputCls} /></Field>
      </div>
      <button disabled={busy} className={btnCls}>Add tenant</button>
    </form>
  );
}

/* ---------------- Charges editor ---------------- */

type ChargeInherited = { enabled: boolean; amount: number; method: string; label: string; source: string };
type ChargeState = {
  chargeKey: string; label: string; enabled: boolean; amount: number; method: string;
  source: "UNIT" | "PROPERTY" | "ORG" | "DEFAULT";
  overridden: boolean;
  // At property/org level rent is not settable — it comes from the units.
  perUnit?: boolean;
  inherited: ChargeInherited;
};

type RentSummary = {
  unitCount: number; unitsWithRent: number; min: number | null; max: number | null;
  override: { scope: string; amount: number } | null;
} | null;

/** Honest one-line summary of a property/org's unit rents. Never a fake 0. */
function rentSummaryText(s: RentSummary): string {
  if (!s) return "";
  if (s.override) {
    return `Rs. ${s.override.amount.toLocaleString("en-PK")} for every unit — ${s.override.scope === "PROPERTY" ? "property" : "organization"} override`;
  }
  if (s.unitsWithRent === 0) return s.unitCount === 0 ? "No units yet" : "No rent set on any unit yet";
  const range = s.min === s.max
    ? `Rs. ${(s.min as number).toLocaleString("en-PK")}`
    : `Rs. ${(s.min as number).toLocaleString("en-PK")} – Rs. ${(s.max as number).toLocaleString("en-PK")}`;
  const same = s.min === s.max ? ` · all ${s.unitCount} unit${s.unitCount === 1 ? "" : "s"} the same` : ` · ${s.unitCount} unit${s.unitCount === 1 ? "" : "s"}`;
  const unset = s.unitCount - s.unitsWithRent > 0 ? ` · ${s.unitCount - s.unitsWithRent} without rent` : "";
  return `${range}${same}${unset}`;
}

function sourceBadge(r: ChargeState) {
  if (r.perUnit) return { text: "Per unit", cls: "bg-sky-100 text-sky-800" };
  if (r.overridden) return { text: "Set here", cls: "bg-teal-100 text-teal-800" };
  if (r.source === "ORG") return { text: "Inherited · Org", cls: "bg-slate-100 text-slate-600" };
  if (r.source === "PROPERTY") return { text: "Inherited · Property", cls: "bg-slate-100 text-slate-600" };
  return { text: "Default", cls: "bg-slate-100 text-slate-400" };
}

export function ChargeEditor({ scope, scopeId, scopeLabel }: { scope: string; scopeId: string; scopeLabel: string }) {
  const [initial, setInitial] = useState<ChargeState[] | null>(null);
  const [rows, setRows] = useState<ChargeState[] | null>(null);
  const [rentSummary, setRentSummary] = useState<RentSummary>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const { msg, err, busy, submit, setMsg } = useSubmit();

  const load = useCallback(() => {
    fetch(`/api/charges?scope=${scope}&scopeId=${encodeURIComponent(scopeId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) { setLoadErr(null); setInitial(d.charges); setRows(d.charges); setRentSummary(d.rentSummary ?? null); setCleared(new Set()); }
        else setLoadErr(d.error || "Could not load charges.");
      })
      .catch(() => setLoadErr("Could not load charges."));
  }, [scope, scopeId]);

  // Remove a stale property/org rent override so rent goes back to the
  // per-unit values. (Setting rent at this level is no longer possible.)
  const removeRentOverride = async () => {
    const data = await submit("/api/charges", { scope, scopeId, changes: [], clears: ["rent"] });
    if (data) { setMsg(data.message || "Rent override removed — rent is per unit again."); load(); }
  };

  useEffect(() => { load(); }, [load]);

  if (loadErr) return <p className="text-sm text-red-600">{loadErr}</p>;
  if (!initial || !rows) return <p className="text-sm text-slate-500">Loading charges…</p>;

  const set = (key: string, patch: Partial<ChargeState>) => {
    setRows((prev) => (prev ? prev.map((r) => (r.chargeKey === key ? { ...r, ...patch } : r)) : prev));
    // Editing a reverted row makes it a fresh change again.
    setCleared((prev) => {
      if (!prev.has(key)) return prev;
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  };

  const revert = (key: string) => {
    const init = initial.find((r) => r.chargeKey === key);
    if (!init) return;
    setRows((prev) =>
      prev ? prev.map((r) => (r.chargeKey === key ? { ...r, enabled: init.inherited.enabled, amount: init.inherited.amount, method: init.inherited.method } : r)) : prev,
    );
    setCleared((prev) => new Set(prev).add(key));
  };

  const undoRevert = (key: string) => {
    const init = initial.find((r) => r.chargeKey === key);
    if (!init) return;
    setRows((prev) =>
      prev ? prev.map((r) => (r.chargeKey === key ? { ...r, enabled: init.enabled, amount: init.amount, method: init.method } : r)) : prev,
    );
    setCleared((prev) => {
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  };

  const dirtyCount = rows.filter((r) => {
    const init = initial.find((x) => x.chargeKey === r.chargeKey)!;
    if (cleared.has(r.chargeKey)) return true;
    return r.enabled !== init.enabled || r.amount !== init.amount || r.method !== init.method;
  }).length;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const changes: { chargeKey: string; label: string; enabled: boolean; amount: number; method: string }[] = [];
        const clears: string[] = [];
        for (const r of rows) {
          // Per-unit rows (Monthly Rent at property/org level) are
          // read-only here and never part of a save.
          if (r.perUnit) continue;
          const init = initial.find((x) => x.chargeKey === r.chargeKey)!;
          if (cleared.has(r.chargeKey)) { clears.push(r.chargeKey); continue; }
          const same = r.enabled === init.enabled && r.amount === init.amount && r.method === init.method;
          if (same) continue;
          // Edited back to exactly the inherited values: clearing the override
          // is cleaner than saving a duplicate row with the same values.
          if (init.overridden && r.enabled === init.inherited.enabled && r.amount === init.inherited.amount && r.method === init.inherited.method) {
            clears.push(r.chargeKey);
            continue;
          }
          changes.push({ chargeKey: r.chargeKey, label: r.label, enabled: r.enabled, amount: r.amount, method: r.method });
        }
        if (changes.length === 0 && clears.length === 0) return;
        const data = await submit("/api/charges", { scope, scopeId, changes, clears });
        if (data) { setMsg(data.message || "Charges saved."); load(); }
      }}
      className="space-y-2"
    >
      <p className="text-xs text-slate-500">
        {scopeLabel}: showing what this level actually pays — inherited values come from the level above (Unit &gt; Property &gt; Organization). Only rows you change are saved; untouched inherited charges stay inherited. Untick = never charged.
      </p>
      <FormMsg msg={msg} err={err} />
      {CHARGE_DEFS.map((d) => {
        const r = rows.find((x) => x.chargeKey === d.key)!;
        const badge = sourceBadge(r);
        const isCleared = cleared.has(d.key);
        // Monthly Rent at property/org level: read-only summary of the
        // units' real rents — never an editable 0.
        if (d.key === "rent" && r.perUnit) {
          return (
            <div key={d.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="flex w-48 items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked disabled />
                {d.label}
              </span>
              <span className="text-sm font-semibold text-slate-700">{rentSummaryText(rentSummary)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
              {rentSummary?.override ? (
                <button type="button" onClick={removeRentOverride} className="text-xs font-semibold text-teal-700 underline">Remove override</button>
              ) : null}
              <span className="text-xs text-slate-400">Rent — set on each unit, not here.</span>
            </div>
          );
        }
        const canRevert = r.overridden && !isCleared && !r.perUnit;
        return (
          <div key={d.key} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
            <label className="flex w-48 items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={r.enabled} disabled={isCleared} onChange={(e) => set(d.key, { enabled: e.target.checked })} />
              {d.label}
            </label>
            <input
              type="number" min={0} value={r.amount}
              onChange={(e) => set(d.key, { amount: Number(e.target.value) })}
              disabled={!r.enabled || isCleared}
              className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100"
              placeholder="Rs. amount"
            />
            <select value={r.method} onChange={(e) => set(d.key, { method: e.target.value })} disabled={!r.enabled || isCleared} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100">
              <option value="fixed">Fixed monthly</option>
              <option value="meter">Meter reading</option>
              <option value="actual_bill">Actual bill</option>
              <option value="manual">Entered at billing</option>
              <option value="one_time">One-time</option>
            </select>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
            {canRevert ? (
              <button type="button" onClick={() => revert(d.key)} className="text-xs font-semibold text-teal-700 underline">Revert to inherited</button>
            ) : null}
            {isCleared ? (
              <span className="text-xs text-amber-700">Will revert to inherited on save. <button type="button" onClick={() => undoRevert(d.key)} className="font-semibold underline">Undo</button></span>
            ) : null}
            <span className="text-xs text-slate-400">{d.group}{r.method !== "fixed" ? " — amount entered when generating the bill" : ""}</span>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || dirtyCount === 0} className={btnCls}>
          {dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Save charges"}
        </button>
        {dirtyCount === 0 ? <span className="text-xs text-slate-400">No changes — nothing to save.</span> : null}
      </div>
    </form>
  );
}

/* ---------------- Billing ---------------- */

type PreviewBill = {
  unitId: string; unitLabel: string; tenantName: string;
  items: { chargeKey: string; label: string; amount: number; method: string }[];
  total: number; skipped?: string;
};

export function BillingGenerator({ properties }: { properties: { id: string; name: string }[] }) {
  const router = useRouter();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [propertyId, setPropertyId] = useState("ALL");
  const [preview, setPreview] = useState<PreviewBill[] | null>(null);
  const [manual, setManual] = useState<Record<string, Record<string, number>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function doPreview() {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const data = await postJson("/api/billing/preview", { period, propertyId, manualAmounts: manual });
      setPreview(data.bills);
      if (data.bills.length === 0) setMsg("No occupied units with a tenant found for this selection.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  async function doGenerate() {
    setErr(null); setBusy(true);
    try {
      const data = await postJson("/api/billing/generate", { period, propertyId, manualAmounts: manual });
      setMsg(data.message || `Generated ${data.created} bill(s).`);
      setPreview(null);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <FormMsg msg={msg} err={err} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Billing month">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Property">
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={inputCls}>
            <option value="ALL">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <button onClick={doPreview} disabled={busy} className={btnCls}>Preview bills</button>
        {preview && preview.length > 0 ? (
          <button onClick={doGenerate} disabled={busy} className="rounded-lg bg-[#0b2545] px-4 py-2 text-sm font-semibold text-white hover:bg-[#164e78] disabled:opacity-50">
            Confirm &amp; generate {preview.length} bill(s)
          </button>
        ) : null}
      </div>
      {preview ? (
        <div className="space-y-3">
          {preview.map((b) => (
            <div key={b.unitId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-semibold">{b.unitLabel} — {b.tenantName}</p>
                <p className="font-bold">Rs. {b.total.toLocaleString("en-PK")}</p>
              </div>
              {b.skipped ? <p className="text-xs text-amber-700">{b.skipped}</p> : null}
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {b.items.map((it) => (
                    <tr key={it.chargeKey} className="border-t border-slate-100">
                      <td className="py-1">{it.label} <span className="text-xs text-slate-400">({it.method})</span></td>
                      <td className="py-1 text-right">
                        {it.method === "fixed" ? (
                          <>Rs. {it.amount.toLocaleString("en-PK")}</>
                        ) : (
                          <input
                            type="number" min={0} defaultValue={it.amount}
                            onChange={(e) => setManual((m) => ({ ...m, [b.unitId]: { ...(m[b.unitId] || {}), [it.chargeKey]: Number(e.target.value) } }))}
                            className="w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm"
                            aria-label={`${it.label} amount`}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-400">Meter / actual-bill amounts above can be edited before confirming. Disabled charges never appear here.</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Payment verification ---------------- */

export function VerifyButtons({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(action: "approve" | "reject") {
    setErr(null); setBusy(true);
    try {
      await postJson(`/api/payments/${paymentId}/verify`, { action, rejectReason: reason, internalNotes: notes });
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes (optional)" className={inputCls} />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reject reason (required if rejecting)" className={inputCls} />
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="flex gap-2">
        <button onClick={() => act("approve")} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Approve &amp; issue receipt</button>
        <button onClick={() => act("reject")} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Reject</button>
      </div>
    </div>
  );
}

/* ---------------- Maintenance / Expense ---------------- */

export function MaintenanceForm({ properties }: { properties: { id: string; name: string }[] }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/maintenance", Object.fromEntries(fd.entries()), "Request added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title *"><input name="title" required className={inputCls} placeholder="e.g. Leaking pipe in Shop 01" /></Field>
        <Field label="Property">
          <select name="propertyId" className={inputCls} defaultValue="">
            <option value="">—</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" className={inputCls} defaultValue="Plumbing">
            {["Plumbing", "Electrical", "Painting", "Cleaning", "Appliance", "Structural", "Other"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select name="priority" className={inputCls} defaultValue="Medium">
            {["Low", "Medium", "High", "Urgent"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Assigned staff"><input name="assignedStaff" className={inputCls} placeholder="Name of plumber / electrician" /></Field>
        <Field label="Cost estimate (Rs.)"><input name="costEstimate" type="number" min={0} className={inputCls} /></Field>
        <Field label="Description"><input name="description" className={inputCls} /></Field>
      </div>
      <button disabled={busy} className={btnCls}>Add request</button>
    </form>
  );
}

export function ExpenseForm({ properties, maintenance }: { properties: { id: string; name: string }[]; maintenance: { id: string; title: string }[] }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/expenses", Object.fromEntries(fd.entries()), "Expense recorded.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Description *"><input name="description" required className={inputCls} placeholder="e.g. Plumbing parts" /></Field>
        <Field label="Amount (Rs.) *"><input name="amount" type="number" min={1} required className={inputCls} /></Field>
        <Field label="Category">
          <select name="category" className={inputCls} defaultValue="Maintenance">
            {["Maintenance", "Repair", "Cleaning", "Security", "Utility", "Other"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Vendor"><input name="vendor" className={inputCls} /></Field>
        <Field label="Property">
          <select name="propertyId" className={inputCls} defaultValue="">
            <option value="">—</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Linked maintenance request">
          <select name="maintenanceId" className={inputCls} defaultValue="">
            <option value="">—</option>
            {maintenance.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
        <Field label="Date"><input name="spentDate" type="date" className={inputCls} /></Field>
      </div>
      <button disabled={busy} className={btnCls}>Record expense</button>
    </form>
  );
}

/* ---------------- Settings ---------------- */

export function OrgForm({ org }: { org: { name: string; city: string | null; address: string | null; contactName: string | null; contactPhone: string | null; plan: string } }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await submit("/api/settings/org", { ...Object.fromEntries(fd.entries()), managementTypes: fd.getAll("managementTypes") }, "Organization updated.");
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Organization name"><input name="name" defaultValue={org.name} required className={inputCls} /></Field>
        <Field label="City"><input name="city" defaultValue={org.city ?? ""} className={inputCls} /></Field>
        <Field label="Contact name"><input name="contactName" defaultValue={org.contactName ?? ""} className={inputCls} /></Field>
        <Field label="Contact phone"><input name="contactPhone" defaultValue={org.contactPhone ?? ""} className={inputCls} /></Field>
        <Field label="Address"><input name="address" defaultValue={org.address ?? ""} className={inputCls} /></Field>
        <div>
          <span className={labelCls}>Management types</span>
          <div className="flex flex-wrap gap-2">
            {["Residential", "Commercial", "Housing Society", "Portfolio", "Market/Union"].map((t) => (
              <label key={t} className="flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-sm">
                <input type="checkbox" name="managementTypes" value={t} /> {t}
              </label>
            ))}
          </div>
        </div>
      </div>
      <button disabled={busy} className={btnCls}>Save organization</button>
    </form>
  );
}

export function AddUserForm() {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/settings/users", Object.fromEntries(fd.entries()), "User added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name *"><input name="fullName" required className={inputCls} /></Field>
        <Field label="Email *"><input name="email" type="email" required className={inputCls} /></Field>
        <Field label="Password * (min 8 chars)"><input name="password" type="password" required minLength={8} className={inputCls} /></Field>
        <Field label="Role">
          <select name="role" className={inputCls} defaultValue="MANAGER">
            <option value="ADMIN">Administrator</option>
            <option value="MANAGER">Property Manager</option>
            <option value="ACCOUNTANT">Accountant</option>
          </select>
        </Field>
      </div>
      <button disabled={busy} className={btnCls}>Add team member</button>
      <p className="text-xs text-slate-500">Owner/Admin: full access. Manager: no org settings. Accountant: finance pages (billing, payments, reports) — no property/tenant editing.</p>
    </form>
  );
}

export function DemoButtons({ isDemo }: { isDemo: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(action: "clear" | "restore") {
    if (action === "clear" && !confirm("Clear ALL demo data? This cannot be undone.")) return;
    setErr(null); setBusy(true);
    try {
      const data = await postJson("/api/demo", { action });
      setMsg(data.message || "Done.");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <FormMsg msg={msg} err={err} />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => act("restore")} disabled={busy || !isDemo} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Restore demo data</button>
        <button onClick={() => act("clear")} disabled={busy || !isDemo} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Clear demo data</button>
      </div>
      <p className="text-xs text-slate-500">Demo data lives in a separate demo organization and never mixes with real organizations. These buttons only work for the demo org.</p>
    </div>
  );
}

/* ---------------- Tenant portal payment form ---------------- */

export function PortalPaymentForm({ token }: { token: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<{ amount: string; method: string; reference: string } | null>(null);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setMsg(null); setSubmitted(null); setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch(`/api/portal/${token}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submission failed.");
      setSubmitted({
        amount: String(fd.get("amount") ?? ""),
        method: String(fd.get("method") ?? ""),
        reference: String(fd.get("reference") ?? ""),
      });
      setMsg("Payment submitted. The owner will verify it and your receipt will appear here once approved.");
      e.currentTarget.reset();
      router.refresh();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed.");
    } finally { setBusy(false); }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3" encType="multipart/form-data">
      {submitted ? (
        <div className="rounded-xl bg-emerald-50 p-4 text-sm ring-1 ring-emerald-200">
          <p className="font-bold text-emerald-800">✓ Payment submitted — awaiting verification</p>
          <p className="mt-1 text-emerald-800">Amount: <b>Rs. {Number(submitted.amount).toLocaleString("en-PK")}</b> · Method: <b>{submitted.method}</b></p>
          {submitted.reference ? <p className="text-emerald-800">Reference: <b>{submitted.reference}</b></p> : null}
          <p className="mt-1 text-xs text-emerald-700">It now appears below in “Your payments on this bill” as Pending, and in the “Submitted — awaiting verification” row above.</p>
        </div>
      ) : null}
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount paid (Rs.) *"><input name="amount" type="number" min={1} required className={inputCls} /></Field>
        <Field label="Payment method *">
          <select name="method" className={inputCls} defaultValue="JazzCash">
            <option>Cash</option><option>Bank transfer</option><option>Easypaisa</option><option>JazzCash</option><option>Other</option>
          </select>
        </Field>
        <Field label="Date paid"><input name="paidDate" type="date" className={inputCls} /></Field>
        <Field label="Transaction reference *"><input name="reference" required className={inputCls} placeholder="e.g. JazzCash TID / bank ref" /></Field>
      </div>
      <Field label="Payment proof (photo / screenshot)"><input name="proof" type="file" accept="image/*,.pdf" className={inputCls} /></Field>
      <button disabled={busy} className={`${btnCls} w-full py-2.5`}>{busy ? "Submitting…" : "Submit payment"}</button>
    </form>
  );
}

/* ---------------- Bill page helpers ---------------- */

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-[#0b2545] px-4 py-2 text-sm font-semibold text-white">
      Print bill
    </button>
  );
}

export function ReissueLinkButton({ billId }: { billId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reissue() {
    setErr(null); setBusy(true);
    try {
      const data = await postJson(`/api/bills/${billId}/reissue`, {});
      setLink(data.portalUrl);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="no-print mt-3 space-y-2">
      <button onClick={reissue} disabled={busy} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "…" : "Copy new payment link"}
      </button>
      {link ? (
        <p className="break-all rounded-lg bg-slate-50 p-2 text-xs">
          <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-teal-700">{link}</a>
          <br />Send this to the tenant (WhatsApp button above). It expires in 30 days and can be revoked.
        </p>
      ) : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}

export function RevokeButton({ billId }: { billId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function revoke() {
    if (!confirm("Revoke this payment link? The tenant will no longer be able to open the bill.")) return;
    try {
      await postJson(`/api/bills/${billId}/revoke`, {});
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
  }
  return (
    <div className="no-print mt-3">
      <button onClick={revoke} className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">Revoke payment link</button>
      {err ? <p className="mt-1 text-sm text-red-600">{err}</p> : null}
    </div>
  );
}

/* ---------------- Phase 2 — Union ---------------- */

export function UnionProfileForm({ union }: { union: { id: string; name: string; presidentName: string | null; presidentPhone: string | null; address: string | null; city: string | null; registrationNo: string | null } | null }) {
  const { msg, err, busy, submit, setMsg, setErr } = useSubmit();
  const router = useRouter();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    if (union) {
      setErr(null); setMsg(null);
      try {
        const r = await fetch("/api/union", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: union.id, ...body }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Failed.");
        setMsg("Union profile updated.");
        router.refresh();
      } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed."); }
    } else {
      await submit("/api/union", body, "Union created.");
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Union name *"><input name="name" required defaultValue={union?.name ?? ""} className={inputCls} placeholder="e.g. Sohan Bazaar Market Union" /></Field>
        <Field label="President name"><input name="presidentName" defaultValue={union?.presidentName ?? ""} className={inputCls} placeholder="Haji Saleem" /></Field>
        <Field label="President phone"><input name="presidentPhone" defaultValue={union?.presidentPhone ?? ""} className={inputCls} placeholder="0300-9998888" /></Field>
        <Field label="Registration no."><input name="registrationNo" defaultValue={union?.registrationNo ?? ""} className={inputCls} /></Field>
        <Field label="City"><input name="city" defaultValue={union?.city ?? ""} className={inputCls} placeholder="Islamabad" /></Field>
        <Field label="Address"><input name="address" defaultValue={union?.address ?? ""} className={inputCls} /></Field>
      </div>
      <button disabled={busy} className={btnCls}>{union ? "Save union profile" : "Create union"}</button>
    </form>
  );
}

export function UnionMemberForm({ unionId, units, tenants }: { unionId: string; units: { id: string; label: string }[]; tenants: { id: string; name: string }[] }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/union/members", { ...Object.fromEntries(fd.entries()), unionId }, "Member added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Membership no. *"><input name="membershipNo" required className={inputCls} placeholder="M-001" /></Field>
        <Field label="Full name *"><input name="fullName" required className={inputCls} /></Field>
        <Field label="Phone *"><input name="phone" required className={inputCls} placeholder="0300-1234567" /></Field>
        <Field label="CNIC"><input name="cnic" className={inputCls} /></Field>
        <Field label="Shop / unit (optional)">
          <select name="unitId" className={inputCls} defaultValue="">
            <option value="">— no shop linked —</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </Field>
        <Field label="Tenant record (optional)">
          <select name="tenantId" className={inputCls} defaultValue="">
            <option value="">— no tenant linked —</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>
      <button disabled={busy} className={btnCls}>Add member</button>
    </form>
  );
}

export function UnionMemberActions({ memberId, status }: { memberId: string; status: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function patch(patchBody: unknown, method: string, url: string) {
    setErr(null); setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed.");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <span className="inline-flex gap-1">
      <button disabled={busy} onClick={() => patch({ status: status === "Active" ? "Suspended" : "Active" }, "PATCH", `/api/union/members/${memberId}`)} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold hover:bg-slate-200 disabled:opacity-50">
        {status === "Active" ? "Suspend" : "Re-activate"}
      </button>
      <button disabled={busy} onClick={() => { if (confirm("Remove this member? Their fee records are also removed.")) patch({}, "DELETE", `/api/union/members/${memberId}`); }} className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Remove</button>
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function UnionFeeForm({ unionId }: { unionId: string }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/union/fees", { ...Object.fromEntries(fd.entries()), unionId }, "Fee config added.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Fee label *"><input name="label" required className={inputCls} placeholder="Monthly membership fee" /></Field>
        <Field label="Amount (Rs.) *"><input name="amount" type="number" min={1} required className={inputCls} placeholder="2000" /></Field>
        <Field label="Period">
          <select name="period" className={inputCls} defaultValue="monthly">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
      </div>
      <button disabled={busy} className={btnCls}>Add fee</button>
    </form>
  );
}

export function UnionFeeGenerate({ unionId }: { unionId: string }) {
  const { msg, err, busy, submit } = useSubmit();
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  async function go() {
    await submit("/api/union/fees/generate", { unionId, period }, "Fees generated.");
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="block">
        <span className={labelCls}>Billing month</span>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls} />
      </label>
      <button onClick={go} disabled={busy} className={btnCls}>Generate fees for period</button>
      <FormMsg msg={msg} err={err} />
    </div>
  );
}

export function UnionFeeCollect({ collectionId }: { collectionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function collect() {
    setErr(null); setBusy(true);
    try {
      await postJson("/api/union/fees/collect", { collectionId, method, reference });
      setOpen(false);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Collect</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
        {["Cash", "Bank transfer", "Easypaisa", "JazzCash", "Other"].map((m) => <option key={m}>{m}</option>)}
      </select>
      <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      <button onClick={collect} disabled={busy} className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Confirm paid</button>
      <button onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold">Cancel</button>
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function UnionExpenseForm({ unionId }: { unionId: string }) {
  const { msg, err, busy, submit } = useSubmit();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/union/expenses", { ...Object.fromEntries(fd.entries()), unionId }, "Union expense recorded.");
    if (data) e.currentTarget.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Description *"><input name="description" required className={inputCls} placeholder="e.g. Market cleaning" /></Field>
        <Field label="Amount (Rs.) *"><input name="amount" type="number" min={1} required className={inputCls} /></Field>
        <Field label="Category">
          <select name="category" className={inputCls} defaultValue="Cleaning">
            {["Cleaning", "Security", "Maintenance", "Utility", "Other"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Vendor"><input name="vendor" className={inputCls} /></Field>
        <Field label="Date"><input name="spentDate" type="date" className={inputCls} /></Field>
      </div>
      <button disabled={busy} className={btnCls}>Record union expense</button>
    </form>
  );
}

/* ---------------- Phase 2 — Custom roles ---------------- */

export function CustomRoleForm({ permissions }: { permissions: { key: string; label: string; restricted?: boolean }[] }) {
  const { msg, err, busy, submit } = useSubmit();
  const [selected, setSelected] = useState<string[]>([]);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = await submit("/api/settings/roles", { name: String(fd.get("name") ?? ""), permissions: selected }, "Role created.");
    if (data) { e.currentTarget.reset(); setSelected([]); }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormMsg msg={msg} err={err} />
      <Field label="Role name *"><input name="name" required className={inputCls} placeholder="e.g. Billing Clerk" /></Field>
      <div>
        <span className={labelCls}>Permissions</span>
        <p className="mb-2 text-xs text-slate-500">Owner-only permissions (bill deletion/cancellation, receipt voiding, role &amp; team management, org settings) can never be given to a custom role — the server refuses them too.</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {permissions.map((p) => (
            <label key={p.key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${p.restricted ? "border-slate-200 bg-slate-50 opacity-70" : "border-slate-200"}`}>
              <input type="checkbox" disabled={!!p.restricted} checked={selected.includes(p.key)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.key] : selected.filter((k) => k !== p.key))} />
              <span><b>{p.label}</b> <span className="text-xs text-slate-400">({p.key})</span>{p.restricted ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Owner only</span> : null}</span>
            </label>
          ))}
        </div>
      </div>
      <button disabled={busy} className={btnCls}>Create role</button>
    </form>
  );
}

export function AssignRoleSelect({ userId, customRoleId, roles }: { userId: string; customRoleId: string | null; roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function change(value: string) {
    setErr(null);
    try {
      const res = await fetch(`/api/settings/users/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customRoleId: value || null }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed.");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
  }
  return (
    <span className="inline-flex items-center gap-1">
      <select value={customRoleId ?? ""} onChange={(e) => change(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
        <option value="">— built-in role —</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function DeleteRoleButton({ roleId }: { roleId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function del() {
    if (!confirm("Delete this custom role? Users on it fall back to their built-in role.")) return;
    const res = await fetch(`/api/settings/roles/${roleId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "Failed."); return; }
    router.refresh();
  }
  return (
    <span>
      <button onClick={del} className="rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button>
      {err ? <span className="ml-1 text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

/* ---------------- Permission refinement — bill delete / cancel / receipt void ---------------- */

export function DeleteBillButton({ billId }: { billId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!confirm("Delete this bill permanently? Bills with verified payments cannot be deleted.")) return;
    setErr(null); setBusy(true);
    const res = await fetch(`/api/bills/${billId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Failed."); return; }
    router.push("/billing");
    router.refresh();
  }
  return (
    <span>
      <button onClick={del} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Delete bill</button>
      {err ? <span className="ml-2 text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function CancelBillButton({ billId }: { billId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!confirm("Cancel this bill? It will no longer count towards outstanding or collections, and the tenant's payment link stops working. Bills with verified payments cannot be cancelled.")) return;
    setErr(null); setBusy(true);
    const res = await fetch(`/api/bills/${billId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Failed."); return; }
    router.refresh();
  }
  return (
    <span>
      <button onClick={cancel} disabled={busy} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">Cancel bill</button>
      {err ? <span className="ml-2 text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function voidIt() {
    if (!confirm("Void this approved payment? Its receipt becomes invalid and the amount goes back on the bill as outstanding. This is an Owner/Admin-only financial adjustment.")) return;
    setErr(null); setBusy(true);
    const res = await fetch(`/api/payments/${paymentId}/void`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "Failed."); return; }
    router.refresh();
  }
  return (
    <span className="mt-2 block">
      <button onClick={voidIt} disabled={busy} className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-50">Void payment (receipt invalid)</button>
      {err ? <span className="ml-2 text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

/* ---------------- Phase 2 — Invoice upload / WhatsApp / Notifications ---------------- */

export function ExpenseInvoiceUpload({ expenseId, kind }: { expenseId: string; kind: "expense" | "union-expense" }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setMsg(null); setBusy(true);
    const fd = new FormData();
    fd.append("invoice", file);
    const url = kind === "expense" ? `/api/expenses/${expenseId}/invoice` : `/api/union/expenses/${expenseId}/invoice`;
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setMsg("Invoice uploaded.");
      router.refresh();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed."); }
    finally { setBusy(false); e.target.value = ""; }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <label className="cursor-pointer rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold hover:bg-slate-200">
        {busy ? "Uploading…" : "Upload invoice"}
        <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={onChange} disabled={busy} />
      </label>
      {msg ? <span className="text-xs text-emerald-700">{msg}</span> : null}
      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function WhatsAppShareButton({ billId }: { billId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const data = await postJson("/api/whatsapp/send", { billId });
      if (data.provider === "manual" && data.waLink) {
        window.open(data.waLink, "_blank", "noopener,noreferrer");
        setMsg("WhatsApp opened — send the message from your phone.");
      } else if (data.provider === "waba") {
        setMsg("Message sent via WhatsApp Business API.");
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button onClick={send} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        {busy ? "Please wait…" : "WhatsApp par bhejo"}
      </button>
      {msg ? <span className="text-xs text-emerald-700">{msg}</span> : null}
      {err ? <span className="max-w-xs text-xs text-red-600">{err}</span> : null}
    </span>
  );
}

export function NotificationActions() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(url: string, body: unknown, okMsg: string) {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const data = await postJson(url, body);
      setMsg(data.message || okMsg);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => run("/api/notifications/read", { all: true }, "All marked as read.")} disabled={busy} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50">Mark all read</button>
      <button onClick={() => run("/api/notifications/generate", {}, "Notifications generated.")} disabled={busy} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Generate now</button>
      {msg ? <span className="text-sm text-emerald-700">{msg}</span> : null}
      {err ? <span className="text-sm text-red-600">{err}</span> : null}
    </div>
  );
}

export function NotificationItem({ id, link }: { id: string; link: string | null }) {
  const router = useRouter();
  async function markRead() {
    await postJson("/api/notifications/read", { id }).catch(() => null);
    router.refresh();
  }
  if (!link) return null;
  return <button onClick={markRead} className="text-xs font-semibold text-teal-700">Open →</button>;
}

/* ---------------- Phase 3 — Send Reminder Again ---------------- */

export function SendReminderButton({
  type,
  billId,
  tenantId,
  isOwnerOrAdmin,
  label,
}: {
  type: "rent_due" | "overdue_bill" | "agreement_expiry";
  billId?: string;
  tenantId?: string;
  isOwnerOrAdmin: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [waLink, setWaLink] = useState<string | null>(null);
  const [canOverride, setCanOverride] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(override: boolean) {
    setErr(null); setMsg(null); setWaLink(null); setCanOverride(false); setBusy(true);
    try {
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, billId, tenantId, override }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "Could not send the reminder.");
        if (res.status === 409 && data.canOverride && isOwnerOrAdmin) setCanOverride(true);
        return;
      }
      if (data.provider === "manual" && data.waLink) {
        window.open(data.waLink, "_blank", "noopener,noreferrer");
        setWaLink(data.waLink);
        setMsg(`WhatsApp link generated — send it from your phone. Logged ${new Date(data.lastSentAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`);
      } else {
        setMsg(data.message || "Reminder sent.");
      }
      router.refresh();
    } catch {
      setErr("Could not send the reminder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() => send(false)}
        disabled={busy}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Please wait…" : (label ?? "Send Reminder Again")}
      </button>
      {canOverride ? (
        <button
          onClick={() => send(true)}
          disabled={busy}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Override &amp; resend (Owner/Admin)
        </button>
      ) : null}
      {waLink ? (
        <a href={waLink} target="_blank" rel="noreferrer" className="max-w-xs break-all text-xs font-semibold text-teal-700">
          Open WhatsApp link again →
        </a>
      ) : null}
      {msg ? <span className="max-w-xs text-xs text-emerald-700">{msg}</span> : null}
      {err ? <span className="max-w-xs text-xs text-red-600">{err}</span> : null}
    </span>
  );
}
