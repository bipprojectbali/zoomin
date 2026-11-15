/** Room tersambung: header (judul, peran, stage control), stage, control bar, panel peserta. */
import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABEL } from "@/role.label";
import { requestTileActions } from "@/stage-control/stage.tile.actions";
import { StageModeBadge } from "@/stage-control/StageModeBadge";
import { StageModeMenu } from "@/stage-control/StageModeMenu";
import { StageRequestsPanel } from "@/stage-control/StageRequestsPanel";
import { useStageRequests } from "@/stage-control/useStageRequests";
import { useLayoutSync } from "@/stage/layout.sync";
import { Stage } from "@/stage/Stage";
import type { RoomRole, RoomSummary } from "../../shared/api.types";
import { AudioBlockedBanner } from "./AudioBlockedBanner";
import { ConnectionBanner } from "./ConnectionBanner";
import { ControlBar } from "./ControlBar";
import { ParticipantsPanel, useParticipantCount } from "./ParticipantsPanel";
import { canPublishFor, controlsEnabled, type ConnectionStatus } from "./room.connection";
import { useRoomToasts } from "./room.toasts";

export function ConnectedRoom({ room, roomId, title, role, status, summary, onSummaryChanged, onLeave, onRoomDeleted }: {
  room: Room;
  roomId: string;
  title: string;
  role: RoomRole | null;
  status: ConnectionStatus;
  summary: RoomSummary | null;
  onSummaryChanged: (room: RoomSummary) => void;
  onLeave: () => void;
  onRoomDeleted: () => void;
}) {
  const sync = useLayoutSync(room, roomId);
  const { layout, stageMode, commit, error } = sync;
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const participantCount = useParticipantCount(room);
  useRoomToasts(room, room.localParticipant.identity);
  const enabled = controlsEnabled(status);
  // Pengelola = host room atau admin global (diperlakukan host, A7); izin final tetap di server (S3).
  const isManager = role === "host";
  const editable = enabled && (isManager || (stageMode === "open" && role === "participant"));
  const requests = useStageRequests(room, roomId, isManager, sync);
  const canRequest = enabled && stageMode === "request" && role === "participant";

  return (
    <RoomContext.Provider value={room}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <h1 className="min-w-0 flex-1 truncate font-semibold">{title}</h1>
        <StageModeBadge mode={stageMode} />
        {isManager && (stageMode === "request" || requests.queue.length > 0) && (
          <StageRequestsPanel queue={requests.queue} onApprove={(r) => void requests.approve(r)} onDeny={(r) => void requests.deny(r)} />
        )}
        {isManager && <StageModeMenu roomId={roomId} mode={stageMode} disabled={!enabled} onSummaryChanged={onSummaryChanged} />}
        {role && <Badge variant="outline">{ROLE_LABEL[role]}</Badge>}
      </header>
      <ConnectionBanner room={room} status={status} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <AudioBlockedBanner room={room} />
        {error && (
          <p className="absolute inset-x-0 top-0 z-10 bg-destructive/10 px-4 py-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Stage
          room={room}
          layout={layout}
          editable={editable}
          onCommit={(next) => void commit(next)}
          tileActions={canRequest ? (ref, isOwn) => requestTileActions(ref, isOwn, requests) : undefined}
        />
      </main>
      <ControlBar
        room={room}
        roomId={roomId}
        enabled={enabled}
        canPublish={canPublishFor(role)}
        canInvite={isManager}
        summary={summary}
        onSummaryChanged={onSummaryChanged}
        onRoomDeleted={onRoomDeleted}
        participantCount={participantCount}
        onOpenParticipants={() => setParticipantsOpen(true)}
        onLeave={onLeave}
      />
      <ParticipantsPanel room={room} open={participantsOpen} onOpenChange={setParticipantsOpen} />
      <RoomAudioRenderer room={room} />
    </RoomContext.Provider>
  );
}
