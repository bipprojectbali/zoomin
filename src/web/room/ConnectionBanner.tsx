import { Loader2 } from "lucide-react";
import type { ConnectionStatus } from "./room.connection";

const TEXT = { reconnecting: "Koneksi terputus, menyambung ulang…" };

/** Banner kuning tipis di atas stage saat reconnect (UX-11). Region aria-live selalu ada agar perubahan terbaca. */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  return (
    <div role="status" aria-live="polite">
      {status === "reconnecting" && (
        <div
          data-testid="connection-banner"
          className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1 text-sm font-medium text-amber-950"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {TEXT.reconnecting}
        </div>
      )}
    </div>
  );
}
