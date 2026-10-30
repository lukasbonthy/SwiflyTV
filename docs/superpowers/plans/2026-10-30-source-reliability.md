# Source Reliability Implementation Plan

> For agentic workers: use superpowers:executing-plans to implement this plan inline; one fresh whole-branch review at the end.

**Goal:** Repair shared source reliability and preserve real 4K metadata, with researched authorized-media alternatives.
**Architecture:** Keep the existing provider, verifier, opaque proxy and player interfaces. Add an explicit bounded-prefix mode only to the verification HTTP call; other requests remain strict. Use a bounded failure cooldown in the existing lazy-entry resolver.
**Tech stack:** Existing Node/Express, node:test, Playwright; no new runtime dependencies.
**Spec:** ../specs/2026-10-30-source-reliability-design.md

## Global Constraints

Preserve providers, UI/account data, episode identity, public-address checks, credential scoping, cancellation, memory bounds and party controls. No bypassing protected streams. Report provider claims separately from verified media dimensions. Native implementation and prior release authorization continue; no design approval loop for these bounded bug fixes.

## Review Focus

Numeric zero/NaN/giant dimensions must not create a quality label. Auto HLS must retain adaptive behavior. Prefix reads must cancel network/decoder resources and cannot relax regular fetch limits. HTML or partial protection clips must not verify. Failed alternate retries must remain single-flight, respect the 1000ms cooldown and never revive expired entries.

## Tasks

1. Quality metadata: tests in tests/playback-options.test.cjs for 4K HDR, UHD/8K, numeric height, dimensions, invalid input, explicit Auto and ranking. RED; fix lib/playback-options.js; GREEN existing playback/handoff tests; commit.
2. HTTP verification: local HTTP fixtures reject HEAD and ignore Range. Test bounded readPrefix, strict default, cancellation, compressed data, HTML and known partial protection clip rejection. RED; fix lib/nuvio-http.js, lib/nuvio-provider.js and lib/media-discovery.js; GREEN source/proxy tests; commit.
3. Alternate recovery: fake-clock regression in tests/playback-handoff.test.cjs for one transient failure, cooldown, concurrent retry and expiry. RED; fix lib/native-source-entry.js; GREEN all source/handoff tests; commit.
4. Research and integration validation: primary project/docs comparison and limits in docs/source-reliability-4k.md. Run npm run check, full unit phase, installed Chromium/player/proxy checks and acceptance as appropriate. One independent whole-branch review; fix Important findings with RED→GREEN and green suite. Publish exact tested tree, PR and checked merge; verify the deployed version with existing authorized session.

Task4 validation detail: commit the small original 4K VP9 fixture with reproduction command, add a real verifier-to-player browser test and run it in installed-Chromium CI. Observe RED for the missing clear 4K label, then add the minimal 2160p label/cache-key change and run existing player integration tests.
