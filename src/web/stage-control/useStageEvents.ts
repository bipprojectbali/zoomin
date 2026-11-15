/** Dengarkan event stage dari data channel LiveKit (topic STAGE_EVENT_TOPIC, S5). */
import { RoomEvent, type Room } from "livekit-client";
import { useEffect, useRef } from "react";
import { STAGE_EVENT_TOPIC, type StageEvent } from "../../shared/api.types";
import { parseStageEvent } from "./stage.request.queue";

export function useStageEvents(room: Room, onEvent: (ev: StageEvent) => void): void {
  // Ref: handler terbaru tanpa memasang ulang listener tiap render.
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => {
    const onData = (payload: Uint8Array, _p?: unknown, _k?: unknown, topic?: string) => {
      if (topic !== STAGE_EVENT_TOPIC) return;
      const ev = parseStageEvent(payload);
      if (ev) handler.current(ev);
      else console.warn("[stage] event data channel tidak dikenal diabaikan");
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);
}
