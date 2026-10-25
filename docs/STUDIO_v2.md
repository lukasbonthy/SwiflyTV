# Swifly Studio

Open Studio from the navigation or profile menu, or press Ctrl/Cmd+E. The ten sections cover all twelve groups in the implementation brief. Changes preview on the real page; Save commits them. Cancel, Escape, controller Back and programmatic dialog closure restore the saved appearance, device policy and named-look library. Restore defaults and section resets change the draft only.

| Feature group | Working behavior |
|---|---|
| Homepage builder | Actual existing row order/visibility with drag and Up/Down, hero modes/position, card width/columns and rail/grid. At least one available catalog row stays visible. Upcoming and Recommended rows are configurable too. |
| Advanced themes | Seven accent presets plus legacy choices, validated HEX/secondary/canvas colors, gradient, four font choices, glass opacity/blur/edge/glow, contrast warning and subsection reset. Accent color also rotates Aurora and styles native player progress. |
| Player | Live control style, timeline/time/icons/opacity/position/autohide and loading backdrop. Native captions have size/color/background/edge controls without replacing media or selected tracks. |
| Adaptive cinema | Opt-in artwork color sampling with bounded success/failure cache, CORS fallback, no frame loop and reduced effects during playback or low-power policy. |
| Navigation | Actual desktop/mobile DOM order, sidebar/top, icon/label/density/active treatment; search, account, Studio and notification controls retained. Responsive and TV fallbacks keep controls reachable. |
| Loading | Cinematic/minimal/artwork/Aurora/basic appearances, dim and transition speed; existing readiness/hold/release gate stays authoritative. No invented percentages or artificial waiting time. |
| HUD and AI | Notification side/width/density/material/motion/preview, toast position and AI width/spacing/card/material/options. Every original AI form field remains present. |
| Posters | Lift/zoom/reveal/flat, automatic/always actions and ring/frame focus with keyboard parity and reduced-motion overrides. No per-card pointer animation loop. |
| Profile appearance | Separate validated account/profile records, backward-compatible v1 migration, safe account/profile switching and stale-tab/save-failure guards. |
| Device policy | Device-local Auto/Desktop/Mobile/Xbox/Minimal, TV scale/controls. Raw preferences stay separate from effective OS/device safeguards. |
| Accessibility | Text scale, high contrast, focus and touch targets, reduced transparency and OS motion/transparency preference priority, including real native captions. |
| Named looks | Staged create/apply/duplicate/rename/delete (12 maximum), descriptive swatches, real file/clipboard JSON export and explicit file/paste import review. |

## Portable looks and storage

A portable file is at most 32 KiB of UTF-8 JSON. Unsupported/future versions, unknown settings, invalid values and remote HTML/CSS/assets are rejected. Review an import, choose Preview, then Save or Cancel. Exports contain only validated appearance values and name/description/version; they exclude account identity, private watch data, credentials and device policy.

Guest legacy storage remains `swiflytv.appearance`; profile records use `swiflytv.appearance.v2.<owner>`. Device policy lives in `swiflytv.studio.device`. Saving the two records uses a compensating rollback if the second write fails. Quota/blocked-storage errors leave the draft available rather than reporting success.

Appearance cloud sync is explicitly unavailable. Existing account library sync still works for supported library records. Export/import is the supported appearance transfer between devices.

## Runtime contract

`SwiflyStudioConfig` owns validation, persistence, effective policy and the same first-paint/live token application. `SwiflyStudio.getSettings()` returns effective values; `getRawSettings()` preserves choices. The document `swifly:studio-change` event carries separate `{values,effective}` copies. Runtime modules style existing home/navigation/HUD/AI/player nodes instead of replacing forms or transport state.

Auto mobile softens liquid glass to bounded soft glass. Xbox/Minimal suppress costly material and decorative motion while preserving saved appearance choices. OS reduced preferences always win. Native caption support varies by browser/renderer; no subtitle track is invented. Physical Xbox and cross-network TURN behavior require testing on those devices/networks.
