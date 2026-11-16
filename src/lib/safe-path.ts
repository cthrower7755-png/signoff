// Where to send someone after sign-in. Only a path on this site is allowed: "/orders/123" yes,
// "//evil.com" and "/\evil.com" (browsers read both as another site) no.
const BASE = "https://signoff.invalid";

export function safeNext(next: string | null | undefined, fallback = "/orders"): string {
  if (!next || !next.startsWith("/")) return fallback;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  return url.pathname + url.search;
}
