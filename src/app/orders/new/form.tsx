"use client";
import { useActionState, useState, useTransition } from "react";
import { createOrder, draftWithAI, type FormState } from "../actions";
import type { DraftedCriterion } from "@/lib/ai";

export function NewOrderForm({ aiEnabled }: { aiEnabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrder, {});
  const [criteria, setCriteria] = useState("");
  const [scope, setScope] = useState("");
  const [drafts, setDrafts] = useState<DraftedCriterion[]>([]);
  const [aiError, setAiError] = useState("");
  const [drafting, startDraft] = useTransition();

  const draft = () =>
    startDraft(async () => {
      setAiError("");
      const r = await draftWithAI(scope);
      if (r.error) setAiError(r.error);
      setDrafts(r.items ?? []);
      const ok = (r.items ?? []).filter((d) => d.issues.length === 0);
      if (ok.length) setCriteria(ok.map((d) => `${d.criterion} | ${d.how_checked}`).join("\n"));
    });

  return (
    <form action={action} className="card">
      <label htmlFor="title">Order title</label>
      <input id="title" name="title" required minLength={3} maxLength={140} />
      <div className="row">
        <div style={{ flex: 2 }}>
          <label htmlFor="client_email">Client email</label>
          <input id="client_email" name="client_email" type="email" required />
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="due_date">Due date</label>
          <input id="due_date" name="due_date" type="date" />
        </div>
      </div>

      {aiEnabled && (
        <div className="card">
          <label htmlFor="scope">Describe the order (for an AI draft)</label>
          <textarea id="scope" value={scope} onChange={(e) => setScope(e.target.value)} style={{ minHeight: 80 }} />
          <p><button type="button" className="secondary" onClick={draft} disabled={drafting}>{drafting ? "Drafting…" : "Draft criteria with AI"}</button></p>
          {aiError && <p className="error">{aiError}</p>}
          {drafts.some((d) => d.issues.length) && (
            <div>
              <p className="dim">Rejected by the rules (not added):</p>
              {drafts.filter((d) => d.issues.length).map((d, i) => (
                <p key={i} className="issue">✗ {d.criterion} — {d.issues[0].message}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <label htmlFor="criteria">Acceptance criteria</label>
      <textarea id="criteria" name="criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} required
        placeholder={"Every database table is listed with its access rule | count in report = count in project\nReport delivered as PDF by the due date | file delivered"} />
      {state.error && <p className="error">{state.error}</p>}
      {state.issues?.map((x, i) => <p key={i} className="issue">Line {x.line}: {x.message}</p>)}
      <p><button type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button></p>
    </form>
  );
}
