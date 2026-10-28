# Cinematic Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all seven themes a coherent, visibly distinct appearance, with polished seasonal artwork and honest previews.

**Architecture:** Keep existing validated theme values and application flow. Extend derived CSS tokens for coordinated surfaces; theme-specific CSS supplies bounded decorative backgrounds. Studio cards and live preview use the same imagery and palette.

**Tech Stack:** Existing Node, vanilla JavaScript, CSS, local WebP and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-27-cinematic-themes-design.md`

## Global Constraints

- Preserve every existing feature, Advanced control, saved custom palette and Save/Cancel behavior.
- No dependencies, database changes or per-frame JavaScript.
- Decorative images never cover catalog artwork or interactive content.
- High contrast, reduced transparency/motion and Xbox/minimal performance remain authoritative.

## Review Focus

- Custom palettes must not keep misleading seasonal decorations after editing.
- Save, Cancel and reload must apply or remove the entire theme consistently.
- Missing images must retain a readable dark fallback.
- Phone layout and keyboard/TV focus must remain usable.
- Preview and theme cards must show the actual selected scene and palette.

## Task 1: Theme atmosphere and Studio presentation

**Files:** `public/studio/config.js`, `public/studio/studio.css`, `public/studio/themes.css`, `ui/studio.js`, `public/studio/studio.js`, local `public/studio/themes/` assets, and existing theme/browser tests.

**Interfaces:** Existing `SwiflyStudioConfig.applyTheme`, `apply`, `effective`, curated theme IDs, existing Studio draft lifecycle; no new public settings.

- [x] Inspect theme application and actual rendered pages; record baseline tests.
- [x] Generate and optimize two original cinematic seasonal backgrounds with a code fallback.
- [x] Refine curated palettes and derive coordinated surface/accent tokens.
- [x] Replace decorative miniature shapes with scene cards and make live preview match.
- [x] Apply scene/surface styling to real shared page components without changing layout or handlers.
- [x] Run relevant existing tests, syntax checks and phone/desktop/TV visual checks, including comfort settings and missing-image fallback.
- [x] Review diff and commit exact intended files with screenshots and validation.
- [ ] Publish the reviewable PR and record GitHub CI status in its description.

No new tests that merely repeat CSS declarations. Add a behavioral regression only if new behavior cannot be covered by the existing suite or actual browser acceptance.
