/** Hook sinkron layout: room.metadata (siaran LiveKit) + GET/PUT /api/rooms/:id/layout (CAS). */
import { RoomEvent, type Room } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutState } from "../../shared/layout.model";
import { getLayout, putLayout } from "../api.client";
import { baseVersionOf, isConflict, layoutFromMetadata, layoutFromResponse, pickNewer } from "./layout.sync.logic";
import { STAGE_LABELS } from "./stage.labels";

export function useLayoutSync(
  room: Room | null,
  roomId: string,
): { layout: LayoutState | null; commit: (next: LayoutState) => Promise<void>; error: string | null } {
  const [layout, setLayout] = useState<LayoutState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Salinan sinkron state terkini: dipakai pickNewer & baseVersion tanpa menunggu render.
  const current = useRef<LayoutState | null>(null);

  const replace = useCallback((next: LayoutState | null) => {
    current.current = next;
    setLayout(next);
  }, []);
  const apply = useCallback(
    (incoming: LayoutState | null) => {
      const next = pickNewer(current.current, incoming);
      if (next !== current.current) replace(next);
    },
    [replace],
  );
  const fail = useCallback((message: string, e: unknown) => {
    console.error(`[layout] room=${roomId} ${message}`, e);
    setError(message);
  }, [roomId]);
  const reload = useCallback(
    () => getLayout(roomId).then((res) => apply(layoutFromResponse(res)), (e) => fail(STAGE_LABELS.layoutLoadFailed, e)),
    [roomId, apply, fail],
  );

  useEffect(() => {
    replace(null);
    setError(null);
    if (!room) return;
    let alive = true;
    const fromMetadata = (metadata: string | undefined) => {
      if (!alive) return false;
      const { layout: parsed, error: parseError } = layoutFromMetadata(metadata);
      if (parseError) fail(STAGE_LABELS.layoutInvalid, parseError);
      apply(parsed);
      return parsed !== null;
    };
    if (!fromMetadata(room.metadata)) void reload();
    room.on(RoomEvent.RoomMetadataChanged, fromMetadata);
    return () => {
      alive = false;
      room.off(RoomEvent.RoomMetadataChanged, fromMetadata);
    };
  }, [room, roomId, apply, replace, fail, reload]);

  const commit = useCallback(
    async (next: LayoutState) => {
      const previous = current.current;
      const baseVersion = baseVersionOf(previous);
      const optimistic = { ...next, version: baseVersion };
      replace(optimistic);
      try {
        const res = await putLayout(roomId, { baseVersion, layout: next });
        setError(null);
        apply({ ...next, version: res.version });
      } catch (e) {
        // Rollback hanya bila belum ditimpa state yang lebih baru (mis. siaran metadata admin lain).
        if (current.current === optimistic) replace(previous);
        if (isConflict(e)) {
          fail(STAGE_LABELS.layoutConflict, e);
          await reload();
        } else {
          fail(STAGE_LABELS.layoutSaveFailed, e);
        }
      }
    },
    [roomId, apply, replace, fail, reload],
  );

  return { layout, commit, error };
}
