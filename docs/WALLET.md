# Owner wallet operations

The fixed reseller identity is `neurograsp-owner-reseller-v1`. It is not selectable from the browser.

## Owner UI and API

- Owner page: `/admin/wallet`
- `GET /api/admin/wallet`: returns the wallet snapshot and ledger entries.
- `POST /api/admin/wallet` with `action: "fund"`: records an owner-entered manual credit.
- `POST /api/admin/wallet` with `action: "reserve"`: moves available funds to a reservation and returns its ID.
- `POST /api/admin/provision`: accepts that reservation ID and only provisions when the reservation is still held.

All amounts are positive safe integers in **minor units**. The project has not fixed a currency denomination in code. Do not use real balances until the operator decides the currency and confirms its minor-unit scale.

Funding, reservation, commit, and release are recorded in the immutable ledger hash. Redis Lua scripts atomically update wallet balances and ledger entries; funding and reservation calls require idempotency keys. Reservation IDs are deterministically derived from the request idempotency key so retrying an uncertain reserve request does not create a second reservation.

Manual credit is an owner-controlled accounting entry, not a payment gateway or proof that money was received. Funding integrations and audit review policy remain separate work.
