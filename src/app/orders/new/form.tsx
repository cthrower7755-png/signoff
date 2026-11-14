"use client";
import { useActionState, useState } from "react";
import { createOrder, type FormState } from "../actions";

export function NewOrderForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrder, {});
  const [criteria, setCriteria] = useState("");

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

      <label htmlFor="criteria">Acceptance criteria</label>
      <textarea id="criteria" name="criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} required
        placeholder={"Every database table is listed with its access rule | count in report = count in project\nReport delivered as PDF by the due date | file delivered"} />
      {state.error && <p className="error">{state.error}</p>}
      {state.issues?.map((x, i) => <p key={i} className="issue">Line {x.line}: {x.message}</p>)}
      <p><button type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button></p>
    </form>
  );
}
