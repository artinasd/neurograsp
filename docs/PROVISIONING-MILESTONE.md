# Provisioning milestone notes

The current owner-only entry point is `POST /api/admin/provision`.

Request shape:
- `idempotencyKey`: client-supplied stable key for retries.
- `reservationId`: an existing wallet reservation in `reserved` state.
- `username`: allowed ASCII identifier.
- `dataQuotaGb`: decimal GB; converted with 1,000,000,000 bytes per GB.
- `expireAt`: future Unix timestamp in seconds.
- `panelIds`: distinct, configured PasarGuard connection IDs.
- `note`: optional bounded note.

The API writes a durable operation and per-panel result state before invoking the adapter. The adapter searches by exact username first; if a matching user already exists, its quota, expiration, and status are compared with the intended snapshot. A mismatched existing user is marked for review rather than overwritten. After create, it reads the user again to verify the result.

A transport timeout, verification uncertainty, or upstream HTTP 5xx is not treated as a confirmed failure. Those states keep the wallet reservation open. Only confirmed full success commits; only all-confirmed-failure releases. Partial or uncertain outcomes require an explicit retry/reconciliation workflow.

## Current limitations

- PasarGuard schema details differ by deployed version; validate the user-list response and expiry/quota field representation against the actual owner panel before real provisioning.
- The API runner is synchronous within a request and may exceed serverless execution limits with many panels. Production flow should move into a resumable, scheduled or explicitly invoked reconciliation mechanism.
- No pricing UI, wallet funding path, operation listing UI, or user-facing master subscription route is complete yet.
- Build, lint, and typecheck have not been run in this environment.
