# Connected Cinema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver real social accounts, free local AI discovery, audiobooks, player assistance and a moving aurora.

**Architecture:** Focused Express routers and UI modules integrate with the existing shell. Account state has a transaction store supporting PostgreSQL and atomic files; browsers subscribe to idle server events. Model inference and song recognition are lazy workers, independent of browsing and scroll rendering.

**Tech Stack:** Node 20+, Express, pg, browser ES module workers, Transformers.js 3.8.1/MiniLM, LibriVox, IntroDB, Python/ShazamIO 0.8.1.

**Spec:** `docs/superpowers/specs/2026-10-21-connected-cinema.md`

## Global Constraints

- Preserve permanent liquid navigation, dark poster actions, native touch scrolling and the existing watchroom host authority.
- No paid resource is provisioned by this change.
- No paid API or account key is required for AI picks.
- Production on Render must not silently accept durable account data on its ephemeral filesystem.
- Do not accept a source URL from the client for song identification.

## Review Focus

- A second account must never read another pair's messages, sessions or private state.
- Simultaneous acceptance/invites must not exceed two household members or duplicate friendships.
- Slow, empty and malformed upstream responses must leave retryable, honest UI states.
- Pausing, seeking, changing episode or joining a party must not trigger stale autoplay/skip actions.
- Closing a panel or leaving a page must cancel model, capture, search and event work.

### Task 1: Durable accounts and social API

**Files:** `lib/account-store.js`, `lib/connect.js`, `tests/connect-api.test.cjs`, `package.json`, `server.js`, `.env.example`, `.gitignore`.
**Interfaces:** `createAccountStore(options)` exposes `read()`, `transaction(fn)`, `ready`, `close()`; `createConnect({store, resolveMedia, createParty})` exposes `router`, `notify`, `close`. Routes live under `/api/connect`, server cookie is `swifly_session`.

- [x] Write tests for signup/login/session revocation, restart persistence, unfriend/block authorization, private DMs, media attachment validation, notifications, profile state isolation and single-use two-person invitations; run `node --test tests/connect-api.test.cjs` and observe missing-module failures.
- [x] Implement serialized file/Postgres transactions, server sessions, same-origin JSON mutations, bounded messages and shared-home actions. Production reports account setup unavailable until persistent storage is configured.
- [x] Run the same tests; expect all pass, then commit the API.

### Task 2: Social and shared-home interface

**Files:** `ui/connect.js`, `public/connect/connect.js`, `public/connect/connect.css`, `public/clean/account.js`, `server.js`, `tests/connect-ui.test.cjs`.
**Interfaces:** consumes Task 1 routes; publishes `window.SwiflyConnect.share({type,id})`, current activity and account-state synchronization. `/friends` is the private social home; existing `/social` retains the party hub.

- [x] Write UI tests for login error state, friend requests, text/title/party sending, unread/read state, invitation acceptance, profile isolation, search cancellation and rendering untrusted text. Run tests and observe failures.
- [x] Replace local password handling with server authentication, integrate navigation notification dialog and friend entry points, implement responsive inbox/activity/shared-home panels and private state synchronization.
- [x] Run `node --test tests/connect-api.test.cjs tests/connect-ui.test.cjs`; expect all pass, then commit.

### Task 3: Search, free AI and audiobooks

**Files:** `lib/discovery.js`, `ui/discovery.js`, `public/discovery/*`, `public/clean/clean.js`, `server.js`, `tests/discovery.test.cjs`, `tests/discovery-ui.test.cjs`.
**Interfaces:** `createDiscovery({tmdb,fetch})` exposes `router`; `/api/discovery/search`, `/candidates`, `/books`, `/books/:id`. Pages `/recommendations`, `/audiobooks`; search preserves `svNavSearchPopup/Input/Toggle` IDs.

- [x] Write tests for upstream URL constraints, catalog normalization, malformed/empty responses, stale search, worker cancellation, AI versus fallback copy and chapter resume/sleep; run both files and observe failures.
- [x] Implement cached upstream adapters, accessible search panel, genuine MiniLM ranking in a lazy worker, responsive audiobook browse/details/player with storage-bound resume and sleep timer.
- [x] Run Task 3 tests and `npm run check`; expect pass, then commit.

### Task 4: Intro, next episode and song identification

**Files:** `lib/player-assist.js`, `scripts/identify-song.py`, `public/player/assist.js`, `public/player/assist.css`, `ui/player.js`, `server.js`, `Dockerfile`, `tests/player-assist.test.cjs`, `tests/player-assist-ui.test.cjs`.
**Interfaces:** `/api/player-assist/segments/:type/:id?s=&e=`, `/api/player-assist/song` (WAV bytes); client uses mounted `SwiflyPlayer` methods and existing episode-link click handling for party-host synchronization.

- [x] Write tests for verified/missing segments, invalid WAV, worker timeouts/concurrency, pause/seek/countdown dismissal, stale source reset and party guest lock; run and observe failures.
- [x] Add segment cache, bounded ShazamIO process, on-demand media audio capture, skip UI, final-30-second next episode card and autoplay setting. Update Docker runtime dependencies and versioned assets.
- [x] Run both assist test files plus existing player/watchparty tests; expect pass, then commit.

### Task 5: Aurora and integrated verification

**Files:** `public/clean/aurora.css/js`, feature rendering tests, `.github/workflows/check.yml`, documentation.
**Interfaces:** uses existing live/still/off aurora state and Studio motion preference; new browser tests exercise the shipped pages and real assets.

- [x] Write browser assertions that the live ribbon transform changes, still/reduced/offscreen states stop it, search fits mobile, and social/player panels remain usable. Run and observe the aurora failure.
- [x] Restore bounded compositor transforms with reduced-motion/offscreen handling; complete integration and document storage setup and real external-service limits.
- [x] Run syntax checks, unit suite and required rendering suite. Inspect responsive screenshots, then commit and request independent read-only review. Fix important findings with regression tests. Publish the reviewed branch/PR only after verification; verify the deployed pages and report any external configuration still required.
