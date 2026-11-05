"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Panel = { id: string; name: string };
type Subscription = { id: string; username: string; panelId: string; createdAt: number; updatedAt: number };

export default function MasterSubscriptionsPage() {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [username, setUsername] = useState("");
  const [panelId, setPanelId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async function refresh() {
    const [panelResponse, subscriptionResponse] = await Promise.all([
      fetch("/api/admin/panels", { cache: "no-store" }),
      fetch("/api/admin/subscriptions", { cache: "no-store" })
    ]);
    if (panelResponse.status === 401 || subscriptionResponse.status === 401) { window.location.href = "/login"; return; }
    const [panelBody, subscriptionBody] = await Promise.all([panelResponse.json(), subscriptionResponse.json()]);
    const panelList = panelBody.panels || [];
    setPanels(panelList);
    setSubscriptions(subscriptionBody.subscriptions || []);
    if (!panelId && panelList[0]) setPanelId(panelList[0].id);
  }, [panelId]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setNewUrl("");
    try {
      const response = await fetch("/api/admin/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), panelId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not create master link.");
      setNewUrl(body.url); setUsername(""); setMessage("Link created. Copy and save it now; the secret URL is not shown again.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Creation failed."); }
    finally { setBusy(false); }
  }

  async function changePanel(subscription: Subscription, nextPanelId: string) {
    if (nextPanelId === subscription.panelId) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/subscriptions/" + encodeURIComponent(subscription.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ panelId: nextPanelId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not switch panel.");
      setMessage("Active upstream panel switched. The customer's master URL stays the same.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Panel switch failed."); }
    finally { setBusy(false); }
  }


  async function rotate(subscription: Subscription) {
    if (!window.confirm("Rotate this secret URL? The current customer link will stop working immediately.")) return;
    setBusy(true); setMessage(""); setNewUrl("");
    try {
      const response = await fetch("/api/admin/subscriptions/" + encodeURIComponent(subscription.id) + "/rotate", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not rotate link.");
      setNewUrl(body.url);
      setMessage("Link rotated. The previous token has been revoked. Copy and save the new URL.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Rotation failed."); }
    finally { setBusy(false); }
  }

  async function remove(subscription: Subscription) {
    if (!window.confirm("Delete this master subscription and immediately revoke its customer URL?")) return;
    setBusy(true); setMessage(""); setNewUrl("");
    try {
      const response = await fetch("/api/admin/subscriptions/" + encodeURIComponent(subscription.id), { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not delete master subscription.");
      setMessage("Master subscription deleted; its secret URL has been revoked.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Deletion failed."); }
    finally { setBusy(false); }
  }

  async function copyUrl() {
    try { await navigator.clipboard.writeText(newUrl); setMessage("Master subscription URL copied."); }
    catch { setMessage("Copy was blocked by the browser. Select and copy the URL manually."); }
  }

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex items-center justify-between"><Link href="/admin" className="text-sm font-semibold text-brand-700">← Back to owner dashboard</Link><span className="text-xs text-slate-500">Master subscriptions</span></header>
    <h1 className="mt-10 text-3xl font-semibold tracking-tight">Stable customer links</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Create a private URL for a username already provisioned on a PasarGuard panel. The route relays the selected panel&apos;s original response body and supported subscription headers without format conversion.</p>
    <form onSubmit={create} className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      <label className="text-sm font-medium">Exact PasarGuard username<input required minLength={3} maxLength={64} pattern="[A-Za-z0-9_-]+" value={username} onChange={e => setUsername(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" placeholder="customer_123" /></label>
      <label className="text-sm font-medium">Initial active panel<select required value={panelId} onChange={e => setPanelId(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal">{panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}</select></label>
      <button disabled={busy || !panels.length || !username.trim()} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{busy ? "Working…" : "Create master link"}</button>
    </form>
    {newUrl && <section className="mt-4 rounded-xl border border-brand-200 bg-white p-4"><p className="text-sm font-semibold">New secret URL — save it now</p><div className="mt-2 break-all rounded-lg bg-slate-50 p-3 text-sm">{newUrl}</div><button onClick={() => void copyUrl()} className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold">Copy URL</button></section>}
    {message && <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>}
    <section className="mt-8 space-y-3">{subscriptions.map(subscription => <article key={subscription.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{subscription.username}</h2><p className="mt-1 text-xs text-slate-500">Created {new Date(subscription.createdAt).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Secret token is stored as a hash; use rotate to revoke and issue a replacement link.</p></div><div className="flex flex-wrap items-end gap-3"><label className="text-xs font-medium text-slate-600">Active source<select disabled={busy} value={subscription.panelId} onChange={e => void changePanel(subscription, e.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm">{panels.map(panel => <option key={panel.id} value={panel.id}>{panel.name}</option>)}</select></label><button disabled={busy} onClick={() => void rotate(subscription)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Rotate link</button><button disabled={busy} onClick={() => void remove(subscription)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Delete link</button></div></div></article>)}
      {!subscriptions.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No master subscriptions yet.</p>}</section>
  </div></main>;
}
