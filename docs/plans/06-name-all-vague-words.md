# Plan 06 — Name every vague word
**Goal.** When a criterion uses more than one taste word, the message names all of them, so the owner can fix the line in one pass.
**Not doing.** Changing which words count as vague, or whether a line is accepted.
**How we'll know it worked.** A unit test: "Professional, high-quality report" returns one vague issue naming both words. Found while testing the live app on 2026-11-16: the line was correctly refused, but only "high-quality" was named.
