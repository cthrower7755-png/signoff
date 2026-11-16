# Signoff

Agree what “done” means before the work starts. Signoff turns a freelance order into written acceptance criteria a third party could check. The client accepts them, the wording locks, and delivery is signed off item by item with evidence.

**Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), Supabase (Postgres, Auth, row-level security, SQL functions), Vercel, Claude API for drafting.

## Why it's built this way
- **The bar doesn't move.** A database trigger freezes criteria when the order is sent. The UI can't get around it because the database refuses.
- **Every state change is a checked function** with an allowed-from list and an append-only history.
- **AI suggests, rules decide.** Claude drafts criteria; a deterministic checker rejects taste words and anything not verifiable before a person saves.
- **Tested against real Postgres** in CI (PGlite, in-memory): owner, client, stranger and anonymous, plus the whole lifecycle.

## Run it
1. Create a Supabase project; run `supabase/migrations/0001_init.sql` in the SQL editor.
2. In Supabase Auth → URL configuration, add `http://localhost:3000/auth/callback` and your Vercel URL `…/auth/callback`.
3. `cp .env.example .env.local` and fill in the URL and publishable key. Optional: `ANTHROPIC_API_KEY` for AI drafting.
4. `npm install && npm run dev`

## Checks
`npm run lint && npm run typecheck && npm test && npm run build` — the same steps run on every pull request.

Built by Cleo Thrower with Claude as the coding agent; every change planned in `docs/plans/`, reviewed and merged by pull request.
