import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Klien Better Auth same-origin (basePath /api/auth). Dipakai untuk login Google, logout, dan `useSession`.
 * `adminClient` hanya untuk inferensi tipe (field role/banned di user): endpoint /api/auth/admin/* SENGAJA diblok dari
 * HTTP oleh server (aturan A5 ditegakkan di /api/admin/* dan /api/dev/*), jadi pakai fungsi di api.client.ts.
 * Data profil/peran untuk UI tetap dari GET /api/me (bentuk SessionUser kontrak).
 */
export const authClient = createAuthClient({ plugins: [adminClient()] });

/**
 * Mulai login Google: browser diarahkan ke Google lalu kembali ke `callbackURL` (path same-origin, mis. "/app").
 * Gagal (mis. domain email tidak diizinkan, akun diblokir) → kembali ke `/login?error=<kode>`
 * (`email_domain_not_allowed`, `BANNED_USER`, atau kode OAuth Better Auth).
 */
export async function signInWithGoogle(callbackURL: string): Promise<void> {
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: "/login" });
  if (error) throw new Error(`signInWithGoogle: ${error.code ?? error.status} ${error.message ?? ""}`.trim());
}

/** Logout: cabut sesi saat ini di server + hapus cookie. */
export async function signOut(): Promise<void> {
  const { error } = await authClient.signOut();
  if (error) throw new Error(`signOut: ${error.code ?? error.status} ${error.message ?? ""}`.trim());
}
