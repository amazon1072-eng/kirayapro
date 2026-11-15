"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MaintenanceStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(next: string) {
    setBusy(true);
    await fetch(`/api/maintenance/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <select value={status} disabled={busy} onChange={(e) => change(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
      {["Pending", "Assigned", "In Progress", "Completed", "Rejected"].map((s) => <option key={s}>{s}</option>)}
    </select>
  );
}
