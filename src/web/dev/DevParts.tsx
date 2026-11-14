import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEV_TEXT } from "./dev.labels";

/** Kotak pesan ringkas (error/peringatan) untuk panel /dev; `onRetry` menampilkan tombol "Coba lagi". */
export function DevNotice({ tone = "error", children, onRetry }: { tone?: "error" | "warning"; children: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
        tone === "error" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw />
          {DEV_TEXT.retry}
        </Button>
      )}
    </div>
  );
}

/** Judul kecil + deskripsi di atas isi panel, plus slot aksi di kanan. */
export function DevSectionHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** "Muat lagi" / indikator memuat di bawah tabel ber-cursor. */
export function PagerFooter({ loading, hasMore, onMore }: { loading: boolean; hasMore: boolean; onMore: () => void }) {
  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {DEV_TEXT.loading}
      </p>
    );
  }
  if (!hasMore) return null;
  return (
    <Button variant="outline" size="sm" className="self-center" onClick={onMore}>
      {DEV_TEXT.loadMore}
    </Button>
  );
}
