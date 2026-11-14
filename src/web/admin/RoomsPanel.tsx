import { ExternalLink, Globe, Lock, LockKeyhole, MoreHorizontal, Settings, Trash2, Video } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { deleteAdminRoom, listAdminRooms } from "@/api.client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/error.message";
import { ROLE_LABEL } from "@/role.label";
import { ROOM_SETTINGS_TEXT, STATUS_TEXT, VISIBILITY_TEXT } from "@/room-settings/room-settings.labels";
import { RoomSettingsDialog } from "@/room-settings/RoomSettingsDialog";
import type { AdminRoomSummary, RoomSummary } from "../../shared/api.types";
import { ListEmpty, ListError, ListSkeleton, LoadMoreButton } from "./AdminListStates";
import { ADMIN_PAGE_SIZE } from "./admin.filters";
import { formatDate } from "./admin.format";
import { ADMIN_TEXT as TEXT } from "./admin.labels";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { useCursorList } from "./useCursorList";
import { useMediaQuery } from "./useMediaQuery";

const DESKTOP_QUERY = "(min-width: 768px)";
const roomHref = (id: string) => `/rooms/${encodeURIComponent(id)}`;

/** Tab "Room": semua room + status live; aksi Buka / Hapus room. */
export function RoomsPanel() {
  const fetchPage = useCallback((cursor?: string) => listAdminRooms({ limit: ADMIN_PAGE_SIZE, cursor }), []);
  const list = useCursorList<AdminRoomSummary>(fetchPage, "rooms");
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [pending, setPending] = useState<AdminRoomSummary | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const settingsRoom = list.items.find((r) => r.id === settingsId);
  const onChanged = (room: RoomSummary) => list.setItems((prev) => prev.map((r) => (r.id === room.id ? { ...r, ...room } : r)));

  async function remove(room: AdminRoomSummary) {
    const index = list.items.findIndex((r) => r.id === room.id);
    list.setItems((prev) => prev.filter((r) => r.id !== room.id));
    try {
      await deleteAdminRoom(room.id);
      toast.success(TEXT.roomDeleted(room.title));
    } catch (err) {
      list.setItems((prev) => [...prev.slice(0, index), room, ...prev.slice(index)]);
      console.error(`admin: hapus room ${room.id} gagal`, err);
      toast.error(errorMessage(err));
      throw err;
    }
  }

  const initialLoading = list.loading && list.items.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {list.error && list.items.length === 0 ? (
        <ListError message={list.error} onRetry={list.reload} />
      ) : initialLoading ? (
        <ListSkeleton />
      ) : list.items.length === 0 ? (
        <ListEmpty icon={Video} title={TEXT.roomsEmptyTitle} body={TEXT.roomsEmptyBody} />
      ) : desktop ? (
        <div className="rounded-lg border" aria-busy={list.loading}>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{TEXT.colRoom}</TableHead>
                <TableHead>{TEXT.colHost}</TableHead>
                <TableHead className="text-right">{TEXT.colMembers}</TableHead>
                <TableHead>{ROOM_SETTINGS_TEXT.colType}</TableHead>
                <TableHead>{TEXT.colStatus}</TableHead>
                <TableHead>{ROOM_SETTINGS_TEXT.colLive}</TableHead>
                <TableHead>{TEXT.colCreated}</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">{TEXT.colActions}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.map((r) => (
                <TableRow key={r.id} data-testid="room-admin-row" data-room-id={r.id}>
                  <TableCell className="pl-4">
                    <RoomIdentity room={r} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.role ? ROLE_LABEL[r.role] : TEXT.notMember}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.members}</TableCell>
                  <TableCell>
                    <RoomType room={r} />
                  </TableCell>
                  <TableCell>
                    <RoomAccessStatus room={r} />
                  </TableCell>
                  <TableCell>
                    <RoomStatus room={r} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <RoomActions room={r} onSettings={() => setSettingsId(r.id)} onDelete={() => setPending(r)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border" aria-busy={list.loading}>
          {list.items.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-3" data-testid="room-admin-row" data-room-id={r.id}>
              <div className="flex items-start justify-between gap-2">
                <RoomIdentity room={r} />
                <RoomActions room={r} onSettings={() => setSettingsId(r.id)} onDelete={() => setPending(r)} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <RoomType room={r} />
                <RoomAccessStatus room={r} />
                <RoomStatus room={r} />
                <span>{TEXT.members(r.members)}</span>
                <span>{formatDate(r.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.error && list.items.length > 0 && <p className="text-center text-sm text-destructive" role="alert">{list.error}</p>}
      {list.hasMore && list.items.length > 0 && <LoadMoreButton loading={list.loading} onClick={list.loadMore} />}

      {settingsRoom && (
        <RoomSettingsDialog
          room={settingsRoom}
          open
          onOpenChange={(o) => !o && setSettingsId(null)}
          onChanged={onChanged}
          onDeleted={(id) => list.setItems((prev) => prev.filter((r) => r.id !== id))}
        />
      )}

      {pending && (
        <ConfirmDeleteDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={TEXT.deleteRoomTitle(pending.title)}
          description={TEXT.deleteRoomDescription}
          submitLabel={TEXT.deleteRoomSubmit}
          onConfirm={() => remove(pending)}
        />
      )}
    </div>
  );
}

function RoomIdentity({ room }: { room: AdminRoomSummary }) {
  return (
    <div className="flex min-w-0 flex-col">
      <Link to={roomHref(room.id)} className="truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none">
        {room.title}
      </Link>
      <span className="truncate font-mono text-xs text-muted-foreground">{room.id}</span>
    </div>
  );
}

function RoomType({ room }: { room: AdminRoomSummary }) {
  const Icon = { public: Globe, password: LockKeyhole, private: Lock }[room.visibility];
  return (
    <span className="flex items-center gap-1 text-sm" data-testid="room-admin-type" data-value={room.visibility}>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {VISIBILITY_TEXT[room.visibility].label}
    </span>
  );
}

function RoomAccessStatus({ room }: { room: AdminRoomSummary }) {
  return (
    <Badge variant={room.status === "active" ? "secondary" : "outline"} data-testid="room-admin-status" data-status={room.status}>
      {STATUS_TEXT[room.status].label}
    </Badge>
  );
}

function RoomStatus({ room }: { room: AdminRoomSummary }) {
  if (!room.live) return <span className="text-sm text-muted-foreground">{ROOM_SETTINGS_TEXT.notLive}</span>;
  return (
    <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
      {TEXT.roomActive(room.participants)}
    </Badge>
  );
}

function RoomActions({ room, onSettings, onDelete }: { room: AdminRoomSummary; onSettings: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={TEXT.actionsFor(room.title)} data-testid="room-actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => navigate(roomHref(room.id))}>
          <ExternalLink />
          {TEXT.openRoom}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onSettings} data-testid="room-settings">
          <Settings />
          {ROOM_SETTINGS_TEXT.menuSettings}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete} data-testid="delete-room">
          <Trash2 />
          {TEXT.deleteRoom}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
