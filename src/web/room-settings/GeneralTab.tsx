import { KeyRound, Loader2 } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/room-password/PasswordField";
import { PasswordOnceDialog } from "@/room-password/PasswordOnceDialog";
import { ROOM_PASSWORD_TEXT } from "@/room-password/room-password.labels";
import type { RoomSummary, RoomVisibility, UpdateRoomBody } from "../../shared/api.types";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";
import { useRoomPatch } from "./useRoomPatch";
import { VisibilityToggle } from "./VisibilityToggle";

/** Samakan dengan TITLE_MAX_LENGTH server (rooms.manage.route.ts). */
const TITLE_MAX_LENGTH = 100;

/** Isi dialog konfirmasi: pindah ke private (R4) dan/atau menghapus password (W7). */
function confirmText(from: RoomVisibility, to: RoomVisibility | undefined): { title: string; body: string; submit: string } | null {
  const clearsPassword = from === "password" && to !== undefined && to !== "password";
  if (to === "private") {
    const body = clearsPassword ? `${TEXT.privateConfirmBody} ${ROOM_PASSWORD_TEXT.clearConfirmPrivateExtra}` : TEXT.privateConfirmBody;
    return { title: TEXT.privateConfirmTitle, body, submit: TEXT.privateConfirmSubmit };
  }
  if (clearsPassword) {
    return { title: ROOM_PASSWORD_TEXT.clearConfirmTitle, body: ROOM_PASSWORD_TEXT.clearConfirmPublic, submit: ROOM_PASSWORD_TEXT.clearConfirmSubmit };
  }
  return null;
}

/** Tab Umum: judul + tipe (+ password); pindah ke private / hapus password minta konfirmasi dulu (R4, W7). */
export function GeneralTab({ room, onChanged }: { room: RoomSummary; onChanged: (room: RoomSummary) => void }) {
  const [title, setTitle] = useState(room.title);
  const [visibility, setVisibility] = useState<RoomVisibility>(room.visibility);
  const [password, setPassword] = useState("");
  // Room sudah password: kolom baru muncul setelah "Ganti password" (password lama tak bisa dilihat, W2).
  const [changing, setChanging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const { busy, patch } = useRoomPatch(room.id, onChanged);

  const showPassword = visibility === "password" && (room.visibility !== "password" || changing);
  const sendPassword = showPassword && password !== "";
  const body: UpdateRoomBody = {
    ...(title.trim() !== room.title ? { title: title.trim() } : {}),
    ...(visibility !== room.visibility || sendPassword ? { visibility } : {}),
    ...(sendPassword ? { password } : {}),
  };
  const dirty = Object.keys(body).length > 0;
  const confirm = confirmText(room.visibility, body.visibility);

  async function save() {
    if (!(await patch(body, TEXT.saved))) return;
    if (body.password) setSavedPassword(body.password);
    setPassword("");
    setChanging(false);
  }

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm) setConfirming(true);
    else void save();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="room-settings-title">{TEXT.roomTitle}</Label>
        <Input
          id="room-settings-title"
          data-testid="room-settings-title"
          required
          maxLength={TITLE_MAX_LENGTH}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{TEXT.visibility}</span>
        <VisibilityToggle value={visibility} onChange={setVisibility} disabled={busy} />
      </div>
      {visibility === "password" && room.visibility === "password" && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          data-testid="change-password"
          // Bukan aria-expanded: RoomSettingsDialog menahan Escape bila elemen fokus aria-expanded="true".
          aria-pressed={changing}
          disabled={busy}
          onClick={() => {
            setChanging((c) => !c);
            setPassword("");
          }}
        >
          <KeyRound aria-hidden="true" />
          {changing ? ROOM_PASSWORD_TEXT.cancelChange : ROOM_PASSWORD_TEXT.change}
        </Button>
      )}
      {showPassword && <PasswordField id="room-settings-password" value={password} onChange={setPassword} disabled={busy} autoFocus={changing} />}
      <Button type="submit" className="self-end" disabled={busy || !dirty || !title.trim()} data-testid="room-settings-save">
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {busy ? TEXT.saving : TEXT.save}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{TEXT.cancel}</AlertDialogCancel>
            <AlertDialogAction
              data-testid={body.visibility === "private" ? "visibility-private-confirm" : "password-clear-confirm"}
              onClick={() => void save()}
            >
              {confirm?.submit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PasswordOnceDialog password={savedPassword} onClose={() => setSavedPassword(null)} />
    </form>
  );
}
