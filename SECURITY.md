# Security policy

SwiflyTV is a release preview. Do not disclose live credentials, sensitive logs or private user information in issues or pull requests.

## Reporting

Use GitHub's private vulnerability reporting option for this repository if enabled. Otherwise, open a minimal issue requesting a private reporting channel **without including exploit details, private credentials, or personal data**.

## Security model

- Authorize access to private and age-restricted resources on the server for every request. UI-only guards are not security boundaries.
- Protect parental-lock secrets and account/database settings in server-side environment variables; do not change them in a public patch.
- Never include `.env`, runtime storage, real account information, tokens, debug archives or deployment artifacts in source ZIPs.
- Before any public release, review external provider integrations, dependencies, and redistribution rights for bundled assets.
- Treat all browser-provided fields, upstream media URLs and account identifiers as untrusted.
