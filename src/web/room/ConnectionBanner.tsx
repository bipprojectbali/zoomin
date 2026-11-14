import type { Room } from "livekit-client";
import { Loader2, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "./room.connection";
import { elapsedLabel, useNetworkBanner } from "./room.network";

const TEXT = { reconnecting: "Koneksi terputus, menyambung ulang…", weak: "Koneksi lemah, video bisa tersendat" };
const TICK_MS = 1000;

/** Detik berjalan sejak `since` (null = tidak menghitung). */
function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [since]);
  return since === null ? null : now - since;
}

/**
 * Banner di atas stage (UX-11, QA-05): muncul begitu browser offline / kualitas lokal `lost`, sebelum LiveKit
 * menyatakan Reconnecting, plus lama mencoba. Region aria-live selalu ada agar perubahan terbaca.
 */
export function ConnectionBanner({ room, status }: { room: Room; status: ConnectionStatus }) {
  const { kind, since } = useNetworkBanner(room, status);
  const elapsed = useElapsed(since);
  return (
    <div role="status" aria-live="polite">
      {kind && (
        <div
          data-testid="connection-banner"
          data-kind={kind}
          className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1 text-sm font-medium text-amber-950"
        >
          {kind === "lost" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Wifi className="size-4" aria-hidden="true" />
          )}
          {kind === "lost" ? TEXT.reconnecting : TEXT.weak}
          {/* Hitungan detik tidak dibacakan tiap tik oleh pembaca layar. */}
          {elapsed !== null && <span aria-hidden="true" className="tabular-nums">· {elapsedLabel(elapsed)}</span>}
        </div>
      )}
    </div>
  );
}
