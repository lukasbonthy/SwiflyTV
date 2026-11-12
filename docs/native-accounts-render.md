# SwiflyTV first-party account deployment on Render

SwiflyTV handles signup, login, passwords, sessions, profile data, friends and messages on its **own Node.js backend**. Login does **not** use Google, Firebase, Supabase Auth or any third-party identity provider.

## Durable storage is mandatory

Do not store accounts in the service's default filesystem: Render replaces that filesystem during deploys and restarts.

Connect exactly one:
- **Render Postgres (recommended):** In the Render dashboard, create a Postgres instance in the same region as the web service, then supply its internal connection URL as the web service's secret environment variable `DATABASE_URL`. The server creates the `swifly_account_state` table automatically. Never paste the URL into GitHub, client code, logs, or a support message.
- **A separately mounted persistent disk:** Set `SWIFLY_DATA_DIR` to a mounted private directory; works for a **single server** only.

**Render Free Postgres expires after 30 days and is deleted after the grace period without an upgrade. Never use it for lasting real accounts.** Choose a durable paid database with backups for production, and check its current price before confirming any purchase.

The web service already uses Render's proxy and port settings. No third-party authentication settings are needed. Re-deploy after adding the storage variable.

## Security behavior

- New passwords: at least 15 characters (NIST SP 800-63B-4, single-factor), salted scrypt with N=131072, r=8, p=1, versioned hashes. Legacy scrypt hashes transparently upgrade after a valid login.
- Server-side, random, hashed session tokens with logout revocation.
- HTTPS: `__Host-` prefixed Secure, HttpOnly, SameSite=Lax cookie; HTTP local development uses a non-Secure development cookie.
- Both IP-based and per-email authentication attempt limits, same-origin write checks and no-store account responses.
- Accounts fail closed (503) when durable storage is not configured on Render instead of quietly losing user data.

## Verification after connecting storage

1. Check `/api/connect/session` returns `available: true` (when signed out, `user: null`).
2. Register a test account, sign out and sign in again; confirm it is the same account.
3. Save a title to the library, deploy a fresh build and confirm that its state survives.
4. Verify that the session cookie is Secure, HttpOnly and SameSite=Lax on HTTPS.
5. Configure independent backups, monitoring, a recovery process, and an email verification/password reset process before accepting sensitive or public user signups.

Do not claim production account availability until a persistent database or disk is connected and the restart-survival check passes.
