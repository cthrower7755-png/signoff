# Signoff

Agree what “done” means before the work starts. Signoff turns a freelance order into written acceptance criteria a third party could check. The client accepts them, the wording locks, and delivery is signed off item by item with evidence.

**Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), Supabase (Postgres, Auth, row-level security, SQL functions), Vercel, Claude API for drafting.

## How this was built
Built with Claude Code, one pull request per step, each with a written plan in `docs/plans/` (goal, what's out of scope, how we'll know it worked), CI on every PR and a Vercel preview. Built quickly first, then reviewed and tightened before anyone used it.

**Build**
1. [#1](../../pull/1) Schema, row-level security and the order lifecycle ([plan 01](docs/plans/01-schema-rls.md))
2. [#2](../../pull/2) Criterion rules: checkable, not vague ([plan 02](docs/plans/02-rules.md))
3. [#3](../../pull/3) Email-link sign-in ([plan 03](docs/plans/03-auth.md))
4. [#4](../../pull/4) Orders: create, send, accept, deliver, sign off ([plan 04](docs/plans/04-orders.md))
5. [#5](../../pull/5) AI drafts criteria; the rules decide ([plan 05](docs/plans/05-ai-draft.md))
6. [#6](../../pull/6) CI on every pull request, project rules for Claude (`CLAUDE.md`)

**Review and tighten**
7. [#7](../../pull/7) Supabase's security advisor flagged order functions callable while signed out: locked to signed-in users
8. [#8](../../pull/8) A live test showed the refusal named only one vague word: now it names all of them ([plan 06](docs/plans/06-name-all-vague-words.md))
9. [#9](../../pull/9) A deliberate "is it tight?" review before release found gaps that every automated check had passed (evidence editable after sign-off, a fakeable client flag, an order insertable as already signed off, an open redirect, no AI cost limit). Each gap now has a test that tries it and must fail ([plan 07](docs/plans/07-tighten-rules.md))
10. [#10](../../pull/10) 2FA is deliberately off in the demo, and the app says so ([plan 08](docs/plans/08-demo-2fa-note.md))

## Why it's built this way
- **The bar doesn't move.** A database trigger freezes criteria when the order is sent. The UI can't get around it because the database refuses.
- **Every state change is a checked function** with an allowed-from list and an append-only history.
- **AI suggests, rules decide.** Claude drafts criteria; a deterministic checker rejects taste words and anything not verifiable before a person saves.
- **Tested against real Postgres** in CI (PGlite, in-memory): owner, client, stranger and anonymous, plus the whole lifecycle.

## Run it
1. Create a Supabase project; run every file in `supabase/migrations/` in order, in the SQL editor.
2. In Supabase Auth → URL configuration, add `http://localhost:3000/auth/callback` and your Vercel URL `…/auth/callback`.
3. `cp .env.example .env.local` and fill in the URL and publishable key. Optional: `ANTHROPIC_API_KEY` for AI drafting.
4. `npm install && npm run dev`

## Demo limits (on purpose)
This is a public demo, so a few things a production build would have are switched off to let anyone try it in five minutes:
- **Two-factor authentication is off.** In production, accepting an order, delivering and signing off would require an authenticator code, checked in the database rather than only on the page. Supabase Auth supports this; Reflex Terminal's admin panel already requires 2FA.
- **Sign-in is by emailed link only**, and anyone can create an account.
- **AI drafting is limited** to 20 drafts per user per day.

## Checks
`npm run lint && npm run typecheck && npm test && npm run build` — the same steps run on every pull request.

Built by Cleo Thrower with Claude as the coding agent; every change planned in `docs/plans/`, reviewed and merged by pull request.
