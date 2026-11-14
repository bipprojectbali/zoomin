/** Kontrol multi screen share: "Tambah layar" + daftar layar aktif dengan tombol stop per layar. */
import { useEffect, useState } from "react";
import type { Room } from "livekit-client";
import { Loader2, MonitorUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ActiveScreen, ScreenPublisher, ScreenShareCancelled } from "./screen.publisher";

const TEXT = {
  add: "Tambah layar",
  picking: "Memilih layar…",
  stop: (name: string) => `Hentikan ${name}`,
  unsupported: "Browser ini tidak mendukung berbagi layar (gunakan browser desktop).",
  cancelled: "Berbagi layar dibatalkan.",
  noAudio: "Audio layar tidak ikut terbagi. Audio hanya tersedia di Chrome/Edge saat berbagi tab.",
  failed: "Gagal berbagi layar",
} as const;

type Notice = { tone: "info" | "error"; text: string } | null;

const supportsDisplayMedia = () => typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

export function ScreenControls({ room }: { room: Room }) {
  const [publisher, setPublisher] = useState<ScreenPublisher | null>(null);
  const [screens, setScreens] = useState<ActiveScreen[]>([]);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // Satu publisher per Room (= per koneksi) agar nomor layar tidak dipakai ulang.
  useEffect(() => {
    const p = new ScreenPublisher(room);
    setPublisher(p);
    setScreens([]);
    const off = p.onChange(setScreens);
    return () => {
      off();
      p.dispose().catch((err: unknown) => console.error("ScreenControls: dispose publisher gagal", err));
    };
  }, [room]);

  if (!supportsDisplayMedia()) {
    return <p className="text-sm text-muted-foreground">{TEXT.unsupported}</p>;
  }

  const report = (context: string, err: unknown) => {
    console.error(`ScreenControls: ${context}`, err);
    setNotice({ tone: "error", text: `${TEXT.failed}: ${err instanceof Error ? err.message : String(err)}` });
  };

  const add = async () => {
    if (!publisher) return;
    setPicking(true);
    setNotice(null);
    try {
      const added = await publisher.addScreen();
      if (!added.audio) setNotice({ tone: "info", text: TEXT.noAudio });
    } catch (err) {
      if (err instanceof ScreenShareCancelled) setNotice({ tone: "info", text: TEXT.cancelled });
      else report("tambah layar", err);
    } finally {
      setPicking(false);
    }
  };

  const stop = (name: string) => {
    publisher?.stopScreen(name).catch((err: unknown) => report(`stop ${name}`, err));
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={add} disabled={picking || !publisher}>
        {picking ? <Loader2 className="animate-spin" /> : <MonitorUp />}
        {picking ? TEXT.picking : TEXT.add}
      </Button>
      {screens.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {screens.map((s) => (
            <li key={s.video} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
              {s.video}
              <Button variant="ghost" size="icon-xs" onClick={() => stop(s.video)} aria-label={TEXT.stop(s.video)}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p role="status" className={notice.tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
