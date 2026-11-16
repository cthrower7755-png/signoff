import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { STATUS_LABEL, type Status } from "@/lib/rules";

export default async function Orders() {
  const { supabase, user } = await currentUser();
  const { data: orders } = await supabase.from("orders").select("id,title,client_email,status,owner_id,due_date").order("created_at", { ascending: false });
  const mine = (orders ?? []).filter((o) => o.owner_id === user?.id);
  const forMe = (orders ?? []).filter((o) => o.owner_id !== user?.id);
  const table = (rows: typeof mine, who: "client" | "owner") => (
    <table>
      <thead><tr><th>Order</th><th>{who === "client" ? "Client" : "From"}</th><th>Due</th><th>Status</th></tr></thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id}>
            <td><Link href={`/orders/${o.id}`}>{o.title}</Link></td>
            <td className="dim">{who === "client" ? o.client_email : "—"}</td>
            <td className="dim">{o.due_date ?? "—"}</td>
            <td><span className={`pill ${o.status === "signed_off" ? "ok" : o.status === "changes_requested" ? "warn" : ""}`}>{STATUS_LABEL[o.status as Status]}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <>
      <div className="row"><h1>Orders</h1><Link href="/orders/new" className="btn" style={{ marginLeft: "auto" }}>New order</Link></div>
      <h2>Your orders</h2>
      {mine.length ? table(mine, "client") : <p className="dim">None yet.</p>}
      <h2>Sent to you</h2>
      {forMe.length ? table(forMe, "owner") : <p className="dim">No orders have been sent to {user?.email}.</p>}
    </>
  );
}
