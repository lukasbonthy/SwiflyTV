# Wallpaper, Aurora and TV implementation

Spec: ../specs/2026-10-29-wallpapers-tv-design.md

Global constraints: preserve existing features and reversible Studio draft semantics. Isolated branch. Do not duplicate repository work into Library. Commit explicit paths and save GitHub checkpoints.

1. Restore original Aurora: lifecycle tests RED, independent native-dialog/page state, compact Studio ambiance, remove seasonal suppression. Verify existing Studio and welcome tests plus actual browser motion.
2. Wallpaper config and portability: validation/independence/storage/backup tests RED, implement validated image resolution, bounded asset codec, effective readability and guest isolation. Verify config/account suite.
3. Upload and Studio: file bounds, async draft ownership tests RED, re-encoding renderer and usable simple wallpaper panel plus advanced crop/detail. Verify real file upload, Save/Cancel/reload, named looks and import/export. Refine theme details and capture phone/desktop evidence.
4. Controller-first TV: stage/timeline/back/context/focus tests RED, implement input zones and separated full-width timeline, larger labeled controls and usable navigation. Verify real native video and 720p/1080p geometry. Preserve embed fallback and party locks.
5. Integrate and publish: version assets, syntax check, full suite, installed Chromium tests, acceptance, fresh whole-branch review, fix important findings with RED→GREEN. Save PR, merge checked head and verify deployed changes.

Review focus: stale async uploads, invalid image/reference bounds, guest/account leaks, account backup quota, motion lifecycle, nav overlap, held controller input, watch-party permissions and cross-origin embed boundaries.
