import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RoomSummary } from "../../shared/api.types";
import { statusBadgeStatus } from "./room.expiry";
import { STATUS_TEXT, VISIBILITY_TEXT } from "./room-settings.labels";

/** Badge Private (gembok) dan status Nonaktif/Kadaluarsa; room public aktif tidak diberi badge. */
export function RoomBadges({ room }: { room: Pick<RoomSummary, "visibility" | "status"> }) {
  const status = statusBadgeStatus(room.status);
  return (
    <>
      {room.visibility === "private" && (
        <Badge variant="outline" className="gap-1" data-testid="room-badge-private">
          <Lock className="size-3" aria-hidden="true" />
          {VISIBILITY_TEXT.private.label}
        </Badge>
      )}
      {status && (
        <Badge
          variant="outline"
          data-testid="room-badge-status"
          data-status={status}
          className={status === "expired" ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "border-destructive/40 bg-destructive/10 text-destructive"}
        >
          {STATUS_TEXT[status].label}
        </Badge>
      )}
    </>
  );
}
