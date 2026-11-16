# Plan 07 — Tighten the rules and close security gaps
**Goal.** Close the gaps found in a review of the live app on 2026-11-16, each with a test that tries the gap and expects it to fail:
1. After sign-off the owner could rewrite evidence. Evidence and "met" may now change only while the work is in progress (accepted or changes requested).
2. The owner could write the client's flag directly. Only `flag_criterion` sets it; only `deliver_order` clears it.
3. The owner could rename the order, change the due date, or edit the accepted / signed-off timestamps after sending.
4. The orders guard ran on edits only, so an owner could insert an order that was already "signed off". New orders must start as a plain draft.
5. Sign-in redirect accepted `/\evil.com`, which browsers treat as another site (open redirect).
6. Error text was passed in the URL and shown on the page, so anyone could craft a link that shows any message on our domain. Errors are now short codes mapped to fixed text.
7. Paid AI drafting had no per-user limit. Now 20 drafts per user per day, counted in the database (`ai_usage`, RLS on, written only by `take_ai_draft`).
8. Login gave no "check your email" or error message; a failed sign-in link failed silently.
9. Creating an order could leave an empty draft if saving the criteria failed; "mark met" said nothing if no row changed.
10. Security headers: no framing, no MIME sniffing, strict referrer, forms post only to this site.

**Not doing.** Notification emails (next PR). Content-Security-Policy for scripts (needs nonces; separate change). Dev-only `npm audit` findings in lint tooling (the only fix is a downgrade; nothing ships to users).

**How we'll know it worked.** Database tests run every migration in order and try each of gaps 1–4 and 7 as the owner, the client, a stranger and anonymous; unit tests cover the redirect check and the error codes; lint, type check, tests and build pass in CI.
