/** State request stage di room (S4–S7): antrean pengelola + request milik sendiri, data channel + GET awal. */
import { useTracks } from "@livekit/components-react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ApiRequestError,
  approveStageRequest,
  cancelStageRequest,
  createStageRequest,
  denyStageRequest,
  listStageRequests,
} from "@/api.client";
import { errorMessage } from "@/error.message";
import type { LayoutSync } from "@/stage/layout.sync";
import { avatarRefs } from "@/stage/stage.resolve";
import { sharedEffectiveLayout } from "@/stage/stage.split";
import type { StageEvent, StageRequest, StageRequestAction } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";
import { applyStageRequest } from "./stage.request.apply";
import { EXPIRY_TICK_MS, livePending, removeRequest, upsertRequest } from "./stage.request.queue";
import { showRequestToast } from "./StageRequestToast";
import { useStageEvents } from "./useStageEvents";

// Sama dengan sumber track Stage agar layout efektif saat approve = yang dirender Stage.
const SOURCES = [Track.Source.Camera, Track.Source.ScreenShare];

export type StageRequests = {
  /** Pending untuk pengelola (kosong bila bukan pengelola). */
  queue: StageRequest[];
  approve: (req: StageRequest) => Promise<void>;
  deny: (req: StageRequest) => Promise<void>;
  /** Request pending milik sendiri. */
  own: StageRequest | null;
  request: (trackName: string, action: StageRequestAction) => Promise<void>;
  cancel: () => Promise<void>;
};

export function useStageRequests(room: Room, roomId: string, isManager: boolean, sync: Pick<LayoutSync, "update">): StageRequests {
  const me = room.localParticipant.identity;
  const [items, setItems] = useState<StageRequest[]>([]);
  const [own, setOwn] = useState<StageRequest | null>(null);
  const [now, setNow] = useState(Date.now);
  const tracks = useTracks(SOURCES, { room, onlySubscribed: false });
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;

  const fail = (op: string, e: unknown) => {
    console.error(`[stage] ${op} room=${roomId} gagal`, e);
    toast.error(errorMessage(e));
  };

  const deny = async (req: StageRequest) => {
    toast.dismiss(req.id);
    setItems((xs) => removeRequest(xs, req.id));
    await denyStageRequest(roomId, req.id).catch((e: unknown) => fail(`deny ${req.id}`, e));
  };

  const approve = async (req: StageRequest) => {
    toast.dismiss(req.id);
    let saved: boolean;
    try {
      saved = await sync.update((cur) => {
        const people = [room.localParticipant, ...room.remoteParticipants.values()];
        const effective = sharedEffectiveLayout(cur, tracksRef.current, avatarRefs(people, tracksRef.current));
        const next = applyStageRequest(effective, req, me);
        return next === effective ? cur : next;
      });
    } catch (e) {
      console.error(`[stage] approve ${req.id}: layout tidak bisa diterapkan`, e);
      saved = false;
    }
    if (!saved) {
      toast.error(TEXT.approveFailed);
      return;
    }
    setItems((xs) => removeRequest(xs, req.id));
    await approveStageRequest(roomId, req.id).catch((e: unknown) => fail(`approve ${req.id}`, e));
  };

  // Ref agar handler event/GET memakai approve/deny terbaru (bergantung pada sync & track terkini).
  const actions = useRef({ approve, deny });
  actions.current = { approve, deny };
  const toastFor = useCallback(
    (req: StageRequest) => showRequestToast(req, () => void actions.current.approve(req), () => void actions.current.deny(req)),
    [],
  );

  useEffect(() => {
    if (!isManager) return setItems([]);
    let alive = true;
    const load = () =>
      listStageRequests(roomId).then(
        (res) => alive && setItems(res.items),
        (e: unknown) => console.error(`[stage] muat request room=${roomId} gagal`, e),
      );
    void load();
    room.on(RoomEvent.Reconnected, load);
    return () => {
      alive = false;
      room.off(RoomEvent.Reconnected, load);
    };
  }, [room, roomId, isManager]);

  useStageEvents(room, (ev: StageEvent) => {
    const req = ev.request;
    if (ev.type === "request.created") {
      if (req.userId === me) setOwn(req);
      else if (isManager) {
        setItems((xs) => upsertRequest(xs, req));
        toastFor(req);
      }
      return;
    }
    toast.dismiss(req.id);
    setItems((xs) => removeRequest(xs, req.id));
    if (req.userId !== me) return;
    setOwn((o) => (o?.id === req.id ? null : o));
    if (req.status === "approved") toast.success(TEXT.result.approved);
    else if (req.status === "denied" || req.status === "expired") toast(TEXT.result[req.status]);
  });

  const active = items.length > 0 || own !== null;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(t);
  }, [active]);

  const request = async (trackName: string, action: StageRequestAction) => {
    try {
      setOwn(await createStageRequest(roomId, { trackName, action }));
      toast.success(TEXT.requestSent);
    } catch (e) {
      fail(`request ${trackName}`, e);
    }
  };

  const cancel = async () => {
    if (!own) return;
    setOwn(null);
    // 404 = sudah selesai/kedaluwarsa di server: state lokal sudah benar.
    await cancelStageRequest(roomId, own.id).catch((e: unknown) => {
      if (!(e instanceof ApiRequestError && e.code === "stage_request_not_found")) fail(`cancel ${own.id}`, e);
    });
  };

  const liveOwn = own && livePending([own], now).length > 0 ? own : null;
  return { queue: livePending(items, now), approve, deny, own: liveOwn, request, cancel };
}
