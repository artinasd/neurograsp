# Panel connection security

- Credentials are encrypted using AES-256-GCM. Set `PANEL_CREDENTIALS_ENCRYPTION_KEY` to base64 encoding of 32 random bytes (for example `openssl rand -base64 32`). Keep it stable and private; changing it makes stored credentials unreadable.
- Panel endpoints require HTTPS and are screened against local/private DNS destinations. Redirects are rejected.
- Admin credentials are used to obtain a short-lived PasarGuard API token for a non-mutating user-list check. Tokens are not stored or returned to the browser.
- Current test validates authentication and the user-list endpoint; it does not perform a user create/delete.
- This is an initial SSRF barrier, not a substitute for network-level egress controls. Avoid connecting arbitrary hosts in production.
