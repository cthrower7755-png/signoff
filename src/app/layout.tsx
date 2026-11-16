import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Signoff — acceptance criteria that don't move",
  description: "Agree what done means before work starts. Sign off item by item at delivery.",
};

async function UserNav() {
  const { user } = await currentUser();
  return user ? (
    <>
      <Link href="/orders">Orders</Link>
      <span>{user.email}</span>
      <form action="/auth/signout" method="post"><button className="secondary" type="submit">Sign out</button></form>
    </>
  ) : (
    <Link href="/login">Sign in</Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand"><span className="dot" />Signoff</Link>
          <nav><Suspense fallback={null}><UserNav /></Suspense></nav>
        </header>
        <main><Suspense fallback={<p className="dim">Loading…</p>}>{children}</Suspense></main>
        <footer className="dim demo-note">
          Demo build: two-factor sign-in is switched off so anyone can try it. In production, accepting, delivering and signing
          off would require an authenticator code, enforced by the database.
        </footer>
      </body>
    </html>
  );
}
