"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Login failed.");
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
        <Link href="/" className="mb-8 inline-flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-ink text-white">N</span> Neurograsp
        </Link>
        <span className="mb-5 grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <LockKeyhole size={22} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Owner sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Sign in to manage reseller operations and connected panels.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}