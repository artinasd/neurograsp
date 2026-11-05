# Neurograsp

A reseller control plane for multi-panel PasarGuard VPN subscriptions.

## Product model

A master subscription is provisioned with the same username, data quota, expiration, and state across every attached PasarGuard panel. The owner can choose which original panel context is fetched and returned through the stable master URL.

Financial operations use a reserved-balance workflow and durable reconciliation for uncertain upstream results. Subscription delivery preserves the selected PasarGuard response format.

## Current status

- Architecture baseline: documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Application foundation: in progress.
- No production credentials or live panel integrations are included yet.

## Local setup

1. Install Node.js 20+ and npm.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` and configure Upstash Redis and secrets.
4. Start development with `npm run dev`.

## Deployment

Deploy as a Next.js project on Vercel. Use Upstash Redis for durable state. Do not place server secrets in NEXT_PUBLIC variables or commit credentials.

## Scripts

- `npm run dev` — development
- `npm run build` — production build
- `npm run lint` — lint
- `npm run typecheck` — TypeScript validation