import Link from "next/link";
import { ArrowUpRight, Layers3, ShieldCheck, Wallet } from "lucide-react";

const features = [
  {
    icon: Layers3,
    title: "Multi-panel provisioning",
    description: "Create matching subscriptions across connected PasarGuard panels and keep one stable customer link."
  },
  {
    icon: Wallet,
    title: "Accountable balance",
    description: "Reserved funds, immutable transaction history, and reconciliation for uncertain upstream outcomes."
  },
  {
    icon: ShieldCheck,
    title: "Owner-controlled access",
    description: "A dedicated setup flow, protected operations, and encrypted panel credentials."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-10 sm:py-12">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-semibold tracking-tight">
          <span className="grid size-10 place-items-center rounded-xl bg-ink text-white">N</span>
          <span className="text-lg">Neurograsp</span>
        </Link>
        <Link href="/setup" className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700">
          Owner setup <ArrowUpRight size={16} />
        </Link>
      </div>

      <section className="mx-auto max-w-6xl pb-20 pt-20 sm:pt-28">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">Reseller operations platform</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          One control plane.
          <span className="block text-slate-500">Every connected panel.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Neurograsp provisions matching VPN subscriptions across your PasarGuard infrastructure,
          tracks reseller funds with a durable ledger, and serves customers through a stable master link.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/setup" className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">
            Configure owner account
          </Link>
          <a href="https://github.com/artinasd/neurograsp" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-300">
            Repository
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {features.map(({ icon: Icon, title, description }) => (
          <article key={title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-panel">
            <span className="mb-5 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon size={21} />
            </span>
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </article>
        ))}
      </section>

      <footer className="mx-auto mt-20 max-w-6xl border-t border-slate-200 pt-5 text-xs text-slate-500">
        Neurograsp · Secure reseller infrastructure
      </footer>
    </main>
  );
}