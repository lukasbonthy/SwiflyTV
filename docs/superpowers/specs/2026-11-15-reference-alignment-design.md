# SwiflyTV reference alignment

The user rejected the latest visual result. This correction follows their concrete references: ShuttleTV’s live period control, SwiflyTV’s existing AI Picks layout, and the normal SwiflyTV browsing experience adapted for children. Prior test passes verify mechanics but do not establish an acceptable visual match.

## Decisions

- Keep the restored Movies hierarchy and independent popularity data. Match the observed ShuttleTV selector: period inline with the heading at the same600 weight and24px desktop/20px phone sizing;2px purple/accent underline4px below; muted16px chevron; no button face or mouse-focus rectangle; rounded14px popout,4px inset,14px option text, checkmark,150ms opacity/scale(.95)/8px slide. Retain44px touch targets where needed, keyboard focus, overflow collision and reduced motion. Labels: Today, This Week, This Month.
- Audiobooks uses the actual AI Picks component family and final cascade: dsPlainPage/svDiscoveryPage, centered svDiscoveryHero, the same search-mode navigation, form surface, chip styling and results width. Prefer shared component selectors/classes over new competing overrides. Keep the working library/search/listening behavior and no decorative landscape.
- Kids is a child-safe version of the site with native navigation, cinematic hero, native rails/cards, Movies, Series, Browse, search, details/episodes and player return. Explicit /kids/* routes keep the experience child scoped even before locking. Every title used in chrome/content/hero/rails/results/detail recommendations is verified before rendering. Reuse existing main-site renderers with default-preserving options; keep adult routes unchanged.
- Keep parent password exit controls, conservative verified age/genre limits, cross-tab/player/transport guards and the configured private secret. Do not print adult local history, notification/profile/social/Studio containers in the child shell. Child search is scoped and has separate or no recents. Do not broaden unrestricted APIs to make native components work.
- Existing Node/React/Vite stack, iPad safeguards, ripple corrections, real pagination and other completed features remain. No new dependencies or invented imagery.

## Evidence before release

Compare the actual AI Picks and Audiobooks at identical desktop/phone widths and inspect the resulting screenshots. Inspect the selector open/closed beside the observed live ShuttleTV reference, including color, size, typography and menu motion. Inspect Kids Home/Movies/Series/Browse/detail/locked navigation using the real application shell and realistic distinct artwork. Run meaningful safety/query regressions and hosted browser interaction/layout checks; passing geometry alone is not a visual acceptance criterion. Publish only the reviewed passing tree, then verify the intended code and changed production behavior.
