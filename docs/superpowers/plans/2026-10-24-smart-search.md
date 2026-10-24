# Implementation plan

- [x] Inspect ShuttleTV reference; keep the full AI form.
- [x] Restore centered search with safe live results, people mode, pagination, saved states and history.
- [x] Compare pinned free encoders on the same authored corpus; calibrate BGE and keep old assets usable.
- [x] Expand grounded routes; correct descriptive genre planning and verify up to two intersected credit constraints.
- [x] Fix review findings: generic with clauses, following like/about clauses, second person constraints, BFCache pending edits.
- [x] Verify focused tests, real q8 ranking, route coverage and desktop/phone browser paths.
- [ ] Finish full suite, publish exact tested tree and pass GitHub CI.
- [ ] Merge and verify live search, AI form preservation and representative catalog descriptions.

Interfaces: parser returns a bounded `people` array and legacy first `person` alias; server verifies and intersects credits. Shared model config controls id, pinned revision, pooling, query instruction, calibration and topic asset identity. Existing v1 vectors are immutable; new vectors use v2.
