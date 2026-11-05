"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Wallet = { resellerId: string; availableMinor: number; reservedMinor: number; spentMinor: number };
type Entry = { id: string; kind: string; amountMinor: number; memo: string; createdAt: number; idempotencyKey: string };
type Reservation = { id: string; amountMinor: number; state: string; memo: string };

const formatMinor = (value: number) => value.toLocaleString() + " minor units";

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [fundAmount, setFundAmount] = useState("1000000");
  const [reserveAmount, setReserveAmount] = useState("100000");
  const [fundMemo, setFundMemo] = useState("Owner manual wallet credit");
  const [reserveMemo, setReserveMemo] = useState("Reserved for customer provisioning");
  const [fundKey, setFundKey] = useState("");
  const [reserveKey, setReserveKey] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/wallet", { cache: "no-store" });
    if (response.status === 401) { window.location.href = "/login"; return; }
    const body = await response.json();
    setWallet(body.wallet);
    setEntries(body.entries || []);
  }
  useEffect(() => { void refresh().catch(() => setMessage("Could not load wallet.")); }, []);

  async function action(type: "fund" | "reserve") {
    const amountMinor = Number(type === "fund" ? fundAmount : reserveAmount);
    const memo = type === "fund" ? fundMemo.trim() : reserveMemo.trim();
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !memo) { setMessage("Enter a positive whole-number amount in minor units and a memo."); return; }
    setBusy(true); setMessage("");
    const idempotencyKey = (type === "fund" ? fundKey : reserveKey) || "wallet-" + type + "-" + crypto.randomUUID();
    if (type === "fund") setFundKey(idempotencyKey); else setReserveKey(idempotencyKey);
    try {
      const response = await fetch("/api/admin/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: type, amountMinor, memo, idempotencyKey })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Wallet action failed.");
      if (type === "reserve") { setReservation(body.reservation); setReserveKey(""); } else setFundKey("");
      setMessage(type === "fund" ? "Wallet credited and journal entry recorded." : "Funds reserved. Use this reservation ID for provisioning.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Wallet action failed."); }
    finally { setBusy(false); }
  }

  async function copyReservation() {
    if (!reservation) return;
    try { await navigator.clipboard.writeText(reservation.id); setMessage("Reservation ID copied."); }
    catch { setMessage("Clipboard access blocked; copy the reservation ID manually."); }
  }

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex items-center justify-between"><Link href="/admin" className="text-sm font-semibold text-brand-700">← Back to owner dashboard</Link><Link href="/admin/provision/new" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Provision customer</Link></header>
    <h1 className="mt-10 text-3xl font-semibold tracking-tight">Reseller wallet</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This owner-only wallet uses integer minor units. Manual credits are audited as immutable funding entries. Reserve an amount before creating a customer. Confirm the currency denomination in your operating policy before using real balances.</p>
    {wallet && <div className="mt-6 grid gap-3 sm:grid-cols-3">{[["Available",wallet.availableMinor],["Reserved",wallet.reservedMinor],["Spent",wallet.spentMinor]].map(([label,value])=><article key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{Number(value).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">minor units</p></article>)}</div>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold">Manual credit</h2><p className="mt-1 text-sm text-slate-500">Use only for owner-recorded funding/adjustments.</p><label className="mt-4 block text-sm font-medium">Amount (minor units)<input type="number" min="1" step="1" value={fundAmount} onChange={e => { setFundAmount(e.target.value); setFundKey(""); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label><label className="mt-3 block text-sm font-medium">Memo<input maxLength={240} value={fundMemo} onChange={e => { setFundMemo(e.target.value); setFundKey(""); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label><button disabled={busy} onClick={() => void action("fund")} className="mt-4 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy ? "Working…" : "Credit wallet"}</button></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-base font-semibold">Reserve for an order</h2><p className="mt-1 text-sm text-slate-500">Move available funds into a reservation before provisioning.</p><label className="mt-4 block text-sm font-medium">Amount (minor units)<input type="number" min="1" step="1" value={reserveAmount} onChange={e => { setReserveAmount(e.target.value); setReserveKey(""); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label><label className="mt-3 block text-sm font-medium">Memo<input maxLength={240} value={reserveMemo} onChange={e => { setReserveMemo(e.target.value); setReserveKey(""); }} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label><button disabled={busy} onClick={() => void action("reserve")} className="mt-4 w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Reserve funds"}</button></section>
    </div>
    {reservation && <section className="mt-4 rounded-xl border border-brand-200 bg-white p-4"><p className="text-sm font-semibold">Reservation ready · {formatMinor(reservation.amountMinor)}</p><p className="mt-2 break-all rounded-lg bg-slate-50 p-3 text-sm">{reservation.id}</p><div className="mt-3 flex flex-wrap gap-3"><button onClick={() => void copyReservation()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Copy reservation ID</button><Link href={"/admin/provision/new?reservationId=" + encodeURIComponent(reservation.id)} className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">Use for provisioning</Link></div></section>}
    {message && <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>}
    <section className="mt-8"><h2 className="text-lg font-semibold">Immutable ledger history</h2><div className="mt-3 space-y-2">{entries.map(entry=><article key={entry.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><div><p className="text-sm font-semibold capitalize">{entry.kind}</p><p className="mt-1 text-sm text-slate-600">{entry.memo}</p><p className="mt-1 break-all text-xs text-slate-400">{entry.id}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{formatMinor(entry.amountMinor)}</p><p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p></div></article>)}{!entries.length && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No ledger entries yet.</p>}</div></section>
  </div></main>;
}
