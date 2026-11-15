/** Hook sinkron stage: envelope room.metadata (siaran LiveKit, S2) + GET/PUT /api/rooms/:id/layout (CAS). */
import { RoomEvent, type Room } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutState } from "../../shared/layout.model";
import type { StageMode } from "../../shared/stage.types";
import { getLayout, putLayout } from "../api.client";
import { baseVersionOf, isConflict, layoutFromResponse, pickNewer, stageFromMetadata } from "./layout.sync.logic";
import { STAGE_LABELS } from "./stage.labels";

type PutResult = "ok" | "conflict" | "error";

export type LayoutSync = {
  layout: LayoutState | null;
  stageMode: StageMode;
  /** PUT optimistis; gagal → rollback + error (konflik → reload). */
  commit: (next: LayoutState) => Promise<void>;
  /**
   * Hitung layout dari state bersama terkini lalu PUT; konflik → reload lalu hitung ulang & ulangi sekali (S6).
   * `fn` mengembalikan state yang sama = tidak ada perubahan. Resolve true bila tersimpan / tak perlu berubah.
   */
  update: (fn: (current: LayoutState | null) => LayoutState | null) => Promise<boolean>;
  error: string | null;
};

export function useLayoutSync(room: Room | null, roomId: string): LayoutSync {
  const [layout, setLayout] = useState<LayoutState | null>(null);
  const [stageMode, setStageMode] = useState<StageMode>("host");
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
    () =>
      getLayout(roomId).then(
        (res) => {
          setStageMode(res.stageMode);
          apply(layoutFromResponse(res));
        },
        (e) => fail(STAGE_LABELS.layoutLoadFailed, e),
      ),
    [roomId, apply, fail],
  );

  useEffect(() => {
    replace(null);
    setStageMode("host");
    setError(null);
    if (!room) return;
    let alive = true;
    const fromMetadata = (metadata: string | undefined) => {
      if (!alive) return false;
      const parsed = stageFromMetadata(metadata);
      if (parsed.error) fail(STAGE_LABELS.layoutInvalid, parsed.error);
      // Mode ikut berubah walau layout sama (ganti mode tidak menaikkan version).
      if (parsed.stageMode) setStageMode(parsed.stageMode);
      apply(parsed.layout);
      return parsed.layout !== null;
    };
    if (!fromMetadata(room.metadata)) void reload();
    room.on(RoomEvent.RoomMetadataChanged, fromMetadata);
    return () => {
      alive = false;
      room.off(RoomEvent.RoomMetadataChanged, fromMetadata);
    };
  }, [room, roomId, apply, replace, fail, reload]);

  const put = useCallback(
    async (next: LayoutState): Promise<PutResult> => {
      const previous = current.current;
      const baseVersion = baseVersionOf(previous);
      const optimistic = { ...next, version: baseVersion };
      replace(optimistic);
      try {
        const res = await putLayout(roomId, { baseVersion, layout: next });
        setError(null);
        apply({ ...next, version: res.version });
        return "ok";
      } catch (e) {
        // Rollback hanya bila belum ditimpa state yang lebih baru (mis. siaran metadata admin lain).
        if (current.current === optimistic) replace(previous);
        if (isConflict(e)) {
          fail(STAGE_LABELS.layoutConflict, e);
          await reload();
          return "conflict";
        }
        fail(STAGE_LABELS.layoutSaveFailed, e);
        return "error";
      }
    },
    [roomId, apply, replace, fail, reload],
  );

  const commit = useCallback(async (next: LayoutState) => void (await put(next)), [put]);

  const update = useCallback(
    async (fn: (current: LayoutState | null) => LayoutState | null) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = current.current;
        const next = fn(before);
        if (next === null || next === before) return true;
        const result = await put(next);
        if (result !== "conflict") return result === "ok";
      }
      return false;
    },
    [put],
  );

  return { layout, stageMode, commit, update, error };
}
