# Contributing to SwiflyTV

Thanks for improving SwiflyTV. This is a hybrid React/Vite + Express application. Changes to the native player, Kids guards and API access checks should keep the server and UI in sync.

## Local setup

Use Node.js 22 LTS (or a compatible version satisfying package.json), then:

```sh
cp .env.example .env
npm ci
npm run build
npm start
```

Set only the environment variables you need; never commit secrets, user account data, private source URLs or provider credentials.

## Development workflow

1. Create a feature branch, not a direct commit to main.
2. Keep patches narrow, and retain the existing visual language rather than introduce a separate design system for each page.
3. Add a regression test for any bug fix. For child-safe content, protect both API/route behavior and browser behavior.
4. Run `npm run check`, `npm run build`, and `npm run test:ui`. Browser tests require a working Playwright Chromium installation.
5. Submit a PR summarizing the visible behavior, tests and any remaining limitations.

Do not add hardcoded access codes, scrape credentials, personal data, copyrighted media without redistribution rights, or ways to bypass content protections. Only integrate sources you are authorized to use.

## License and contributions

This is a release-preview branch. A maintainer-selected LICENSE file is required before this package is represented as open source. Until then, no new license terms are implied.
