import { DataPacket_Kind, type RoomServiceClient } from "livekit-server-sdk";
import { STAGE_EVENT_TOPIC, type StageEvent } from "../shared/api.types";

/** roomService cukup sendData agar mudah di-fake di test. */
export type StageNotifyDeps = { roomService: Pick<RoomServiceClient, "sendData"> };

/**
 * Kirim StageEvent ke semua peserta room (S5, reliable, topic `zoomin.stage`).
 * ponytail: tanpa filter identity pengelola; isi tidak sensitif dan UI yang memilah. Filter `destinationIdentities` bila perlu.
 * Best effort: gagal (mis. room LiveKit belum ada) hanya warn; klien GET stage-requests saat join/reconnect.
 */
export async function notifyStage(deps: StageNotifyDeps, event: StageEvent): Promise<void> {
  const { roomId, id } = event.request;
  try {
    const data = new TextEncoder().encode(JSON.stringify(event));
    await deps.roomService.sendData(roomId, data, DataPacket_Kind.RELIABLE, { topic: STAGE_EVENT_TOPIC });
  } catch (cause) {
    console.warn(`[stage] notify ${event.type} request=${id} room=${roomId} failed`, cause);
  }
}
