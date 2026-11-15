# Open-source release preparation (preview)

This branch is a staging area only. The production `main` branch and its Render deployment must not be modified by this preparation.

## Project map

| Path | Purpose |
| --- | --- |
| `frontend/` | React/Vite application entry and bridge |
| `ui/` | Server-rendered page and feature composition |
| `public/` | Browser controllers, styles, artwork and Study media |
| `lib/` | Server-side services and policy |
| `server.js` | Express application and HTTP routes |
| `scripts/` | Run, build, evaluation and source packaging scripts |
| `tests/` | Unit, browser and regression checks |
| `vendor/` | Existing vendored helpers |
| `docs/` | Maintained feature and migration notes |

Run `node scripts/package-open-source.cjs /tmp/swiflytv-open-source-preview` from the repo to prepare the source-only directory. The dedicated preview GitHub Actions workflow also packages it as a ZIP artifact. This excludes historical QA screenshots, internal plan scratchpads, local runtime data, `.git`, `.env` and installed dependencies. The archive includes sources, tests, bundled Study music and asset notices.

## Before a real public release

- **Choose and add an explicit LICENSE** (e.g. MIT or Apache-2.0 if appropriate). GitHub visibility alone does not grant permission to copy/change/distribute this code.
- Review all assets, including fonts, cover artwork, illustrations and music, for their individual redistribution permissions.
- Confirm each third-party media integration and provider respects licensing, service rules, intellectual-property rights, and authorized delivery. This project must not facilitate unauthorized streaming.
- Run a full secrets scan, credential rotation where needed, dependency audit, browser and accessibility checks before publication.
- Test setup from a clean machine with only `.env.example`; never assume private Render settings are publicly available.
- Review parent-lock and account controls on narrow phones, tablets, browsers and TV navigation.
- Test the built ZIP by extracting it and running `npm ci`, `npm run build` and relevant tests.
- Verify that `main` and live Render still point at the original production commit.

This is a **release candidate**, not a statement that the full codebase or every bundled asset is already approved for redistribution.
