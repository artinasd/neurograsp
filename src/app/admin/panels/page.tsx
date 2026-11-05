"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Panel = { id: string; name: string; baseUrl: string; groupIds: number[]; createdAt: number; updatedAt: number };
type FormState = { id: string; name: string; baseUrl: string; username: string; password: string; groupIds: string };
const empty: FormState = { id: "", name: "", baseUrl: "", username: "", password: "", groupIds: "" };

export default function PanelsPage() {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [form, setForm] = useState<FormState>(empty);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/panels", { cache: "no-store" });
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json();
    setPanels(body.panels || []);
  }
  useEffect(() => { void refresh(); }, []);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) { setForm(old => ({ ...old, [key]: value })); }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const groupIds = form.groupIds.split(",").map(s => s.trim()).filter(Boolean).map(Number);
    if (groupIds.some(n => !Number.isSafeInteger(n) || n <= 0)) { setMessage("Group IDs must be positive integers separated by commas."); setBusy(false); return; }
    try {
      const response = await fetch("/api/admin/panels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, groupIds }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save connection.");
      setMessage("Panel connection saved. Test it before using it for provisioning.");
      setForm(empty); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }

  async function test(id: string) {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/admin/panels/" + id + "/test", { method: "POST" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setMessage(body.message); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Panel test failed."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this panel connection? This does not delete users from the remote PasarGuard panel.")) return;
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/admin/panels/" + id, { method: "DELETE" }); const body = await response.json(); if (!response.ok) throw new Error(body.error); await refresh(); setMessage("Connection removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Remove failed."); }
    finally { setBusy(false); }
  }

  function edit(panel: Panel) {
    setForm({ id: panel.id, name: panel.name, baseUrl: panel.baseUrl, username: "", password: "", groupIds: panel.groupIds.join(", ") });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex items-center justify-between"><Link href="/admin" className="text-sm font-semibold text-brand-700">← Back to owner dashboard</Link><span className="text-xs text-slate-500">PasarGuard connections</span></header>
    <h1 className="mt-10 text-3xl font-semibold tracking-tight">Panel connections</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Connect upstream PasarGuard instances. Credentials are encrypted at rest and never returned to the browser. Save at least one group ID per panel before provisioning.</p>
    <form onSubmit={save} className="mt-7 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-panel sm:grid-cols-2">
      <h2 className="sm:col-span-2 text-lg font-semibold">{form.id ? "Edit connection" : "Add connection"}</h2>
      <label className="text-sm font-medium">Display name<input required value={form.name} onChange={e => change("name", e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" placeholder="PasarGuard primary" /></label>
      <label className="text-sm font-medium">Panel base URL<input required type="url" value={form.baseUrl} onChange={e => change("baseUrl", e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" placeholder="https://panel.example.com" /></label>
      <label className="text-sm font-medium">Admin username<input autoComplete="username" value={form.username} onChange={e => change("username", e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" placeholder={form.id ? "Leave blank to keep saved value" : "PasarGuard admin"} /></label>
      <label className="text-sm font-medium">Admin password<input autoComplete="new-password" type="password" value={form.password} onChange={e => change("password", e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" placeholder={form.id ? "Leave blank to keep saved value" : "Panel password"} /></label>
      <label className="text-sm font-medium sm:col-span-2">Group IDs (comma-separated)<input value={form.groupIds} onChange={e => change("groupIds", e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" placeholder="1, 3" /></label>
      <div className="flex flex-wrap gap-3 sm:col-span-2"><button disabled={busy} className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : form.id ? "Save changes" : "Add panel"}</button>{form.id && <button type="button" onClick={() => setForm(empty)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm">Cancel edit</button>}</div>
      {message && <p role="status" className="sm:col-span-2 text-sm text-slate-600">{message}</p>}
    </form>
    <section className="mt-8 space-y-3">{panels.map(panel => <article key={panel.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{panel.name}</h2><p className="mt-1 break-all text-sm text-slate-500">{panel.baseUrl}</p><p className="mt-2 text-xs text-slate-500">Group IDs: {panel.groupIds.join(", ") || "Not set"}</p></div><div className="flex gap-2"><button disabled={busy} onClick={() => void test(panel.id)} className="rounded-lg border px-3 py-2 text-sm">Test</button><button disabled={busy} onClick={() => edit(panel)} className="rounded-lg border px-3 py-2 text-sm">Edit</button><button disabled={busy} onClick={() => void remove(panel.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Remove</button></div></div></article>)}
      {!panels.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No panel connections yet.</p>}</section>
  </div></main>;
}
