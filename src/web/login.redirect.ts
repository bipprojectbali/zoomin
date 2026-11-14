/** Tujuan default setelah login. */
export const DEFAULT_AFTER_LOGIN = "/app";

/**
 * `?next=` aman: hanya path internal relatif ("/..."), bukan "//host", "/\host", skema, atau kontrol karakter
 * (cegah open redirect). Selain itu → `/app`. `/login` juga ditolak agar tidak loop.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_AFTER_LOGIN;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return DEFAULT_AFTER_LOGIN;
  // Resolusi URL sebagai pertahanan kedua: origin harus tetap sama.
  const base = "http://zoomin.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== base || url.pathname === "/login") return DEFAULT_AFTER_LOGIN;
  return url.pathname + url.search + url.hash;
}

/** `/login?next=<path>`; path default/ tak aman → `/login` saja. */
export function loginPath(next: string): string {
  const safe = safeNextPath(next);
  return safe === DEFAULT_AFTER_LOGIN ? "/login" : `/login?${new URLSearchParams({ next: safe })}`;
}
