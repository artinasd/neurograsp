# Provisioning milestone notes

The owner-only entry point is `POST /api/admin/provision`; an existing operation can be inspected with `GET /api/admin/operations/:id` and reconciled using `POST /api/admin/operations/:id/reconcile`.

Provision request fields:
- `idempotencyKey`: stable client key for retries; reusing it with a different request payload is rejected.
- `reservationId`: existing wallet reservation in `reserved` state.
- `username`: allowed ASCII identifier.
- `dataQuotaGb`: decimal GB; converted with 1,000,000,000 bytes per GB.
- `expireAt`: future Unix timestamp in seconds.
- `panelIds`: distinct configured PasarGuard connection IDs.
- `note`: optional bounded note.

The operation and each panel's state are persisted before invoking the adapter. Redis operation locks prevent two route requests from running the same operation concurrently. The adapter searches by exact username first; if a matching user exists, its quota, expiration, and status are compared against the intended snapshot. A mismatched existing user is flagged for review rather than overwritten. After create, the adapter reads the user again to verify it.

A transport timeout, verification uncertainty, or upstream HTTP 5xx is not treated as a confirmed failure. Those outcomes leave the wallet reservation open for reconciliation. Confirmed full success commits; only all-panel confirmed failures release. Partial or uncertain outcomes require an explicit reconciliation workflow.

## Current limitations

- PasarGuard schema details can vary by deployed version; validate list response and quota/expiry representation against the actual owner panel before real provisioning.
- The runner is synchronous within a request and may exceed serverless execution limits with many panels. Production should move into a resumable worker or scheduled reconciliation mechanism.
- The lock expires after 180 seconds; this must exceed configured request timeouts and should be revisited if workflows are extended.
- No pricing UI, wallet funding path, operations dashboard, or customer-facing master subscription route is complete yet.
- Build, lint, and typecheck have not been run in this environment.
