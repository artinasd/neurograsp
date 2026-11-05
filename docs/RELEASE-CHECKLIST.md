# Pre-deployment validation checklist

Do not connect live customer orders until these checks pass against a non-production PasarGuard test account.

## Configuration

- [ ] Set `APP_URL` to the exact public HTTPS origin.
- [ ] Set Upstash Redis credentials and a stable 32-byte base64 AES key.
- [ ] Complete one-time owner setup; confirm unauthenticated owner APIs return 401.
- [ ] Add each PasarGuard panel with its correct API base URL, credentials, and group IDs; run the connection test.

## Wallet and ledger

- [ ] Confirm the operator has selected a currency and its minor-unit scale.
- [ ] Add a small manual test credit and confirm the available balance and funding journal entry.
- [ ] Reserve part of the balance; confirm available decreases and reserved increases.
- [ ] Retry a reservation with the same idempotency key and exact payload; verify no duplicate reservation.
- [ ] Reuse an idempotency key with a different amount or memo; verify rejection.
- [ ] Confirm a release restores available funds and a commit moves reserved funds into spent.

## Multi-panel provisioning

- [ ] Use a test username and attach two test PasarGuard panels.
- [ ] Verify the exact username, quota in decimal GB, expiration, active status, and configured group IDs on both panels.
- [ ] Confirm successful read-back results are persisted per panel.
- [ ] Test a mismatched existing username: the runner must flag review and must not overwrite.
- [ ] Test a simulated timeout after remote create; reconciliation must inspect exact username before retrying.
- [ ] Retry the same operation idempotency key and request; verify it does not create a second operation.
- [ ] Confirm a changed payload with the same idempotency key is rejected.

## Customer URL

- [ ] Compare the returned subscription body and content-type/profile headers with the selected upstream for each supported client format.
- [ ] Confirm the payload is not decoded, re-encoded, converted, or merged.
- [ ] Verify the active-panel switch changes the upstream response while keeping the customer URL unchanged.
- [ ] Verify switching to a panel not attached to the customer is rejected.
- [ ] Rotate the secret link; confirm the old URL returns 404 and the new URL works.
- [ ] Confirm upstream HWID policy remains in control; Neurograsp does not add or enforce an HWID limit.

## Release gate

- [ ] Run `npm install`, `npm run typecheck`, `npm run lint`, and `npm run build` from the repository.
- [ ] Review deployment logs for secret/token leakage.
- [ ] Add public-route rate limiting/abuse monitoring before broad customer rollout.
- [ ] Validate SSRF protections against the deployed network topology, including DNS changes/rebinding and public-to-private resolution changes; current validation rejects known non-public IPv4 ranges and IPv6 destinations, but hostname resolution is not pinned to the validated IP for the outbound connection.
- [ ] Confirm the panel's DNS answers remain public between configuration validation and every upstream request; for a stronger SSRF guarantee, use a custom HTTP dispatcher/agent that pins the validated public address while preserving TLS hostname verification.
