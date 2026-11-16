import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const next = String(formData.get("next") || "/orders");
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await supabaseServer();
  await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1>Sign in</h1>
      <p className="dim">We email you a one-time link. Clients sign in with the email the order was sent to.</p>
      <form action={sendLink} className="card">
        <input type="hidden" name="next" value={next ?? "/orders"} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <p><button type="submit">Email me a sign-in link</button></p>
      </form>
    </>
  );
}
