import { CalendarDays, Clock, LogIn, MoreHorizontal, Settings, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DeleteRoomDialog } from "@/room-settings/DeleteRoomDialog";
import { RoomBadges } from "@/room-settings/RoomBadges";
import { isRoomBlocked } from "@/room-settings/room.expiry";
import { ROOM_SETTINGS_TEXT, STATUS_TEXT } from "@/room-settings/room-settings.labels";
import { RoomSettingsDialog, type RoomSettingsTab } from "@/room-settings/RoomSettingsDialog";
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
  invite: "Undang",
  inviteLabel: (title: string) => `Undang orang ke room ${title}`,
};

type Props = { room: RoomSummary; onChanged: (room: RoomSummary) => void; onDeleted: (roomId: string) => void };

/**
 * Satu room di lobby: judul, ID, peran, badge tipe/status, Masuk, dan untuk pengelola: Undang + menu ⋯. Panel
 * undangan tertutup default (QA-15). Room private tidak punya link undangan: Undang membuka tab Anggota (R1).
 */
export function RoomCard({ room, onChanged, onDeleted }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<RoomSettingsTab | null>(null);
  const [deleting, setDeleting] = useState(false);
  const panelId = `invite-panel-${room.id}`;
  const blocked = isRoomBlocked(room);
  const linkInvites = room.canManage && room.visibility === "public";

  function invite() {
    if (linkInvites) setInviteOpen((o) => !o);
    else setSettingsTab("members");
  }

  return (
    <li data-testid="room-item" data-room-id={room.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{room.title}</h3>
            <Badge variant={room.role === "host" ? "default" : "secondary"}>{room.role ? ROLE_LABEL[room.role] : TEXT.notMember}</Badge>
            <RoomBadges room={room} />
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate font-mono">{room.id}</span>
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {TEXT.created(formatDateTime(room.createdAt))}
            </span>
            {room.expiresAt !== null && (
              <span className="flex items-center gap-1" data-testid="room-expires">
                <Clock className="size-3.5" aria-hidden="true" />
                {ROOM_SETTINGS_TEXT.expiryAt(formatDateTime(room.expiresAt))}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {room.canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="invite-toggle"
              aria-expanded={linkInvites ? inviteOpen : undefined}
              aria-controls={linkInvites ? panelId : undefined}
              aria-label={TEXT.inviteLabel(room.title)}
              onClick={invite}
            >
              <UserPlus aria-hidden="true" />
              <span className="hidden sm:inline">{TEXT.invite}</span>
            </Button>
          )}
          {blocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span fokusable: tombol disabled tidak memicu tooltip */}
                <span tabIndex={0} className="rounded-md">
                  <Button size="sm" disabled data-testid="room-enter" aria-label={TEXT.enterLabel(room.title)}>
                    <LogIn aria-hidden="true" />
                    {TEXT.enter}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{STATUS_TEXT[room.status].reason}</TooltipContent>
            </Tooltip>
          ) : (
            <Button asChild size="sm" data-testid="room-enter">
              <Link to={`/rooms/${encodeURIComponent(room.id)}`} aria-label={TEXT.enterLabel(room.title)}>
                <LogIn aria-hidden="true" />
                {TEXT.enter}
              </Link>
            </Button>
          )}
          {room.canManage && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={ROOM_SETTINGS_TEXT.menu(room.title)} data-testid="room-menu">
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setSettingsTab("general")} data-testid="room-menu-settings">
                  <Settings aria-hidden="true" />
                  {ROOM_SETTINGS_TEXT.menuSettings}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={invite} data-testid="room-menu-invite">
                  <UserPlus aria-hidden="true" />
                  {ROOM_SETTINGS_TEXT.menuInvite}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)} data-testid="room-menu-delete">
                  <Trash2 aria-hidden="true" />
                  {ROOM_SETTINGS_TEXT.menuDelete}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {linkInvites && (
        <section id={panelId} hidden={!inviteOpen} className="flex flex-col gap-2 border-t pt-4" aria-label={TEXT.invites}>
          <h4 className="text-sm font-medium">{TEXT.invites}</h4>
          <InviteLinks roomId={room.id} />
        </section>
      )}
      {settingsTab && (
        <RoomSettingsDialog
          room={room}
          open
          initialTab={settingsTab}
          onOpenChange={(o) => !o && setSettingsTab(null)}
          onChanged={onChanged}
          onDeleted={onDeleted}
        />
      )}
      {room.canManage && <DeleteRoomDialog room={room} open={deleting} onOpenChange={setDeleting} onDeleted={onDeleted} />}
    </li>
  );
}
