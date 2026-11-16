// Database tests: run the real migration in an in-memory Postgres (PGlite) with Supabase's auth
// functions stubbed, then act as the owner, the client and a stranger. No network, no Supabase account.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const OWNER = "11111111-1111-1111-1111-111111111111";
const CLIENT = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";
const users: Record<string, string> = { [OWNER]: "owner@example.com", [CLIENT]: "client@example.com", [STRANGER]: "stranger@example.com" };

const AUTH_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
`;

let db: PGlite;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec("reset role");
  if (user) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.email', $2, false)", [user, users[user]]);
    await db.exec("set role authenticated");
  } else {
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.email', '', false)");
    await db.exec("set role anon");
  }
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function fails(user: string | null, sql: string, params: unknown[] = [], match?: RegExp) {
  let err: unknown = null;
  try { await as(user, sql, params); } catch (e) { err = e; }
  expect(err, `expected failure: ${sql}`).not.toBeNull();
  if (match) expect(String((err as Error).message)).toMatch(match);
}

let orderId = "";
const crit: string[] = [];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const [id, email] of Object.entries(users)) await db.query("insert into auth.users values ($1, $2)", [id, email]);
  const dir = join(__dirname, "../migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  await db.exec("grant select, insert, update, delete on public.orders, public.criteria to authenticated");
  await db.exec("revoke insert, update, delete on public.order_events from authenticated");
});

describe("row-level security and the order lifecycle", () => {
  it("owner creates a draft order with criteria", async () => {
    const [o] = await as<{ id: string }>(OWNER, "insert into orders (title, client_email) values ('Pre-launch review', 'client@example.com') returning id");
    orderId = o.id;
    for (const [i, t] of ["Every table listed with its access rule", "Every exposed key listed"].entries()) {
      const [c] = await as<{ id: string }>(OWNER, "insert into criteria (order_id, position, criterion, how_checked) values ($1, $2, $3, 'Count matches the project') returning id", [orderId, i + 1, t]);
      crit.push(c.id);
    }
    expect(crit).toHaveLength(2);
  });

  it("anonymous users see nothing", async () => {
    await fails(null, "select * from orders");
  });

  it("a stranger cannot see or touch the order", async () => {
    expect(await as(STRANGER, "select * from orders")).toHaveLength(0);
    expect(await as(STRANGER, "select * from criteria")).toHaveLength(0);
    await fails(STRANGER, "select accept_order($1)", [orderId], /not your order/);
  });

  it("the client sees it but cannot edit criteria directly", async () => {
    expect(await as(CLIENT, "select id from orders")).toHaveLength(1);
    const rows = await as(CLIENT, "update criteria set criterion = 'changed' where order_id = $1 returning id", [orderId]);
    expect(rows).toHaveLength(0); // RLS: no update policy for the client
  });

  it("nobody can set status directly", async () => {
    await fails(OWNER, "update orders set status = 'signed_off' where id = $1", [orderId], /order functions/);
  });

  it("history cannot be written by users", async () => {
    await fails(OWNER, "insert into order_events (order_id, kind) values ($1, 'fake')", [orderId]);
  });

  it("client cannot accept before the order is sent", async () => {
    await fails(CLIENT, "select accept_order($1)", [orderId], /not allowed: accepted while the order is draft/);
  });

  it("owner sends; criteria lock; client accepts", async () => {
    await as(OWNER, "select send_order($1)", [orderId]);
    await fails(OWNER, "update criteria set criterion = 'easier bar' where id = $1", [crit[0]], /locked/);
    await fails(OWNER, "insert into criteria (order_id, position, criterion, how_checked) values ($1, 3, 'New item added late', 'n/a')", [orderId], /locked/);
    await as(CLIENT, "select accept_order($1)", [orderId]);
    const [o] = await as<{ status: string }>(OWNER, "select status from orders where id = $1", [orderId]);
    expect(o.status).toBe("accepted");
  });

  it("delivery needs every criterion met with evidence", async () => {
    await as(OWNER, "update criteria set met = true, evidence = 'Report section 1' where id = $1", [crit[0]]);
    await fails(OWNER, "select deliver_order($1)", [orderId], /every criterion/);
    await as(OWNER, "update criteria set met = true, evidence = 'Report section 2' where id = $1", [crit[1]]);
    await as(OWNER, "select deliver_order($1)", [orderId]);
  });

  it("client flags a named criterion; owner fixes and redelivers; client signs off", async () => {
    await fails(CLIENT, "select flag_criterion($1, 'no')", [crit[1]], /say what/);
    await as(CLIENT, "select flag_criterion($1, 'Two keys are missing from the list')", [crit[1]]);
    const [c] = await as<{ met: boolean; client_flag: string }>(OWNER, "select met, client_flag from criteria where id = $1", [crit[1]]);
    expect(c.met).toBe(false);
    expect(c.client_flag).toMatch(/Two keys/);
    await as(OWNER, "update criteria set met = true, evidence = 'Report section 2, revised' where id = $1", [crit[1]]);
    await as(OWNER, "select deliver_order($1)", [orderId]);
    await as(CLIENT, "select sign_off($1)", [orderId]);
    const events = await as<{ kind: string }>(CLIENT, "select kind from order_events where order_id = $1 order by id", [orderId]);
    expect(events.map((e) => e.kind)).toEqual(["sent", "accepted", "delivered", "flagged", "delivered", "signed_off"]);
  });
});

// Gaps found in the 2026-11-16 review (docs/plans/07-tighten-rules.md). Each test tries the gap and expects it to fail.
describe("the bar stays put after the client signs off", () => {
  let o2 = "";
  let c2 = "";

  it("new orders must start as a plain draft", async () => {
    await fails(OWNER, "insert into orders (title, client_email, status) values ('Fake finished job', 'client@example.com', 'signed_off')", [], /start as a draft/);
    await fails(OWNER, "insert into orders (title, client_email, signed_off_at) values ('Fake finished job', 'client@example.com', now())", [], /start as a draft/);
  });

  it("nothing is marked met, and no flag is set, in a draft", async () => {
    const [o] = await as<{ id: string }>(OWNER, "insert into orders (title, client_email) values ('Second order', 'client@example.com') returning id");
    o2 = o.id;
    await fails(OWNER, "insert into criteria (order_id, position, criterion, how_checked, met, evidence) values ($1, 1, 'Report delivered as PDF', 'File exists', true, 'x')", [o2], /in progress/);
    await fails(OWNER, "insert into criteria (order_id, position, criterion, how_checked, client_flag) values ($1, 1, 'Report delivered as PDF', 'File exists', 'fake')", [o2], /only the client/);
    const [c] = await as<{ id: string }>(OWNER, "insert into criteria (order_id, position, criterion, how_checked) values ($1, 1, 'Report delivered as PDF', 'File exists') returning id", [o2]);
    c2 = c.id;
    await fails(OWNER, "update criteria set met = true, evidence = 'early' where id = $1", [c2], /in progress/);
  });

  it("once sent: no evidence yet, no fake client flag, details and timestamps fixed", async () => {
    await as(OWNER, "select send_order($1)", [o2]);
    await fails(OWNER, "update criteria set met = true, evidence = 'before accept' where id = $1", [c2], /in progress/);
    await fails(OWNER, "update criteria set client_flag = 'fake complaint' where id = $1", [c2], /only the client/);
    await fails(OWNER, "update orders set title = 'A different job' where id = $1", [o2], /locked/);
    await fails(OWNER, "update orders set due_date = '2030-01-01' where id = $1", [o2], /locked/);
    await fails(OWNER, "update orders set accepted_at = now() where id = $1", [o2], /order functions/);
  });

  it("evidence moves while the work is in progress, then freezes at sign-off", async () => {
    await as(CLIENT, "select accept_order($1)", [o2]);
    await as(OWNER, "update criteria set met = true, evidence = 'report.pdf' where id = $1", [c2]);
    await as(OWNER, "select deliver_order($1)", [o2]);
    await fails(OWNER, "update criteria set evidence = 'swapped after delivery' where id = $1", [c2], /in progress/);
    await as(CLIENT, "select flag_criterion($1, 'The PDF is missing the appendix')", [c2]);
    await fails(OWNER, "update criteria set client_flag = null where id = $1", [c2], /only the client/);
    await as(OWNER, "update criteria set met = true, evidence = 'report-v2.pdf' where id = $1", [c2]);
    await as(OWNER, "select deliver_order($1)", [o2]);
    const [c] = await as<{ client_flag: string | null }>(OWNER, "select client_flag from criteria where id = $1", [c2]);
    expect(c.client_flag).toBeNull();
    await as(CLIENT, "select sign_off($1)", [o2]);
    await fails(OWNER, "update criteria set evidence = 'rewritten after sign-off' where id = $1", [c2], /in progress/);
    await fails(OWNER, "update criteria set met = false where id = $1", [c2], /in progress/);
    await fails(OWNER, "update orders set signed_off_at = now() - interval '30 days' where id = $1", [o2], /order functions/);
    await fails(OWNER, "delete from orders where id = $1", [o2]);
    const [row] = await as<{ evidence: string }>(CLIENT, "select evidence from criteria where id = $1", [c2]);
    expect(row.evidence).toBe("report-v2.pdf");
  });
});

describe("AI drafting limit (ai_usage)", () => {
  it("anonymous users cannot draft or read usage", async () => {
    await fails(null, "select take_ai_draft()");
    await fails(null, "select * from ai_usage");
  });

  it("users cannot write their own count", async () => {
    await fails(OWNER, "insert into ai_usage (user_id, drafts) values ($1, 0)", [OWNER]);
    await fails(OWNER, "update ai_usage set drafts = 0");
  });

  it("20 drafts a day, then refused; each user sees only their own count", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 21; i++) {
      const [r] = await as<{ take_ai_draft: boolean }>(OWNER, "select take_ai_draft()");
      results.push(r.take_ai_draft);
    }
    expect(results.slice(0, 20).every(Boolean)).toBe(true);
    expect(results[20]).toBe(false);
    const [mine] = await as<{ drafts: number }>(OWNER, "select drafts from ai_usage");
    expect(mine.drafts).toBe(21);
    expect(await as(CLIENT, "select * from ai_usage")).toHaveLength(0);
    expect(await as(STRANGER, "select * from ai_usage")).toHaveLength(0);
    const [r] = await as<{ take_ai_draft: boolean }>(CLIENT, "select take_ai_draft()");
    expect(r.take_ai_draft).toBe(true);
  });
});
