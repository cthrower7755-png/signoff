import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-path";
import { errorText } from "@/lib/errors";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const next = safeNext(String(formData.get("next") || ""));
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  redirect(`/login?${new URLSearchParams(error ? { error: "send", next } : { sent: "1", next })}`);
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; sent?: string; error?: string }> }) {
  const { next, sent, error } = await searchParams;
  const message = errorText(error);
  return (
    <>
      <h1>Sign in</h1>
      <p className="dim">We email you a one-time link. Clients sign in with the email the order was sent to.</p>
      {sent && <p className="card">Check your email for the sign-in link. It can take a minute; look in spam if it doesn’t arrive.</p>}
      {message && <p className="error">{message}</p>}
      <form action={sendLink} className="card">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <p><button type="submit">Email me a sign-in link</button></p>
      </form>
    </>
  );
}
