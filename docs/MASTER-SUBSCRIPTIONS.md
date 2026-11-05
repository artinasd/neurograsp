# Master subscription milestone

## Owner workflow

- Visit `/admin/subscriptions`.
- Create a link for an exact PasarGuard username and choose a connected panel.
- The API verifies that the exact user exists and exposes a supported native subscription URL.
- The public route is `/sub/<opaque-token>`; only the SHA-256 token hash is retained in the master-subscription record.
- The URL is returned only when created or rotated. Rotating revokes the old token.
- The owner can switch the active source only after the exact username and subscription URL are verified on the destination panel.

## Native delivery behavior

The public handler fetches the selected PasarGuard subscription URL and relays the response stream/status with an allowlist of subscription headers. It does not decode, re-encode, merge, or convert VLESS/VMess/JSON/Base64/other native payloads. It does not relay cookies or Authorization. Optional PasarGuard identity headers (`x-hwid`, `x-device-os`, `x-ver-os`, `x-device-model`) are forwarded as received so any HWID policy remains upstream-controlled.

The subscription URL must be HTTPS and share the configured panel origin; redirects are rejected. This is intentionally restrictive and may need a documented origin allowlist if a deployed PasarGuard installation serves subscriptions from a separate host.

## Current limitations and checks

- Each master URL has one selected upstream at a time. The UI verifies a user on the chosen panel, but does not yet coordinate creation on all attached panels.
- The public handler currently does not aggregate usage metadata across panels; it relays selected upstream subscription headers.
- No rate-limit or abuse-control layer has been added to the public route yet.
- No build, lint, typecheck, or live PasarGuard verification has been run in this environment.
