import { useParticipants } from "@livekit/components-react";
import { ConnectionQuality, RoomEvent, type Participant, type Room } from "livekit-client";
import { Mic, MicOff, MonitorUp, SignalHigh, SignalLow, SignalMedium, SignalZero } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/role.label";
import { countScreens, displayName, imageFromMetadata, initials, roleFromMetadata, sortParticipants } from "./participants.model";
import { PARTICIPANTS_TEXT } from "./room.labels";

const TEXT = PARTICIPANTS_TEXT;

const QUALITY_ICON = {
  [ConnectionQuality.Excellent]: SignalHigh,
  [ConnectionQuality.Good]: SignalMedium,
  [ConnectionQuality.Poor]: SignalLow,
  [ConnectionQuality.Lost]: SignalZero,
  [ConnectionQuality.Unknown]: SignalZero,
} satisfies Record<ConnectionQuality, unknown>;

/** Jumlah peserta di room (termasuk diri sendiri) untuk badge tombol Peserta. */
export function useParticipantCount(room: Room | null): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!room) return;
    const sync = () => setCount(room.remoteParticipants.size + 1);
    sync();
    room.on(RoomEvent.ParticipantConnected, sync).on(RoomEvent.ParticipantDisconnected, sync);
    return () => {
      room.off(RoomEvent.ParticipantConnected, sync).off(RoomEvent.ParticipantDisconnected, sync);
    };
  }, [room]);
  return room ? count : 0;
}

type Props = { room: Room; open: boolean; onOpenChange: (open: boolean) => void };

/** Panel kanan daftar peserta (UX-04): avatar, peran, mic, bicara, layar dibagikan, kualitas koneksi. */
export function ParticipantsPanel({ room, open, onOpenChange }: Props) {
  // Default useParticipants re-render pada bicara/mute/track/metadata/kualitas, jadi baris cukup membaca properti.
  const participants = sortParticipants(useParticipants({ room }));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="participants-panel">
        <SheetHeader>
          <SheetTitle>{TEXT.title(participants.length)}</SheetTitle>
          <SheetDescription>{TEXT.description}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-1 px-4 pb-4">
            {participants.map((p) => (
              <ParticipantRow key={p.identity} participant={p} />
            ))}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ParticipantRow({ participant: p }: { participant: Participant }) {
  const name = displayName(p);
  const role = roleFromMetadata(p.metadata);
  const image = imageFromMetadata(p.metadata);
  const screens = countScreens([...p.trackPublications.values()].map((pub) => pub.trackName));
  const QualityIcon = QUALITY_ICON[p.connectionQuality];
  const micOn = p.isMicrophoneEnabled;

  return (
    <li
      data-testid="participant-row"
      data-identity={p.identity}
      data-role={role ?? ""}
      className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
    >
      <Avatar className={cn("size-9 ring-2 ring-transparent", p.isSpeaking && "ring-primary")}>
        {image && <AvatarImage src={image} alt={name} referrerPolicy="no-referrer" loading="lazy" />}
        <AvatarFallback>{initials(name) || "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name} {p.isLocal && <span className="text-muted-foreground">{TEXT.you}</span>}
        </p>
        <div className="flex items-center gap-1.5">
          {role && <Badge variant="secondary">{ROLE_LABEL[role]}</Badge>}
          {p.isSpeaking && <span className="text-xs text-primary">{TEXT.speaking}</span>}
        </div>
      </div>
      {screens > 0 && (
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground" title={TEXT.screens(screens)}>
          <MonitorUp className="size-4" aria-hidden="true" />
          <span aria-hidden="true">{screens}</span>
          <span className="sr-only">{TEXT.screens(screens)}</span>
        </span>
      )}
      {role !== "viewer" && (
        <span title={micOn ? TEXT.micOn : TEXT.micOff}>
          {micOn ? (
            <Mic className="size-4" aria-hidden="true" />
          ) : (
            <MicOff className="size-4 text-destructive" aria-hidden="true" />
          )}
          <span className="sr-only">{micOn ? TEXT.micOn : TEXT.micOff}</span>
        </span>
      )}
      <span title={TEXT.quality[p.connectionQuality]}>
        <QualityIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{TEXT.quality[p.connectionQuality]}</span>
      </span>
    </li>
  );
}
