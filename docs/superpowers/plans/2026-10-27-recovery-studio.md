# Account Recovery and Clearer Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline implementation. Steps use checkbox (`- [x]`) syntax for tracking. Independent Studio/page work may run under dispatching-parallel-agents; one final whole-branch review follows integration.

**Goal:** Make saved data recoverable, Studio understandable, and every route easier to use without removing existing features.

**Architecture:** Add an allowlisted portable backup/recovery module alongside existing account cache and optimistic state sync. Extend Studio's existing validated settings and preview transaction, and make focused copy/orientation improvements based on every route family.

**Tech Stack:** Existing Node/Express, vanilla JS/CSS, node:test, jsdom, Playwright.

**Spec:** docs/superpowers/specs/2026-10-27-recovery-studio-design.md

## Global Constraints

- No new framework, paid services or dependencies.
- Preserve every existing AI form control and player/social/Study/library feature.
- No passwords, sessions, cookies, Trakt tokens or messages in backups; imports do not create identity.
- Never silently adopt another verified account's private browser partition.
- Explicit preview/confirmation, additive merging, storage rollback and honest sync status.
- Reduced motion, high contrast, native touch and TV focus remain authoritative.

## Review Focus

- Account changes during preview/upload/sync must not import into the wrong destination.
- Storage exhaustion must not delete the source or current library or falsely report success.
- Repeated imports and timestamp conflicts must preserve newer progress and folder memberships.
- Advanced controls must stay available without hidden focusable controls or loss of staged values.
- Themes and guide UI must fit 320px screens and TV while respecting high contrast/reduced motion.

### Task 1: Portable account backup and browser recovery

**Files:** public/clean/account-backup.js/css, public/clean/account.js, ui/account-backup.js, server.js; tests/account-backup.test.cjs and tests/account-backup-browser.test.cjs.

**Interfaces:** Consume SwiflyAccount.ready/request/snapshot/sync, SwiflyLibrary.normalize/reconcile and existing profile/Continue formats. Expose a focused SwiflyAccountBackup interface and real Account actions. Backup schema is independently validated; state imports use current optimistic account revision rather than replacing an account.

- [x] Write failing tests for backup allowlist, additive duplicate/newer merge, archive failure, stale ownership, cancellation and API failure.
- [x] Run the tests and confirm missing behavior, then implement bounded schema, safe archive, preview and import/export controls.
- [x] Exercise actual browser storage and authenticated server sync; run scoped account/Trakt/Library suites and commit.

### Task 2: Simple Studio and curated themes

**Files:** ui/studio.js, public/studio/config.js, public/studio/studio.js/css, optional theme CSS in existing runtime files; Studio browser/config tests.

**Interfaces:** Preserve SwiflyStudio APIs and validated version-2 settings; add a validated theme identity only if needed for persistent decoration. Keep editor mode separate. Appearance previews remain cancellable and use existing Config.apply/write.

- [x] Write and run failing behavioral tests for Simple defaults, Advanced retention/focus, theme field scope, Save/Cancel and accessibility policy.
- [x] Implement polished gallery including Halloween, useful Simple controls and optional Advanced controls.
- [x] Run scoped Studio suites, inspect real phone/desktop screenshots, and commit.

### Task 3: Every-page usability review and focused improvements

**Files:** docs/usability-review.md; ui/page-guide.js, public/clean/page-guide.css if useful; ui/settings.js, ui/study.js, ui/connect.js, ui/discovery.js, public/clean/library-page.js and focused tests. Propose server.js copy/orientation edits to the root implementer to avoid shared writes.

**Interfaces:** A page guide, if justified, is server-rendered and accepts active/route context. Account/Settings recovery links use /account#account-data. Do not add an import button with a dead handler.

- [x] Inspect every route family and record real confusion, next-action and empty-state findings.
- [x] Make direct copy/label/empty-state changes; test only meaningful navigation/state behavior and preserve all forms/handlers.
- [x] Supply exact server integration edits and verify phone/desktop rendering.

### Task 4: Integration, verification and GitHub delivery

**Files:** server.js asset integration/cache versions, scripts acceptance fixtures as needed, docs/recovery-studio-validation.md, workflow browser list if new browser test files are not discovered automatically.

- [x] Integrate modules and check task interfaces, cache versions, source changes and all page routes.
- [x] Run npm run check, full npm run test:ui, and real route-family browser acceptance; retain exact outputs/screenshots.
- [x] Perform one independent whole-branch review, fix Important issues with regression coverage, and rerun affected/full checks as justified.
- [ ] Publish a reviewable GitHub branch/PR. Report the actual delivery state and available recovery without claiming deleted data or production deploy was restored.
