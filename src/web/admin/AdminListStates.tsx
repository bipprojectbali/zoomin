import { AlertCircle, Loader2, RotateCw, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ADMIN_TEXT as TEXT } from "./admin.labels";

const SKELETON_ROWS = 5;

/** Skeleton baris saat muat awal. */
export function ListSkeleton() {
  return (
    <div className="flex flex-col divide-y rounded-lg border" role="status" aria-label={TEXT.loading}>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-56 max-w-[50vw]" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** State kosong dengan ikon, judul, keterangan, aksi opsional. */
export function ListEmpty({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted" aria-hidden="true">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

/** State error dengan tombol coba lagi. */
export function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center" role="alert">
      <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
      <p className="font-medium">{TEXT.loadFailed}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCw />
        {TEXT.retry}
      </Button>
    </div>
  );
}

/** Tombol "Muat lagi" (cursor). */
export function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="self-center" disabled={loading} onClick={onClick}>
      {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
      {loading ? TEXT.loadingMore : TEXT.loadMore}
    </Button>
  );
}
