/** Lingkungan browser yang dipakai copyText; bisa diganti di unit test. */
export type ClipboardEnv = {
  isSecureContext: boolean;
  clipboard?: Pick<Clipboard, "writeText">;
  document: Pick<Document, "createElement" | "execCommand" | "body" | "activeElement">;
};

const browserEnv = (): ClipboardEnv => ({
  isSecureContext: window.isSecureContext,
  clipboard: navigator.clipboard,
  document,
});

/**
 * Salin teks ke clipboard. Clipboard API hanya ada di secure context (HTTPS/localhost);
 * app yang dibuka lewat `http://0.0.0.0` atau IP LAN tidak punya `navigator.clipboard`, jadi jatuh ke execCommand.
 */
export async function copyText(text: string, env: ClipboardEnv = browserEnv()): Promise<void> {
  let apiError: unknown;
  if (env.isSecureContext && env.clipboard) {
    try {
      await env.clipboard.writeText(text);
      return;
    } catch (err) {
      // NotAllowedError (mis. dokumen tidak fokus / izin ditolak) masih bisa ditolong execCommand.
      if (!(err instanceof DOMException && err.name === "NotAllowedError")) throw new Error("clipboard: writeText gagal", { cause: err });
      apiError = err;
    }
  }
  if (!execCommandCopy(text, env.document)) {
    throw new Error(`clipboard: salin gagal (secure=${env.isSecureContext}, api=${!!env.clipboard}, execCommand=false)`, {
      cause: apiError,
    });
  }
}

// execCommand('copy') deprecated tapi masih didukung semua browser utama dan satu-satunya jalur di non-secure context.
// Hapus bila app selalu disajikan lewat HTTPS/localhost atau browser mencabut execCommand.
function execCommandCopy(text: string, doc: ClipboardEnv["document"]): boolean {
  const prevFocus = doc.activeElement as HTMLElement | null;
  const ta = doc.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  doc.body.appendChild(ta);
  ta.select();
  try {
    return doc.execCommand("copy");
  } finally {
    ta.remove();
    prevFocus?.focus?.();
  }
}
