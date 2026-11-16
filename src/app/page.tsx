import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Agree what “done” means before the work starts.</h1>
      <p className="dim">Signoff turns an order into written acceptance criteria a third party could check. The client accepts them, the wording locks, and delivery is signed off item by item, with evidence.</p>
      <div className="card">
        <ol>
          <li>Write criteria (or draft them with AI; every draft is checked by fixed rules).</li>
          <li>Send. The client accepts. From here the criteria cannot change.</li>
          <li>Mark each criterion met, with evidence. Deliver.</li>
          <li>The client signs off, or names the criterion that isn’t met.</li>
        </ol>
      </div>
      <Link href="/orders" className="btn">Open your orders</Link>
    </>
  );
}
