import { Video } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nama & tagline aplikasi (satu sumber untuk login, lobby, 404). */
export const APP_NAME = "zoomin";
export const APP_TAGLINE = "Video meetings with many screens at once";

/** Logo + nama app; `tagline` menampilkan tagline di bawah nama. */
export function AppBrand({ tagline = false, className }: { tagline?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm"
      >
        <Video className="size-4.5" strokeWidth={2.25} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        {tagline && <span className="text-sm text-muted-foreground">{APP_TAGLINE}</span>}
      </span>
    </div>
  );
}
