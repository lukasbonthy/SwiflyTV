# Native SwiflyTV sections

The user rejected Kids, Audiobooks, Study and Languages because they look like separate invented sites. Match SwiflyTV's existing black cinema interface. This is a correction to the shipped redesign, not a new visual brand.

Use the existing Host Grotesk/inherited Studio font, black canvas, neutral gray panels, white primary controls, 10–16px radii, 16px catalog gaps and real cover artwork. Headers are compact product labels. Remove editorial serif headings, oversized slogans, pastel page canvases, decorative mascots, numbered mood cards and unrelated generated scenery.

- Kids: a dark Swifly catalog with a small Kids identity, actual verified posters, familiar category pills, search and parent controls. Keep limited playful accents on ratings/categories. Preserve every protection. Show normal site navigation while unlocked; keep locked navigation safe.
- Audiobooks: a native dark library headed Audiobooks, with search, useful author shortcuts, continue listening and real recordings. Remove the landscape, mood scenery and empty scenery-only quiet mode. Preserve chapter playback, text links, speed, sleep, search/history, cancellation and profile-scoped progress.
- Study: keep original functional room scenes and music, using a room composition instead of the default close-up. My default choice is the existing raccoon room for new preferences; preserve saved scene choices. Use white/gray controls, readable timer and compact player/tools. Remove cream/olive styling and promotional scene captions. Keep all tasks, settings, rooms, accessibility and media behavior.
- Languages: a compact native catalog header and filters, a searchable language grid and genre pills. Use language names/native labels, not postcard art, floating foreign words or a marketing hero. Preserve native forms, exact page/filter semantics and search.

Shared CSS defines page/header/control geometry; route styles contain only their required layout. No new dependency, generated artwork or backend/security change. Reuse the existing linked worktree on an isolated branch. Review all four beside ordinary Swifly catalog pages at phone, tablet and desktop widths before publishing. Prior authorization to finish and deploy this work persists.

Alternatives considered: isolated recolors would keep the rejected structure; four independent art directions caused the inconsistency. One native component language is the implementation choice.
