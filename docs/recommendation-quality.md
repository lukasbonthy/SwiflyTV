# Recommendation quality verification

This pass addresses incorrect intent handling, candidate retrieval and ranking. It keeps the existing free MiniLM q8 model and its isolated browser worker; it does not introduce a paid model service or a generative-model download.

## Fixed-corpus measurement

The fixture contains 60 real title names with short, authored plot descriptions and deterministic metadata. There are 30 development queries and 20 additional paraphrases. Expected answers are manually labeled; broad moods can have other reasonable answers. This measures ranking among known candidates, not live TMDB coverage or general recommendation accuracy.

| Real q8 CPU inference over the same 50 queries | Before (`cc2f679`) | After |
| --- | ---: | ---: |
| Expected answer ranked first | 39 | 48 |
| Expected answer in the first three | 46 | 50 |

The old fixed cosine cutoff discarded the correct repeating-day and beauty-pageant road-trip matches. Its comforting query also ranked a horror film. The new ranker combines semantic similarity, weighted plot-word evidence and catalog affinity, handles comforting/family intent, and preserves additional preferences when comparing similar titles.

Two strict first-choice misses remain in this fixture: a comforting request puts *Amelie* before the labeled *The Intouchables*, and a bookshop/celebrity description puts *You've Got Mail* before *Notting Hill*. Both labeled answers are within the first three. This small result is not a claim of perfect AI search. Timing from this script is not a site performance benchmark.

Reproduce with the pinned model assets:

```sh
npm run prepare:ai
node scripts/evaluate-recommendations.cjs /tmp/before.json --challenge --ref cc2f679
node scripts/evaluate-recommendations.cjs /tmp/after.json --challenge
npm run test:recommendations
```

CI runs the real model evaluation after preparing assets. Its regression floor is at least 90% first-choice and 96% top-three matches on this fixed set. Behavioral unit and real Chromium tests separately cover intent parsing, actual candidate API calls, model loading and form-to-worker results.

## Product behavior

- Exact/translated title matches and cautious typo suggestions bypass the model. A typo retry is bounded and a correction is labeled as a suggestion.
- Broad genre, exclusion, date, language and running-time requests use verified catalog filters without downloading the model.
- Descriptive requests still run actual semantic inference. Plot words can rescue a short but meaningful match below the previous fixed threshold; weak unrelated results are not padded into a full grid.
- Similar-title requests keep the reference story and the extra positive preferences separate during ranking.
- Inferred topics guide retrieval rather than becoming mandatory genre exclusions. Explicit constraints remain mandatory across sources.
- TV genres missing from TMDB's TV genre list use keyword metadata for positive and negative preferences. Runtime checks use bounded metadata requests and fail honestly if they cannot be verified.
- The interface shows only interpreted filters, real download/matching progress, concise result reasons and a working cancellation action. First semantic use still needs the existing roughly 23 MB model download.

Catalog tags and synopses cannot verify every subjective preference. The small topic planner and the upstream catalog can still miss unusual descriptions. The test set is deliberately separate from live catalog coverage.

Live verification after deployment confirmed that the repeating-day request changed from no matches to *Groundhog Day* first. It also exposed a title-retrieval case outside the authored corpus: `Intersteler` found the different real film *Interstelar* (zero catalog votes), hiding *Interstellar* because the first search was nonempty. The follow-up retries once when no exact title exists, orders close spellings with a bounded vote-count prior, and presents plausible alternatives as choices. Exclusions still apply, and correction copy is derived from the surviving candidates.

Implementation references: [TMDB discover filters](https://developer.themoviedb.org/reference/discover-movie), [TMDB title search](https://developer.themoviedb.org/reference/search-movie), [Sentence Transformers semantic search](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html).
