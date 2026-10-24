# Recommendation quality verification

AI search now uses pinned BGE Small English v1.5 q8 with normalized CLS pooling and the upstream query instruction. It runs in an isolated, single-threaded browser worker. No provider account, API key or per-request model service is required. The first semantic request downloads about 35 MB, then the browser can reuse its cached assets. Exact titles and filter-only requests remain immediate catalog operations.

## Measured ranking

Both workers were run with actual CPU inference against the same 60 real title names, authored descriptions and metadata. There are 50 existing queries, 30 additional paraphrases and eight separate probes whose intended title is absent. Expected labels are manually authored. This is development evidence, not general accuracy or live catalog recall.

| Same fixed corpus | MiniLM at `63cc2a1` | BGE |
| --- | ---: | ---: |
| Expected title first | 76/80 | 78/80 |
| Expected title in first three | 79/80 | 80/80 |
| Correctly empty on absent-target probes | 1/8 | 6/8 |

The rat-chef and silent-tramp probes still return false matches. The first-choice misses and all outputs are recorded in `ai-model-comparison.json`. Similarity thresholds are calibrated for BGE rather than copied from MiniLM. CPU timings in that report do not measure phone, Xbox or browser responsiveness.

The retrieval planner expands from 54 to 95 grounded story routes, with three independently encoded descriptions per route. Its separate 20 development coverage checks pass; these checks exercise routes introduced for those concepts and are not a held-out benchmark. Model identity, pooling, instruction and vector dimensions are versioned together. The old MiniLM assets and old topic index remain available to already-open pages.

## Retrieval behavior

Descriptive genre prompts such as a comedy about switching bodies now reach semantic planning. Simple genre, release-date, exclusion, language and runtime filters continue to bypass model loading. Inferred genres guide retrieval; only explicit user constraints are mandatory.

Up to two actor/director constraints use intersected, verified TMDB combined credits. Director requests require the actual Director job. Ambiguous “movies with …” requests retain their story meaning unless a person is verified; known genre and story terms bypass person lookup. Following about/like clauses remain part of the story or reference request. Lookup timeouts are bounded and failures can be retried.

Exact titles, cautious typo corrections, similar-title requests, watched exclusions, shared-home preferences, cancellation and actual progress remain. The entire original AI form is preserved: textarea, submit button, format, audience, watched checkbox, More options, all three mood suggestions, progress and Cancel.

## Reproduce

```sh
npm run prepare:ai
npm run build:search-topics
node scripts/evaluate-recommendations.cjs --ref 63cc2a102f2c70763e82f9c20dcc92b954eda297 --challenge --hard --negative /tmp/before.json
node scripts/evaluate-recommendations.cjs --challenge --hard --negative /tmp/after.json
npm run test:recommendations
```

CI requires at least 90% first-choice and 96% top-three matches on the fixed labeled set, at least half of the absent-target probes to abstain, and every development route to remain reachable. Behavioral and Chromium tests separately exercise actual form, API, worker and search history paths.

Sources: [BAAI model card and license](https://huggingface.co/BAAI/bge-small-en-v1.5), [pinned Transformers.js model export](https://huggingface.co/Xenova/bge-small-en-v1.5/tree/ea104dacec62c0de699686887e3f920caeb4f3e3), [TMDB combined credits](https://developer.themoviedb.org/reference/person-combined-credits), [TMDB person search](https://developer.themoviedb.org/reference/search-person).
