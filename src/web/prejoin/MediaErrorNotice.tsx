import { MediaDeviceFailure } from "livekit-client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaErrorMessage } from "@/error.message";
import { PREJOIN_TEXT, type MediaKind } from "./prejoin.labels";

/** Pesan error perangkat + panduan membuka izin (UX-09); join tetap bisa tanpa perangkat ini. */
export function MediaErrorNotice({ errors }: { errors: Partial<Record<MediaKind, Error | null>> }) {
  const entries = (Object.entries(errors) as [MediaKind, Error | null][]).filter((e): e is [MediaKind, Error] => !!e[1]);
  if (!entries.length) return null;
  const denied = entries.some(([, err]) => MediaDeviceFailure.getFailure(err) === MediaDeviceFailure.PermissionDenied);
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex min-w-0 flex-col gap-1">
        {entries.map(([kind, err]) => (
          <p key={kind} className="font-medium">
            {mediaErrorMessage(err, kind)}
          </p>
        ))}
        {denied && <p className="text-muted-foreground">{PREJOIN_TEXT.permissionHint}</p>}
        <p className="text-muted-foreground">{PREJOIN_TEXT.noDeviceHint}</p>
        {denied && (
          <Button type="button" variant="outline" size="sm" className="mt-1 self-start" onClick={() => location.reload()}>
            {PREJOIN_TEXT.reload}
          </Button>
        )}
      </div>
    </div>
  );
}
