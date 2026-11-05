"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Panel = { id: string; name: string };
type Operation = { id: string; username: string; state: string };
const defaultExpiry = () => {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function NewProvisioningPage() {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reservationId, setReservationId] = useState("");
  const [username, setUsername] = useState("");
  const [quotaGb, setQuotaGb] = useState("100");
  const [expireAt, setExpireAt] = useState(defaultExpiry);
  const [note, setNote] = useState("Managed by Neurograsp");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromWallet = new URLSearchParams(window.location.search).get("reservationId");
    if (fromWallet) setReservationId(fromWallet);
    fetch("/api/admin/panels", { cache: "no-store" }).then(async response => {
      if (response.status === 401) { window.location.href = "/login"; return; }
      const body = await response.json();
      const rows = body.panels || [];
      setPanels(rows);
      setSelected(rows.map((panel: Panel) => panel.id));
    }).catch(() => setMessage("Could not load panel connections."));
  }, []);

  const valid = useMemo(() => Boolean(reservationId.trim() && /^[A-Za-z0-9_-]{3,64}$/.test(username.trim()) &&
    Number(quotaGb) > 0 && Number.isFinite(Number(quotaGb)) && selected.length > 0 && expireAt && Date.parse(expireAt) > Date.now()), [reservationId, username, quotaGb, selected, expireAt]);

  function toggle(id: string, checked: boolean) {
    setSelected(current => checked ? [...current, id] : current.filter(item => item !== id));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true); setMessage(""); setUrl(""); setOperation(null);
    const idempotencyKey = "ng-order-" + crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey,
          reservationId: reservationId.trim(),
          username: username.trim(),
          dataQuotaGb: Number(quotaGb),
          expireAt: Math.floor(Date.parse(expireAt) / 1000),
          panelIds: selected,
          note: note.trim()
        })
      });
      const body = await response.json();
      if (body.operation) setOperation(body.operation);
      if (body.url) setUrl(body.url);
      if (!response.ok && response.status !== 202) throw new Error(body.error || "Provisioning did not complete.");
      setMessage(response.status === 200 ? "Provisioning verified on all selected panels. The stable master URL is ready." : "Operation was accepted but is not fully confirmed yet. Review and reconcile the operation before sharing a link.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Provisioning request failed."); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage("Customer URL copied."); }
    catch { setMessage("Clipboard access was blocked; copy the URL manually."); }
  }

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-4xl">
    <header className="flex items-center justify-between"><Link href="/admin/operations" className="text-sm font-semibold text-brand-700">← Back to operations</Link><span className="text-xs text-slate-500">New provision</span></header>
    <h1 className="mt-10 text-3xl font-semibold tracking-tight">Provision customer</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This creates and verifies the same account on each selected PasarGuard panel. On complete success, Neurograsp issues one stable subscription URL. A wallet reservation must already exist.</p>
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <label className="block text-sm font-medium">Wallet reservation ID<input required value={reservationId} onChange={e => setReservationId(e.target.value)} placeholder="UUID of an existing reserved amount" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Username<input required minLength={3} maxLength={64} pattern="[A-Za-z0-9_-]+" value={username} onChange={e => setUsername(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium">Quota (decimal GB)<input required type="number" min="0.000000001" max="10000" step="any" value={quotaGb} onChange={e => setQuotaGb(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium">Expires at<input required type="datetime-local" value={expireAt} onChange={e => setExpireAt(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium">Remote note<input maxLength={240} value={note} onChange={e => setNote(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
      </div>
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">Attach PasarGuard panels</legend>{panels.map(panel => <label key={panel.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={selected.includes(panel.id)} onChange={e => toggle(panel.id, e.target.checked)} />{panel.name}<span className="ml-auto text-xs text-slate-500">{panel.id}</span></label>)}{!panels.length && <p className="text-sm text-amber-700">No panel connections found. Add and test a panel first.</p>}</fieldset>
      <button disabled={busy || !valid || !panels.length} className="w-full rounded-lg bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Provisioning…" : "Provision & issue master link"}</button>
    </form>
    {message && <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>}
    {url && <section className="mt-4 rounded-xl border border-brand-200 bg-white p-4"><h2 className="font-semibold">Customer master URL</h2><p className="mt-2 break-all rounded-lg bg-slate-50 p-3 text-sm">{url}</p><button onClick={() => void copy()} className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold">Copy URL</button><p className="mt-2 text-xs text-slate-500">Store this secret URL securely. If exposed, rotate it from Master subscriptions.</p></section>}
    {operation && <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold">Operation: {operation.state}</p><p className="mt-1 break-all text-xs text-slate-500">{operation.id}</p><Link href={"/admin/operations"} className="mt-3 inline-flex text-sm font-semibold text-brand-700">Open operation review →</Link></section>}
  </div></main>;
}
