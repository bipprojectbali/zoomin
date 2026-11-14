import { useState } from "react";
import { toast } from "sonner";
import { updateRoom } from "@/api.client";
import { errorMessage } from "@/error.message";
import type { RoomSummary, UpdateRoomBody } from "../../shared/api.types";

/** PATCH room + toast sukses/error; `patch` resolve true bila berhasil. */
export function useRoomPatch(roomId: string, onChanged: (room: RoomSummary) => void) {
  const [busy, setBusy] = useState(false);
  async function patch(body: UpdateRoomBody, success: string): Promise<boolean> {
    setBusy(true);
    try {
      onChanged(await updateRoom(roomId, body));
      toast.success(success);
      return true;
    } catch (err) {
      console.error(`room-settings: ubah room ${roomId} gagal`, err);
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, patch };
}
