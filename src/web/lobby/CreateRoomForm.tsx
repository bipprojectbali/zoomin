import { ChevronRight, Loader2, Plus } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRoom } from "@/api.client";
import { errorMessage } from "@/error.message";
import { SAFE_ID_HTML_PATTERN, type RoomSummary } from "../../shared/api.types";
import { slugifyRoomId } from "../../shared/room.id";
import { withStableSuffix } from "./lobby.format";

const TEXT = {
  heading: "Buat room baru",
  title: "Judul room",
  titlePlaceholder: "mis. Rapat desain mingguan",
  advanced: "Opsi lanjutan",
  id: "ID room",
  idHint: "Dipakai di alamat room. Huruf, angka, - atau _, maks 64 karakter. Otomatis dari judul.",
  submit: "Buat room",
  submitting: "Membuat…",
  created: (title: string) => `Room "${title}" dibuat`,
};

/** Samakan dengan TITLE_MAX_LENGTH di server (rooms.route.ts); validasi final di server. */
const TITLE_MAX_LENGTH = 100;

/** Form buat room (admin global): cukup judul; ID diturunkan otomatis, bisa diedit di Opsi lanjutan. */
export function CreateRoomForm({ onCreated }: { onCreated: (room: RoomSummary) => void }) {
  const [title, setTitle] = useState("");
  const [customId, setCustomId] = useState<string | null>(null);
  const [suffix, setSuffix] = useState(() => slugifyRoomId(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = customId ?? withStableSuffix(slugifyRoomId(title), suffix);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom({ id: id.trim(), title: title.trim() });
      onCreated(room);
      toast.success(TEXT.created(room.title));
      setTitle("");
      setCustomId(null);
      setSuffix(slugifyRoomId(""));
    } catch (err) {
      console.error("lobby: buat room gagal", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      data-testid="create-room-form"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
      onSubmit={onSubmit}
      // Field ID invalid di <details> tertutup tak bisa difokus browser: buka dulu agar pesan validasinya tampil.
      onInvalidCapture={(e) => (e.target as HTMLElement).closest("details")?.setAttribute("open", "")}
      aria-labelledby="create-room-heading"
    >
      <h2 id="create-room-heading" className="font-semibold">
        {TEXT.heading}
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="room-title">{TEXT.title}</Label>
          <Input
            id="room-title"
            required
            maxLength={TITLE_MAX_LENGTH}
            placeholder={TEXT.titlePlaceholder}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-describedby={error ? "create-room-error" : undefined}
          />
        </div>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {busy ? TEXT.submitting : TEXT.submit}
        </Button>
      </div>
      <details className="group text-sm">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
          {TEXT.advanced}
        </summary>
        <div className="mt-3 flex flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="room-id">{TEXT.id}</Label>
          <Input
            id="room-id"
            required
            pattern={SAFE_ID_HTML_PATTERN}
            title={TEXT.idHint}
            aria-describedby="room-id-hint"
            className="font-mono"
            value={id}
            onChange={(e) => setCustomId(e.target.value)}
          />
          <p id="room-id-hint" className="text-xs text-muted-foreground">
            {TEXT.idHint}
          </p>
        </div>
      </details>
      {error && (
        <p id="create-room-error" className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
