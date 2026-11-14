import { Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { RoomSummary } from "../../shared/api.types";
import { RoomCard } from "./RoomCard";

const TEXT = {
  heading: "Room Anda",
  loading: "Memuat daftar room…",
  loadMore: "Muat lagi",
  loadingMore: "Memuat…",
  emptyTitle: "Belum ada room",
  emptyAdmin: "Buat room pertama lewat form di atas, lalu bagikan link undangan.",
  emptyUserTitle: "Belum ada undangan",
  emptyUser: "Anda belum diundang ke room mana pun. Minta link undangan ke host/admin.",
};

const SKELETON_COUNT = 3;

type Props = {
  /** Admin global: boleh buat room & mengundang ke semua room. */
  canCreate: boolean;
  rooms: RoomSummary[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

/** Daftar room lobby: skeleton saat load awal, state kosong, kartu room, tombol Muat lagi. */
export function RoomList({ canCreate, rooms, loading, hasMore, onLoadMore }: Props) {
  const initialLoading = loading && rooms.length === 0;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="room-list-heading" aria-busy={loading}>
      <h2 id="room-list-heading" className="font-semibold">
        {TEXT.heading}
      </h2>
      {initialLoading && (
        <div className="flex flex-col gap-3" role="status" aria-label={TEXT.loading}>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-xl border p-5">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-64 max-w-[50vw]" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      )}
      {!loading && rooms.length === 0 && (
        <div data-testid="rooms-empty" className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted" aria-hidden="true">
            <Video className="size-5 text-muted-foreground" />
          </span>
          <p className="font-medium">{canCreate ? TEXT.emptyTitle : TEXT.emptyUserTitle}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{canCreate ? TEXT.emptyAdmin : TEXT.emptyUser}</p>
        </div>
      )}
      {rooms.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} canInvite={canCreate || room.role === "host"} />
          ))}
        </ul>
      )}
      {hasMore && rooms.length > 0 && (
        <Button type="button" variant="outline" className="self-center" disabled={loading} onClick={onLoadMore}>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {loading ? TEXT.loadingMore : TEXT.loadMore}
        </Button>
      )}
    </section>
  );
}
