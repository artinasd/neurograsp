# Neurograsp — Architecture Baseline

Status: approved baseline for implementation
Repository: https://github.com/artinasd/neurograsp
Reference implementation: https://github.com/artinasd/artiq-network

## Product invariants

1. PasarGuard only is supported as an upstream panel adapter initially.
2. One fixed reseller identity; resellers do not supply panel credentials.
3. A master subscription has a stable username/public URL and references multiple original PasarGuard panels.
4. Creating a subscription provisions the same username, quota, expiration, and status on every attached panel.
5. The owner can select the active upstream context returned to the end user. Switching context does not recreate the master URL.
6. Provisioning is distributed; each upstream attempt has durable state and uncertain outcomes must be reconciled.
7. Funds are reserved before provisioning. Confirmed failures release the reservation; ambiguous outcomes remain reserved until reconciliation.
8. Owner creates initial admin credentials during a one-time setup flow.
9. Volume is decimal GB: 1 GB = 1,000,000,000 bytes.
10. Proxy native PasarGuard subscription response bodies/content types as-is; do not normalize them into app-specific share links.

## Architecture

Modular monolith: Next.js App Router (TypeScript), server route handlers, Tailwind UI, Vercel Functions, Upstash Redis. Avoid dependence on a long-running worker or writable local filesystem.

Suggested modules:
- src/lib/auth: setup state, sessions, password hashing, CSRF/origin policy.
- src/lib/db: Redis access, versioned record codecs, atomic Lua scripts.
- src/lib/panels/pasarguard: API client, version/capability checks, user CRUD and subscription fetch.
- src/lib/panels: typed provider adapter contract.
- src/lib/ledger: wallet, reservations, immutable journal entries, idempotency.
- src/lib/provisioning: orchestration and reconciliation.
- src/lib/subscriptions: stable master URL and active upstream selection.
- src/app/api: owner actions, public subscription proxy, setup endpoints.
- src/app/(admin): owner dashboard, panels, reseller/account, subscriptions, balance, operation history.

## Redis logical schema

Money is stored in integer minor units, never floating-point. Initial logical records:
- ng:meta:v1 — setup completion and schema version.
- ng:admin:v1 — owner metadata; password hash only.
- ng:session:v1:<sessionId> — expiring server-side session.
- ng:panels:v1:<panelId> — encrypted credentials, normalized URL, group config, health/capabilities.
- ng:reseller:v1:<resellerId> — fixed reseller profile/status.
- ng:wallet:v1:<resellerId> — available/reserved integer balance.
- ng:ledger:v1:<entryId> — immutable financial journal entry.
- ng:idem:v1:<key> — idempotency record and operation reference.
- ng:master:v1:<username> — stable subscription, quota bytes, expiry, active panel ID, attached panel IDs.
- ng:operation:v1:<operationId> — durable operation and intended snapshot.
- ng:operation-panel:v1:<operationId>:<panelId> — per-panel state, attempts, remote identity, evidence.
- ng:reconcile:v1:<operationId> — due-time/status index for uncertain operations.

This is a logical schema; Redis hashes/indexes and key patterns may be selected to support atomicity and efficient lookups.

## Funds and provisioning lifecycle

1. Validate request, authorization, price, quota, expiry, attached panels, and idempotency key.
2. In one Redis atomic script, check idempotency and available balance, reserve funds, append a reservation journal entry, and persist the operation plus immutable intended subscription snapshot.
3. Provision every attached panel with the exact same username and values. Before retrying a panel mutation, lookup the exact username and compare intended fields. Never blindly retry an uncertain create.
4. Persist each panel result. Partial success or an unresolved panel leaves the operation pending; do not mark it complete.
5. When every panel is confirmed provisioned, atomically finalize the charge and mark the operation completed.
6. When all panel outcomes are confirmed failed and no remote user remains, release the reservation and journal the release.
7. If the request may have reached PasarGuard but its response is uncertain, keep funds reserved and reconcile. A timeout is not proof of failure.
8. Repairs may retry failed panels or remove confirmed partial remote users; destructive compensation must be explicit and audited.

Redis cannot atomically include an external PasarGuard request. Durability, idempotency, reconciliation, and evidence are required instead of claiming cross-system atomicity.

## Subscription delivery and switching

- Public route /sub/<opaque-token> resolves a token hash to the username and selected upstream panel.
- Preserve the upstream response body/status and selected subscription/profile headers without format conversion.
- Do not relay client Authorization, cookies, or HWID/device headers; native delivery is otherwise not rewritten.
- Switching is allowed only after the exact username and subscription URL are verified on the destination panel. The master token remains stable.
- If selected source is unavailable, return an explicit service error rather than a successful empty config. Default behavior is no silent fallback.
- Current implementation supports one selected panel per master token; multi-panel provisioning and customer creation orchestration are separate and not yet complete.

## Security baseline

- Hash owner password with Argon2id where suitable, otherwise calibrated scrypt.
- Opaque server-side sessions, short-lived and rotated; never persist admin password in browser storage.
- Encrypt panel credentials with AES-256-GCM using a key held in Vercel environment configuration, separate from Redis ciphertext.
- Never expose credentials, password hashes, session secrets, raw subscription URLs, or subscription bodies in logs or client state.
- SSRF defense: HTTPS by default, reject private/local/link-local/reserved IPs, safe DNS resolution and redirects, strict timeouts.
- Rate-limit login/setup/sensitive owner actions and public subscription routes where feasible.
- One-time setup must be race-safe and permanently close after owner creation unless an explicit recovery mechanism exists.
- Financial actions require idempotency keys, immutable journal entries, and reconciliation audit records.

## PasarGuard API compatibility

Endpoints and fields vary by PasarGuard version. On connection setup, verify authentication and required capabilities against that panel's API schema. Prefer supported ID-based user endpoints where username routes are deprecated. Do not treat HTTP success alone as proof of provisioning; verify the exact user and subscription fields. Keep the adapter version-aware and fail closed for unsupported operations.

## Delivery phases

1. Repository/API baseline and reference audit.
2. App foundation, Redis schema, owner first setup, sessions.
3. PasarGuard connections, encrypted credentials, group selection, health/capability validation.
4. Wallet, immutable ledger, atomic reserve/finalize/release, idempotency.
5. Multi-panel provisioning, durable operation states, safe retries, reconciliation.
6. Native subscription proxy and active-panel switching.
7. Owner UI for panels, reseller, wallet/ledger, master subscriptions, operations, audit.
8. Tests, typecheck, lint, production build, deployment and recovery documentation.

## Risks and limitations

- Redis-only persistence needs carefully designed atomic scripts and awareness of Upstash limits.
- Vercel Functions are not durable workers. Reconciliation must be resumable via explicit owner actions or supported scheduled invocation, not in-memory timers.
- Multi-panel remote creation is not truly atomic; partial/uncertain states must be shown honestly.
- API contracts must be tested against the actual PasarGuard version deployed by the owner.
