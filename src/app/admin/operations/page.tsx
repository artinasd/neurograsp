"use client";

import { useState } from "react";
import Link from "next/link";

type Operation = {
  id: string;
  username: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  panelIds: string[];
  results: Record<string, { panelId: string; state: string; attemptCount: number; remoteId?: string; evidence?: string; errorCode?: string }>;
};

export default function OperationsPage() {
  const [id, setId] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!id.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/operations/" + encodeURIComponent(id.trim()), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load operation.");
      setOperation(body.operation);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Load failed."); }
    finally { setBusy(false); }
  }

  async function reconcile() {
    if (!operation) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/operations/" + encodeURIComponent(operation.id) + "/reconcile", { method: "POST" });
      const body = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(body.error || "Reconciliation failed.");
      if (body.operation) setOperation(body.operation);
      setMessage(response.status === 409 ? (body.error || "Operation is already final or currently locked.") : "Reconciliation completed. Review every panel result below.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Reconciliation failed."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex items-center justify-between"><Link href="/admin" className="text-sm font-semibold text-brand-700">← Back to owner dashboard</Link><span className="text-xs text-slate-500">Provisioning operations</span></header>
    <h1 className="mt-10 text-3xl font-semibold tracking-tight">Operation review</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Look up an operation by its ID. Reconcile only after reviewing the remote outcome; unresolved reservations remain held.</p>
    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row">
      <input value={id} onChange={e => setId(e.target.value)} placeholder="Provisioning operation UUID" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
      <button disabled={busy || !id.trim()} onClick={() => void load()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Load operation"}</button>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>}
    {operation && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{operation.username}</h2><p className="mt-1 break-all text-xs text-slate-500">{operation.id}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold">{operation.state}</span></div>
      <p className="mt-3 text-xs text-slate-500">Created: {new Date(operation.createdAt).toLocaleString()}</p>
      <div className="mt-5 space-y-3">{operation.panelIds.map(panelId => { const result = operation!.results[panelId]; return <article key={panelId} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><span className="break-all text-sm font-medium">{panelId}</span><span className="text-xs font-semibold">{result?.state || "unknown"} · attempts {result?.attemptCount ?? 0}</span></div>{result?.remoteId && <p className="mt-2 text-xs text-slate-500">Remote user ID: {result.remoteId}</p>}{result?.errorCode && <p className="mt-2 text-xs text-red-700">Error: {result.errorCode}</p>}{result?.evidence && <p className="mt-2 text-sm leading-5 text-slate-600">{result.evidence}</p>}</article>; })}</div>
      {operation.state !== "completed" && operation.state !== "failed" && <button disabled={busy} onClick={() => void reconcile()} className="mt-5 rounded-lg border border-brand-200 px-4 py-2.5 text-sm font-semibold text-brand-700 disabled:opacity-50">{busy ? "Working…" : "Reconcile operation"}</button>}
    </section>}
  </div></main>;
}
