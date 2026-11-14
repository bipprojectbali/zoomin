import { CalendarDays, LogIn } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/role.label";
import type { RoomSummary } from "../../shared/api.types";
import { InviteLinks } from "./InviteLinks";
import { formatDateTime } from "./lobby.format";

const TEXT = {
  enter: "Masuk",
  enterLabel: (title: string) => `Masuk ke room ${title}`,
  created: (when: string) => `Dibuat ${when}`,
  notMember: "Admin global",
  invites: "Undang orang",
};

/** Satu room di lobby: judul, ID, peran, tanggal, tombol Masuk, dan undangan bila boleh. */
export function RoomCard({ room, canInvite }: { room: RoomSummary; canInvite: boolean }) {
  return (
    <li data-testid="room-item" data-room-id={room.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{room.title}</h3>
            <Badge variant={room.role === "admin" ? "default" : "secondary"}>
              {room.role ? ROLE_LABEL[room.role] : TEXT.notMember}
            </Badge>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate font-mono">{room.id}</span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {TEXT.created(formatDateTime(room.createdAt))}
            </span>
          </p>
        </div>
        <Button asChild size="sm">
          <Link to={`/rooms/${encodeURIComponent(room.id)}`} aria-label={TEXT.enterLabel(room.title)}>
            <LogIn aria-hidden="true" />
            {TEXT.enter}
          </Link>
        </Button>
      </div>
      {canInvite && (
        <section className="flex flex-col gap-2 border-t pt-4" aria-label={TEXT.invites}>
          <h4 className="text-sm font-medium">{TEXT.invites}</h4>
          <InviteLinks roomId={room.id} />
        </section>
      )}
    </li>
  );
}
