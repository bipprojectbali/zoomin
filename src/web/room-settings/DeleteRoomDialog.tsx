import { toast } from "sonner";
import { deleteRoom } from "@/api.client";
import { ConfirmDeleteDialog } from "@/admin/ConfirmDeleteDialog";
import { errorMessage } from "@/error.message";
import type { RoomSummary } from "../../shared/api.types";
import { ROOM_SETTINGS_TEXT as TEXT } from "./room-settings.labels";

type Props = { room: RoomSummary; open: boolean; onOpenChange: (open: boolean) => void; onDeleted: (roomId: string) => void };

/** Konfirmasi hapus room (pengelola, R8): tombol aktif setelah ID room diketik. */
export function DeleteRoomDialog({ room, open, onOpenChange, onDeleted }: Props) {
  async function confirm() {
    try {
      await deleteRoom(room.id);
    } catch (err) {
      console.error(`room-settings: hapus room ${room.id} gagal`, err);
      toast.error(errorMessage(err));
      throw err; // dialog tetap terbuka
    }
    toast.success(TEXT.deleted(room.title));
    onDeleted(room.id);
  }
  return (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={onOpenChange}
      title={TEXT.deleteTitle(room.title)}
      description={TEXT.deleteBody}
      submitLabel={TEXT.deleteHeading}
      confirmText={room.id}
      onConfirm={confirm}
    />
  );
}
