import { NewOrderForm } from "./form";

export default function NewOrder() {
  return (
    <>
      <h1>New order</h1>
      <p className="dim">One criterion per line: <code>what done means | how it is checked</code>. Every line is checked by fixed rules before it can be saved.</p>
      <NewOrderForm />
    </>
  );
}
