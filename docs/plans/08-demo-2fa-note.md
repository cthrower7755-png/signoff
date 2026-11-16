# Plan 08 — Say plainly that 2FA is off in the demo
**Goal.** Anyone using or reviewing the demo can see that two-factor sign-in is deliberately off, and what production would do instead (authenticator code required to accept, deliver and sign off, enforced in the database).
**Not doing.** Building 2FA. Decided 2026-11-16: reviewers should be able to try the demo without installing an authenticator app.
**How we'll know it worked.** The note shows in the footer of every page and in the README's "Demo limits" section; lint, type check, tests and build pass.
