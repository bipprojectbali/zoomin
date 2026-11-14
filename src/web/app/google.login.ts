import { authClient } from "@/auth.client";
import { authErrorMessage } from "@/error.message";

/**
 * Mulai login Google lalu kembali ke `callbackURL` (path internal). Resolve = browser sedang diarahkan ke Google;
 * reject dengan pesan Indonesia (mis. PROVIDER_NOT_FOUND → "Login Google belum dikonfigurasi admin server.").
 * Memanggil authClient langsung (bukan signInWithGoogle) supaya `error.code` Better Auth tidak hilang di pesan string.
 */
export async function startGoogleLogin(callbackURL: string): Promise<void> {
  const { error } = await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: "/login" });
  if (error) {
    const code = error.code ?? String(error.status);
    console.error("login: signIn.social gagal", { code, status: error.status });
    throw new Error(authErrorMessage(code));
  }
}
