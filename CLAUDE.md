# Signoff — project context for Claude Code

Read this before every change. Read `AGENTS.md` too (Next.js 16 conventions differ from older versions: `proxy.ts` replaces middleware; `cookies()`, `headers()`, `params`, `searchParams` are async; Cache Components is on, so request-time data must sit inside `<Suspense>`).

## What this is
A tool for freelancers and their clients: acceptance criteria are agreed before work starts, lock when the order is sent, and are signed off item by item at delivery.

## Rules that do not bend
1. **The bar does not move.** After `send_order`, criterion wording, how-checked, position and count are frozen by the `criteria_guard` trigger. Never add a code path around it.
2. **Status changes only through the SQL functions** (`send_order`, `accept_order`, `deliver_order`, `sign_off`, `flag_criterion`). `orders_guard` rejects direct status writes. Each function checks who the caller is and the allowed "from" states, and writes `order_events`.
3. **Row-level security on every table.** New tables ship with RLS enabled and policies in the same migration, plus a test in `supabase/tests/db.test.ts` for owner, client, stranger and anonymous.
4. **`order_events` is append-only.** Users have SELECT only; functions write to it.
5. **AI suggests, rules decide.** `draftCriteria` may only return suggestions; every suggestion goes through `checkCriterion` and the owner saves. AI output never reaches the database directly. The API key lives only on the server (`ANTHROPIC_API_KEY`).
6. **Secrets never in the client.** Only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key are public.

## How we change things
- Every feature starts with a plan in `docs/plans/` (Goal / Not doing / How we'll know it worked) and lands as one pull request.
- A PR merges only when CI is green: `npm run lint`, `npm run typecheck`, `npm test` (unit + database tests on PGlite), `npm run build`.
- Vercel builds a preview for every PR; check the flow on the preview before merging.
- Database changes are new files in `supabase/migrations/` (never edit an applied migration).

## Commands
- `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`
