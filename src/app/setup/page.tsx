"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";

export default function SetupPage() {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/setup", { cache: "no-store" })
      .then(response => response.json())
      .then(data => setSetupRequired(Boolean(data.setupRequired)))
      .catch(() => setError("Unable to check setup status. Please try again."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Setup failed.");
        return;
      }
      window.location.assign(data.redirectTo || "/admin");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-panel sm:p-9">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft size={16} /> Neurograsp
        </Link>
        <span className="mb-5 grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <LockKeyhole size={22} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Create owner account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Set up the administrator account. This one-time step closes after the owner is created.
        </p>

        {setupRequired === false ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-medium"><CheckCircle2 size={17} /> Setup is already complete.</div>
            <p className="mt-1">The initial owner account has already been configured.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Owner username
              <input value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9_-]+" required autoComplete="username" className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={128} required autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
              <span className="mt-1 block text-xs font-normal text-slate-500">At least 12 characters.</span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirm password
              <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required autoComplete="new-password" className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button disabled={busy || setupRequired !== true} className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "Creating account…" : "Create owner account"}
            </button>
          </form>
        )}
        {setupRequired === null && <p className="mt-5 text-sm text-slate-500">Checking setup status…</p>}
        {error && setupRequired === false && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      </section>
    </main>
  );
}