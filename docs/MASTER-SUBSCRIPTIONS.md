# Master subscription milestone

## Owner workflow

- Visit `/admin/subscriptions`.
- Provision a customer from `/admin/provision/new`, using an existing wallet reservation and selecting the panels to attach.
- The provisioning runner creates/verifies the exact same username, quota, expiration, and status on every selected PasarGuard panel.
- Once all panels are confirmed, the system creates a master subscription record keyed to the operation idempotently and returns the stable URL.
- The master record tracks its attached panel IDs and one active panel. Switching is permitted only among attached panels after the exact user and native subscription URL are verified.
- A master link can also be created for an already-existing exact user from `/admin/subscriptions`.
- The public route is `/sub/<opaque-token>`. The token hash is used for lookup; an encrypted token is retained server-side to support safe retries of a completed operation. The plaintext is never returned in subscription list responses.
- The URL is returned on successful provisioning or reconciliation. Rotating revokes the previous token.

## Native delivery behavior

The public handler fetches the selected PasarGuard subscription URL and relays the response stream/status with an allowlist of subscription headers. It does not decode, re-encode, merge, or convert VLESS/VMess/JSON/Base64/other native payloads. It does not relay cookies or Authorization. Optional PasarGuard identity headers (`x-hwid`, `x-device-os`, `x-ver-os`, `x-device-model`) are forwarded as received so any HWID policy remains upstream-controlled.

The subscription URL must be HTTPS and share the configured panel origin; redirects are rejected. This is intentionally restrictive and may need a documented origin allowlist if a deployed PasarGuard installation serves subscriptions from a separate host.

## Current limitations and checks

- Each master URL has one selected upstream at a time. Provisioning coordinates creation and read-back verification across the selected attached panels; it does not yet provide an owner-facing wallet reservation/funding flow.
- The public handler currently does not aggregate usage metadata across panels; it relays selected upstream subscription headers.
- No rate-limit or abuse-control layer has been added to the public route yet.
- No build, lint, typecheck, or live PasarGuard verification has been run in this environment.
