# Plan 02 — Deterministic criterion rules
**Goal.** One function that decides whether a criterion is checkable: rejects taste words, requires something countable or verifiable, requires how it is checked.
**Not doing.** Language models in the rule itself; spelling or grammar fixes.
**How we'll know it worked.** Unit tests cover accepted, vague, not-checkable and missing-check cases, words that merely contain a vague word, and identical results on repeat calls.
