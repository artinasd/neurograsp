# PasarGuard Integration Notes

This document captures the first API compatibility pass. It is not a claim that every PasarGuard release has the same schema; the deployed panel's own API/OpenAPI schema must be checked when a connection is configured.

## Reference behavior in artiq-network

The reference integration currently:
- obtains an admin access token with POST /api/admin/token using form-encoded credentials;
- searches users through GET /api/users with search, limit, and offset;
- creates a user through POST /api/user with username, status, data_limit (bytes), expire (ISO timestamp), group_ids, and note;
- resolves the created user's subscription_url;
- updates/deletes using /api/user/by-id/{user_id} after exact username lookup.

Reference source: https://github.com/artinasd/artiq-network/blob/main/src/lib/pasarguard.ts

Neurograsp must improve the operation durability around these calls and verify remote state before treating a mutation as completed.

## Version compatibility

PasarGuard's official deprecation announcement says that username-based user API routes are no longer the default in v5 and recommends /api/user/by-id/{user_id}; it notes a future route change to /api/user/{id}. The adapter must keep route resolution/capability behavior version-aware rather than hardcoding a username mutation route.

Official announcement: https://github.com/PasarGuard/panel/discussions/457

## Template support

Official PasarGuard documentation describes POST /api/user/from_template and PUT /api/user/{username}/from_template. Templates can supply group IDs, data limit, expiration duration, status, reset strategy, and supported protocol settings. Neurograsp's first provisioning implementation should use direct user creation only when it can reliably apply the exact intended subscription snapshot across all attached panels. Template support may be exposed later as a validated panel capability.

Official docs: https://docs.pasarguard.org/en/panel/user_template/

## Subscription response requirements

The end-user subscription route must return the selected panel's native response body and relevant content-type/profile metadata without converting it to a synthesized URI list. The selected source panel must be confirmed to contain the exact matching username and provisioned quota/expiration before an owner can switch to it.

## Capability validation checklist

When connecting a panel:
1. Validate the base URL and outbound destination.
2. Authenticate without exposing credentials or tokens.
3. Retrieve the installed API schema/capabilities where available.
4. Verify list/search users, create user, read exact user, ID-based update/delete, and subscription fetch operations required by the app.
5. Record detected compatibility information and test a non-mutating health operation.
6. Do not create a paid user merely to test connection validity.

## Official references

- Features and subscription format support: https://docs.pasarguard.org/en/panel/features/
- User template API and fields: https://docs.pasarguard.org/en/panel/user_template/
- API deprecation notice: https://github.com/PasarGuard/panel/discussions/457
