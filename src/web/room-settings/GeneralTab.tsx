import { Loader2 } from "lucide-react";
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
import type { RoomSummary, RoomVisibility, UpdateRoomBody } from "../../shared/api.types";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";
import { useRoomPatch } from "./useRoomPatch";
import { VisibilityToggle } from "./VisibilityToggle";

/** Samakan dengan TITLE_MAX_LENGTH server (rooms.manage.route.ts). */
const TITLE_MAX_LENGTH = 100;

/** Tab Umum: judul + tipe; pindah ke private minta konfirmasi dulu (R4). */
export function GeneralTab({ room, onChanged }: { room: RoomSummary; onChanged: (room: RoomSummary) => void }) {
  const [title, setTitle] = useState(room.title);
  const [visibility, setVisibility] = useState<RoomVisibility>(room.visibility);
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const { busy, patch } = useRoomPatch(room.id, onChanged);

  const body: UpdateRoomBody = {
    ...(title.trim() !== room.title ? { title: title.trim() } : {}),
    ...(visibility !== room.visibility ? { visibility } : {}),
  };
  const dirty = Object.keys(body).length > 0;

  function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (body.visibility === "private") setConfirmPrivate(true);
    else void patch(body, TEXT.saved);
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
      <Button type="submit" className="self-end" disabled={busy || !dirty || !title.trim()} data-testid="room-settings-save">
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        {busy ? TEXT.saving : TEXT.save}
      </Button>
      <AlertDialog open={confirmPrivate} onOpenChange={setConfirmPrivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{TEXT.privateConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{TEXT.privateConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{TEXT.cancel}</AlertDialogCancel>
            <AlertDialogAction data-testid="visibility-private-confirm" onClick={() => void patch(body, TEXT.saved)}>
              {TEXT.privateConfirmSubmit}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
