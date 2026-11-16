import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { STATUS_LABEL, canDeliver, type Status } from "@/lib/rules";
import { errorText } from "@/lib/errors";
import { acceptOrder, deliverOrder, flagCriterion, markMet, sendOrder, signOff } from "../actions";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, user } = await currentUser();
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();
  const { data: criteria = [] } = await supabase.from("criteria").select("*").eq("order_id", id).order("position");
  const { data: events = [] } = await supabase.from("order_events").select("kind,detail,created_at").eq("order_id", id).order("id");
  const isOwner = order.owner_id === user?.id;
  const status = order.status as Status;
  const rows = criteria ?? [];

  return (
    <>
      <h1>{order.title}</h1>
      <p className="row">
        <span className={`pill ${status === "signed_off" ? "ok" : status === "changes_requested" ? "warn" : ""}`}>{STATUS_LABEL[status]}</span>
        <span className="dim">Client: {order.client_email}{order.due_date ? ` · Due ${order.due_date}` : ""}</span>
      </p>
      {errorText(error) && <p className="error">{errorText(error)}</p>}
      {status !== "draft" && <p className="dim">The criteria below were locked when the order was sent. They can’t be edited, added to or removed.</p>}

      <table>
        <thead><tr><th>#</th><th>Done means…</th><th>How it’s checked</th><th>Evidence</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>A{c.position}</td>
              <td>{c.criterion}{c.client_flag && <p className="issue">Client: {c.client_flag}</p>}</td>
              <td className="dim">{c.how_checked}</td>
              <td>
                {c.evidence ?? <span className="dim">—</span>}
                {isOwner && (status === "accepted" || status === "changes_requested") && !c.met && (
                  <form action={markMet.bind(null, id, c.id)} className="row" style={{ marginTop: 6 }}>
                    <input name="evidence" placeholder="File, link or test result" required />
                    <button type="submit">Mark met</button>
                  </form>
                )}
                {!isOwner && status === "delivered" && (
                  <form action={flagCriterion.bind(null, id, c.id)} className="row" style={{ marginTop: 6 }}>
                    <input name="note" placeholder="What isn't met?" minLength={5} required />
                    <button type="submit" className="danger">Not met</button>
                  </form>
                )}
              </td>
              <td>{c.met ? <span className="pill ok">Met</span> : <span className="pill">Open</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 18 }}>
        {isOwner && status === "draft" && <form action={sendOrder.bind(null, id)}><button>Send to client</button></form>}
        {!isOwner && status === "sent" && <form action={acceptOrder.bind(null, id)}><button>Accept these criteria</button></form>}
        {isOwner && (status === "accepted" || status === "changes_requested") && (
          <form action={deliverOrder.bind(null, id)}><button disabled={!canDeliver(rows)}>Deliver</button></form>
        )}
        {!isOwner && status === "delivered" && <form action={signOff.bind(null, id)}><button>Sign off: all criteria met</button></form>}
      </div>

      <h2>History</h2>
      <div className="card">
        {(events ?? []).map((e, i) => (
          <p key={i} className="dim">{new Date(e.created_at).toLocaleString()} — {e.kind}{e.detail?.position ? ` (A${e.detail.position}: ${e.detail.note})` : ""}</p>
        ))}
        {!(events ?? []).length && <p className="dim">Nothing yet.</p>}
      </div>
    </>
  );
}
