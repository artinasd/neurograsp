import { redirect } from "next/navigation";
import Link from "next/link";
import { Layers3, ShieldCheck, Wallet, Activity, ArrowUpRight } from "lucide-react";
import { getOwnerSession } from "@/lib/auth/session";

const sections = [
  { icon: Layers3, title: "PasarGuard panels", description: "Connect original panels, configure groups, and test access.", status: "Integration phase" },
  { icon: Wallet, title: "Reseller balance", description: "Available funds, reserved funds, and immutable transaction history.", status: "Ledger phase" },
  { icon: Activity, title: "Provisioning operations", description: "Track each panel outcome and reconcile uncertain operations.", status: "Provisioning phase" },
  { icon: ShieldCheck, title: "Master subscriptions", description: "Stable customer links with an owner-controlled active panel.", status: "Subscription phase" }
];

export default async function AdminPage() {
  const session = await getOwnerSession();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <a href="/" className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-ink text-white">N</span>
          Neurograsp <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">Owner</span>
        </a>
        <form action="/api/auth/logout" method="post">
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Sign out</button>
        </form>
      </header>

      <section className="mx-auto max-w-6xl pt-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Control center</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Owner dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The app foundation is in place. Core infrastructure modules are being delivered in the next milestones.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {sections.map(({ icon: Icon, title, description, status }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon size={21} /></span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{status}</span>
              </div>
              <h2 className="mt-5 text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              {title === "PasarGuard panels" ? <Link href="/admin/panels" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Manage panel connections <ArrowUpRight size={14} /></Link> : title === "Provisioning operations" ? <Link href="/admin/operations" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Review operations <ArrowUpRight size={14} /></Link> : title === "Master subscriptions" ? <Link href="/admin/subscriptions" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Manage customer links <ArrowUpRight size={14} /></Link> : title === "Reseller balance" ? <Link href="/admin/wallet" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Manage wallet & ledger <ArrowUpRight size={14} /></Link> : <div className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-slate-400">Not available yet <ArrowUpRight size={14} /></div>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}