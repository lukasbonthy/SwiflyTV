# Playback speed and atmosphere implementation plan

> **For agentic workers:** use focused parallel implementation for independent source, motion/glass, and welcome/Studio tasks; root integrates and verifies the full change.

**Goal:** Make the working SwiflyTV setup faster and its scrolling/welcome atmosphere more polished.

**Architecture:** Retain the current providers and player. Add bounded staggered source hedging, shorten verified capture paths, cache common CSS, and reduce frontend rendering work. Redesign welcome in its own module and add Studio-controlled Aurora.

**Tech stack:** Node >=20, Express, Playwright fixtures, vanilla JS/CSS, node:test, jsdom.

**Spec:** ../specs/2026-10-13-playback-and-atmosphere.md

## Global constraints

- No CineSrc installation or provider swap.
- Maximum two captures per lookup; route 60s, provider 27s, whole job 75s by default.
- Validate real media before success; preserve cleanup, credentials, TV inputs, cache and existing adapters.
- No actual browser/provider testing workaround; use fake browser and DOM/HTTP fixtures.
- Preserve saved Studio settings, native controls, reduced motion and auth targets.

## Review focus

- Abort-ignoring losers must retain their job slot until physical cleanup.
- Metadata failure must leave welcome usable with working signup/login.
- Native trackpad and nested dialogs must remain usable without wheel capture.
- Aurora and glass must avoid background work when hidden, disabled, or reduced.
- CSS extraction must preserve style order and dependent page libraries.

## Tasks

- [x] Source speed: tests first for early verified navigation/frame winners and staggered race cleanup; implement `runProviderRace({jobs,run,signal,timeoutMs,hedgeDelayMs,maxConcurrent,isPlayable,now}) -> {winner,results}` and integrate into `localStreamProviderGetStreams`. Test source discovery, aborts and bounded fallback.
- [x] Motion and glass: tests first for wheel distance, reversal/native boundaries, idle frame scheduling and bounded SVG growth. Improve motion and surface observers without changing their exported APIs.
- [x] Welcome and Aurora: create `welcomeMarkup(options)` and welcome CSS; add Aurora choice and decorative layer in Studio with real metadata, escaped text and preserved redirects. Test defaults, drafts, cancel/save, empty metadata and lifecycle.
- [x] Shell weight: tests first for cached base CSS and absence of unused/player libraries on catalog pages. Extract identical stylesheet, retain cascade order and load necessary media/socket dependencies on the routes that use them.
- [ ] Verification and delivery: run syntax, full node:test, served assets/CSS/inline-script checks, deterministic speed evidence and fresh review. Publish a leased fast-forward to GitHub main, verify exact tree and CI, then create a secret/dependency-free ZIP from that manifest.
