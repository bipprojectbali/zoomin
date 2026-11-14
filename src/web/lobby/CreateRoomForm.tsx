import { ChevronRight, Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maxExpiry, presetExpiry, toLocalInput, type ExpiryPreset } from "@/room-settings/room.expiry";
import { ROOM_SETTINGS_TEXT } from "@/room-settings/room-settings.labels";
import { VisibilityToggle } from "@/room-settings/VisibilityToggle";
import { createRoom } from "@/api.client";
import { errorMessage } from "@/error.message";
import { InvitePicker, type InvitePickerHandle } from "@/invite-picker/InvitePicker";
import { validInvites, type InviteEntry } from "@/invite-picker/invite.parse";
import { INVITE_PICKER_TEXT } from "@/invite-picker/invite-picker.labels";
import { SAFE_ID_PATTERN, type RoomSummary, type RoomVisibility } from "../../shared/api.types";
import { slugifyRoomId } from "../../shared/room.id";
import { effectiveRoomId, withStableSuffix } from "./lobby.format";

const TEXT = {
  heading: "Buat room baru",
  title: "Judul room",
  titlePlaceholder: "mis. Rapat desain mingguan",
  advanced: "Opsi lanjutan",
  id: "ID room",
  idHint: "Dipakai di alamat room. Huruf, angka, - atau _, maks 64 karakter. Otomatis dari judul bila dikosongkan.",
  idInvalid: "ID room hanya boleh huruf, angka, - atau _ (tanpa spasi), maks 64 karakter.",
  expiry: "Kadaluarsa",
  expiryDate: "Tanggal kadaluarsa",
  submit: "Buat room",
  submitting: "Membuat…",
  created: (title: string) => `Room "${title}" dibuat`,
};

/** Samakan dengan TITLE_MAX_LENGTH di server (rooms.route.ts); validasi final di server. */
const TITLE_MAX_LENGTH = 100;
const SAFE_ID = new RegExp(SAFE_ID_PATTERN);
const EXPIRY_PRESETS: readonly ExpiryPreset[] = ["none", "1", "7", "30", "custom"];

/** Form buat room (admin global): cukup judul; ID diturunkan otomatis, bisa diedit di Opsi lanjutan. */
export function CreateRoomForm({ onCreated }: { onCreated: (room: RoomSummary) => void }) {
  const [title, setTitle] = useState("");
  const [customId, setCustomId] = useState<string | null>(null);
  const [suffix, setSuffix] = useState(() => slugifyRoomId(""));
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("none");
  const [expiryDate, setExpiryDate] = useState("");
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const picker = useRef<InvitePickerHandle>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoId = withStableSuffix(slugifyRoomId(title), suffix);
  const id = effectiveRoomId(customId, autoId);
  const idRef = useRef<HTMLInputElement>(null);
  // Validasi sendiri (pesan Indonesia), bukan pesan native `pattern` yang ikut bahasa browser (QA-07).
  useEffect(() => idRef.current?.setCustomValidity(SAFE_ID.test(id) ? "" : TEXT.idInvalid), [id]);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const expiresAt = presetExpiry(expiryPreset, expiryDate, Date.now());
    if (expiresAt === undefined) {
      setError(ROOM_SETTINGS_TEXT.expiryInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Picker hanya tampil untuk Private; undangan yang tersisa saat beralih ke Public tidak dikirim.
      const members = visibility === "private" ? validInvites(picker.current?.flush() ?? invites) : [];
      const room = await createRoom({ id, title: title.trim(), visibility, expiresAt, ...(members.length ? { members } : {}) });
      onCreated(room);
      toast.success(TEXT.created(room.title));
      setTitle("");
      setCustomId(null);
      setSuffix(slugifyRoomId(""));
      setVisibility("public");
      setExpiryPreset("none");
      setExpiryDate("");
      setInvites([]);
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
      <VisibilityToggle value={visibility} onChange={setVisibility} disabled={busy} />
      {visibility === "private" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-room-invite">{INVITE_PICKER_TEXT.label}</Label>
          <InvitePicker ref={picker} value={invites} onChange={setInvites} inputId="create-room-invite" describedBy="create-room-invite-hint" disabled={busy} />
          <p id="create-room-invite-hint" className="text-xs text-muted-foreground">
            {INVITE_PICKER_TEXT.hint}
          </p>
        </div>
      )}
      <details className="group text-sm">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
          {TEXT.advanced}
        </summary>
        <div className="mt-3 flex flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="room-id">{TEXT.id}</Label>
          <Input
            id="room-id"
            ref={idRef}
            aria-describedby="room-id-hint"
            className="font-mono"
            placeholder={autoId}
            value={customId ?? autoId}
            onChange={(e) => setCustomId(e.target.value)}
            // Dikosongkan → kembali ke slug otomatis dari judul (QA-17).
            onBlur={() => customId !== null && !customId.trim() && setCustomId(null)}
          />
          <p id="room-id-hint" className="text-xs text-muted-foreground">
            {TEXT.idHint}
          </p>
          <Label htmlFor="room-expiry" className="mt-2">
            {TEXT.expiry}
          </Label>
          <Select value={expiryPreset} onValueChange={(v) => setExpiryPreset(v as ExpiryPreset)}>
            <SelectTrigger id="room-expiry" data-testid="create-room-expiry" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {ROOM_SETTINGS_TEXT.expiryPreset[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {expiryPreset === "custom" && (
            <Input
              type="datetime-local"
              aria-label={TEXT.expiryDate}
              data-testid="create-room-expiry-date"
              required
              min={toLocalInput(Date.now())}
              max={toLocalInput(maxExpiry(Date.now()))}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          )}
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
