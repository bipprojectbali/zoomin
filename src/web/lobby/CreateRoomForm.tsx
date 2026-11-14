import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRoom } from "@/api.client";
import { errorMessage } from "@/error.message";
import { SAFE_ID_PATTERN, type RoomSummary } from "../../shared/api.types";

const TEXT = {
  heading: "Buat room",
  id: "ID room",
  idHint: "Huruf, angka, - atau _, maks 64 karakter",
  title: "Judul",
  submit: "Buat",
  submitting: "Membuat…",
};

/** Samakan dengan TITLE_MAX_LENGTH di server (rooms.route.ts); validasi final di server. */
const TITLE_MAX_LENGTH = 100;

/** Form buat room (admin global). */
export function CreateRoomForm({ onCreated }: { onCreated: (room: RoomSummary) => void }) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom({ id: id.trim(), title: title.trim() });
      onCreated(room);
      setId("");
      setTitle("");
    } catch (err) {
      console.error("lobby: buat room gagal", err);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3 rounded-xl border p-4" onSubmit={onSubmit} aria-labelledby="create-room-heading">
      <h2 id="create-room-heading" className="font-semibold">
        {TEXT.heading}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-id">{TEXT.id}</Label>
          <Input
            id="room-id"
            required
            pattern={SAFE_ID_PATTERN}
            title={TEXT.idHint}
            aria-describedby="room-id-hint"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <p id="room-id-hint" className="text-xs text-muted-foreground">
            {TEXT.idHint}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-title">{TEXT.title}</Label>
          <Input
            id="room-title"
            required
            maxLength={TITLE_MAX_LENGTH}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={busy}>
        {busy ? TEXT.submitting : TEXT.submit}
      </Button>
    </form>
  );
}
