# Original SwiflyTV and rollback

The original application before the React/Vite migration is preserved in:

- Branch: [`backup/original-before-react-v173-20261110`](https://github.com/lukasbonthy/SwiflyTV/tree/backup/original-before-react-v173-20261110)
- Original commit: `70481c2dcc54f14858094dea8c08cee818be8457`

That branch contains the complete original backend, original frontend, media assets, Dockerfile and package lock, without the migration. Keep it as the comparison baseline when fixing React behavior.

## Quick interface fallback

On the current `main` branch, set `SWIFLY_REACT=false` in Render and redeploy. The startup script honors this setting and serves the retained original page renderer. Set it to `true` or remove the override and redeploy to return to React.

Locally, `npm run start:original` explicitly selects the original renderer, even if the environment previously enabled React. `npm start` selects React by default and also honors `SWIFLY_REACT=false`.

This switches presentation without copying or deleting accounts, lists, provider configuration or other server data.

## Full code rollback

To deploy the exact pre-migration version, set the Render service's repository branch to the backup branch and deploy it, or revert the migration commit on `main`. Return the Render branch to `main` when the React fix is ready. Keep subsequent backend/data changes compatible before rolling back application code.

## Where fixes belong

- React page renderer: `frontend/document.mjs`
- Seven-card windows and styles: `frontend/rails.mjs`, `frontend/rails.css`
- Original-controller boot lifecycle: `frontend/controllers.mjs`
- Server page-model compiler: `lib/react-document.cjs`
- Original route builders and API: `server.js`, `ui/`, `lib/`, `public/`
- Render launch policy: `scripts/runtime-config.cjs`, `scripts/start-react.cjs`

The migration retains original feature controllers for parity. It does not rewrite every player, account or Studio controller as React hooks.
