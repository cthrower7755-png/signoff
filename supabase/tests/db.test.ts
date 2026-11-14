// Database tests: run the real migration in an in-memory Postgres (PGlite) with Supabase's auth
// functions stubbed, then act as the owner, the client and a stranger. No network, no Supabase account.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
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
  await db.exec(readFileSync(join(__dirname, "../migrations/0001_init.sql"), "utf8"));
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
