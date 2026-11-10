# SwiflyTV

SwiflyTV now uses React rendering with a Vite production bundle. Desktop catalog rows show seven titles at a time, with arrows and TV navigation for the remaining titles. The existing backend, original styles and feature controllers are retained.

## Run locally

Use Node.js 20.19+ (or 22.12+ for Vite), copy your existing configuration to `.env`, then run:

```sh
npm ci
npm run build
npm start
```

The local URL is http://127.0.0.1:4173 unless `PORT` is set.

## Render

The Dockerfile builds the Vite frontend in a Node 22 build stage and copies its compiled assets into the existing Playwright runtime. Production starts the Node server directly on Render's assigned `PORT` and binds `0.0.0.0`. The runtime does not need Vite or development dependencies.

React is enabled by default. Set `SWIFLY_REACT=false` and redeploy to run the retained original interface. Existing secrets and account/provider configuration remain in Render.

## Original version

The full pre-migration app is preserved on [backup/original-before-react-v173-20261110](https://github.com/lukasbonthy/SwiflyTV/tree/backup/original-before-react-v173-20261110), at commit `70481c2dcc54f14858094dea8c08cee818be8457`. See [rollback and comparison instructions](docs/react-migration/ROLLBACK.md).

`npm run start:original` runs the retained original renderer locally.

## Checks

```sh
npm run check
npm test
npm run build
```

This is a hybrid migration: React owns page rendering and catalog paging; the existing player, Studio, account and other feature controllers are preserved for parity.
