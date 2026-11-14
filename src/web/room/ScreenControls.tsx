/** Multi screen share: tombol "Bagikan layar" (+ jumlah aktif) dan menu daftar layar dengan stop per layar. */
import { useEffect, useState } from "react";
import type { Room } from "livekit-client";
import { ChevronUp, Loader2, MonitorUp, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { errorMessage } from "@/error.message";
import { ControlTooltip } from "./ControlTooltip";
import { ROOM_LABELS, screenLabel } from "./room.labels";
import { type ActiveScreen, ScreenPublisher, ScreenShareCancelled } from "./screen.publisher";

const supportsDisplayMedia = () => typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

// Info "audio tidak ikut" cukup sekali per halaman (UX-18), bukan tiap layar.
let audioHintShown = false;

export function ScreenControls({ room, disabled }: { room: Room; disabled: boolean }) {
  const [publisher, setPublisher] = useState<ScreenPublisher | null>(null);
  const [screens, setScreens] = useState<ActiveScreen[]>([]);
  const [picking, setPicking] = useState(false);

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

  // Mobile umumnya tidak punya getDisplayMedia: sembunyikan tombol, bukan teks panjang (UX-20).
  if (!supportsDisplayMedia()) return null;

  const report = (context: string, err: unknown) => {
    console.error(`ScreenControls: ${context}`, err);
    toast.error(`${ROOM_LABELS.shareFailed}: ${errorMessage(err)}`);
  };

  const add = async () => {
    if (!publisher) return;
    setPicking(true);
    try {
      const added = await publisher.addScreen();
      if (!added.audio && !audioHintShown) {
        audioHintShown = true;
        toast.info(ROOM_LABELS.noScreenAudio);
      }
    } catch (err) {
      // Batal memilih = keputusan user, tidak perlu notifikasi.
      if (!(err instanceof ScreenShareCancelled)) report("tambah layar", err);
    } finally {
      setPicking(false);
    }
  };

  const stop = (name: string) => {
    publisher?.stopScreen(name).catch((err: unknown) => report(`stop ${name}`, err));
  };

  const count = screens.length;
  const label = picking ? ROOM_LABELS.picking : count > 0 ? ROOM_LABELS.shareCount(count) : ROOM_LABELS.share;

  return (
    <div className="flex items-center rounded-full bg-muted/60 pr-1">
      <ControlTooltip label={count > 0 ? ROOM_LABELS.addScreen : label}>
        <Button
          type="button"
          variant={count > 0 ? "default" : "secondary"}
          size="icon-lg"
          className="relative rounded-full"
          aria-label={label}
          disabled={disabled || picking || !publisher}
          onClick={() => void add()}
          data-testid="add-screen"
        >
          {picking ? <Loader2 className="animate-spin" /> : <MonitorUp />}
          {count > 0 && (
            <span aria-hidden className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground ring-2 ring-background">
              {count}
            </span>
          )}
        </Button>
      </ControlTooltip>
      {count > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" className="rounded-full" aria-label={ROOM_LABELS.activeScreens} disabled={disabled} data-testid="screen-list">
              <ChevronUp />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel>{ROOM_LABELS.activeScreens}</DropdownMenuLabel>
            {screens.map((s) => (
              <DropdownMenuItem
                key={s.video}
                onSelect={() => stop(s.video)}
                aria-label={ROOM_LABELS.stopScreen(screenLabel(s.video))}
                data-testid="stop-screen"
                data-track-name={s.video}
              >
                <Square className="text-destructive" />
                <span className="flex-1">{screenLabel(s.video)}</span>
                <span className="text-xs text-muted-foreground">{ROOM_LABELS.stop}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
