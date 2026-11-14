# Plan 01 — Schema, row-level security, order lifecycle
**Goal.** Orders, criteria and an append-only history, with RLS on every table and a fixed set of status transitions.
**Not doing.** Teams, file uploads, payments, editing criteria after sending.
**How we'll know it worked.** Database tests prove: anonymous sees nothing; a stranger sees and changes nothing; the client can read but not edit; status cannot be set directly; criteria lock on send; delivery needs evidence for every criterion; the full flag → fix → re-deliver → sign-off path leaves the expected history.
