# Plan 03 — Sign-in and session handling
**Goal.** Email one-time-link sign-in with Supabase Auth; session refreshed in `proxy.ts`; `/orders` requires sign-in; safe redirect after login.
**Not doing.** Passwords, social logins, teams.
**How we'll know it worked.** Signed-out visit to `/orders` redirects to `/login?next=…`; the link signs in and returns to `next`; `next` cannot redirect off-site (`//evil.com` is rejected).
