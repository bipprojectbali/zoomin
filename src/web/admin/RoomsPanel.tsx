import { ExternalLink, MoreHorizontal, Trash2, Video } from "lucide-react";
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
import type { AdminRoomSummary } from "../../shared/api.types";
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
                <TableHead>{TEXT.colStatus}</TableHead>
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
                    <RoomStatus room={r} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <RoomActions room={r} onDelete={() => setPending(r)} />
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
                <RoomActions room={r} onDelete={() => setPending(r)} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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

function RoomStatus({ room }: { room: AdminRoomSummary }) {
  if (!room.active) return <span className="text-sm text-muted-foreground">{TEXT.roomInactive}</span>;
  return (
    <Badge variant="outline" className="gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
      {TEXT.roomActive(room.participants)}
    </Badge>
  );
}

function RoomActions({ room, onDelete }: { room: AdminRoomSummary; onDelete: () => void }) {
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
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete} data-testid="delete-room">
          <Trash2 />
          {TEXT.deleteRoom}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
