# Plan 04 — Orders: create, send, accept, deliver, sign off
**Goal.** Owner creates an order with criteria (each line checked by the rules), sends it; client accepts; owner marks each criterion met with evidence and delivers; client signs off or flags a named criterion.
**Not doing.** Email notifications (next), file uploads for evidence (links/text for now).
**How we'll know it worked.** On the Vercel preview, run the whole flow with two accounts; every illegal step is refused by the database, not just hidden in the UI.
