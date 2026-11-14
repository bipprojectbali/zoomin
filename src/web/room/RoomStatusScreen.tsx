import { ArrowLeft, LogOut, RotateCw, Unplug, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canRetry, type ConnectionError } from "./room.connection";
import { ROOM_STATUS_TEXT } from "./room.labels";

export type RoomStatusKind = "left" | "disconnected" | "error";

const TEXT = ROOM_STATUS_TEXT;

const ICON = { left: LogOut, disconnected: Unplug, error: TriangleAlert } satisfies Record<RoomStatusKind, unknown>;

type Props = {
  kind: RoomStatusKind;
  error?: ConnectionError | null;
  onRejoin: () => void;
  onLobby: () => void;
};

function rejoinLabel(kind: RoomStatusKind, error: ConnectionError | null): string {
  if (kind === "left") return TEXT.rejoin;
  if (error?.kind === "duplicate_session") return TEXT.useHere;
  return kind === "disconnected" ? TEXT.reconnect : TEXT.retry;
}

/** Layar penuh keluar / terputus / gagal join dengan jalan keluar jelas (UX-11, UX-24, UX-26, BUG-03). */
export function RoomStatusScreen({ kind, error = null, onRejoin, onLobby }: Props) {
  const Icon = ICON[kind];
  const retryable = kind === "left" || canRetry(error);
  const duplicate = kind !== "left" && error?.kind === "duplicate_session";
  const hint =
    kind === "left"
      ? TEXT.leftHint
      : duplicate
        ? TEXT.duplicateHint
        : retryable
          ? null
          : TEXT.noRetryHint;

  return (
    <section
      data-testid="room-status-screen"
      data-kind={kind}
      role={kind === "left" ? "status" : "alert"}
      className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-xl font-semibold">{duplicate ? TEXT.duplicateTitle : TEXT.title[kind]}</h2>
      {kind !== "left" && error && <p className="max-w-md text-muted-foreground">{error.message}</p>}
      {hint && <p className="max-w-md text-sm text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {retryable && (
          <Button type="button" onClick={onRejoin} autoFocus>
            <RotateCw />
            {rejoinLabel(kind, error)}
          </Button>
        )}
        <Button type="button" variant={retryable ? "outline" : "default"} onClick={onLobby} autoFocus={!retryable}>
          <ArrowLeft />
          {TEXT.lobby}
        </Button>
      </div>
    </section>
  );
}
