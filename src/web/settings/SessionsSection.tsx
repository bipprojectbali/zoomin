import { Laptop, Loader2, LogOut, RotateCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { listMySessions, revokeMySession, revokeOtherSessions } from "@/api.client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/error.message";
import type { MySession } from "../../shared/api.types";
import { describeUserAgent, relativeTime } from "./session.device";
import { SETTINGS_TEXT } from "./settings.labels";

const TEXT = SETTINGS_TEXT.sessions;
const MOBILE_UA = /Mobile|Android|iPhone|iPad/;

/** Daftar sesi aktif + cabut satu / semua perangkat lain. */
export function SessionsSection() {
  const [items, setItems] = useState<MySession[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await listMySessions();
      // Perangkat ini di atas, sisanya terbaru dulu.
      setItems([...res.items].sort((a, b) => Number(b.current) - Number(a.current) || b.createdAt - a.createdAt));
    } catch (err) {
      console.error("settings: GET /api/me/sessions gagal", err);
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, action: () => Promise<void>, ok: string) {
    setBusy(key);
    try {
      await action();
      toast.success(ok);
      await load();
    } catch (err) {
      console.error("settings: cabut sesi gagal", { key }, err);
      toast.error(TEXT.failed(errorMessage(err)));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-3" role="alert">
        <p className="text-sm">
          {TEXT.loadFailed} {loadError}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RotateCw aria-hidden="true" />
          {TEXT.retry}
        </Button>
      </div>
    );
  }
  if (!items) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label={TEXT.loading}>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  const others = items.filter((s) => !s.current).length;
  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y rounded-lg border">
        {items.map((s) => {
          const Icon = s.userAgent && MOBILE_UA.test(s.userAgent) ? Smartphone : Laptop;
          return (
            <li key={s.id} data-testid="session-row" className="flex items-center gap-3 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {describeUserAgent(s.userAgent)}
                  {s.current && (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      {TEXT.thisDevice}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {s.ip ?? TEXT.unknownIp} · {TEXT.since(relativeTime(s.createdAt))}
                </span>
              </div>
              {!s.current && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="session-revoke"
                  disabled={busy !== null}
                  onClick={() => void run(s.id, () => revokeMySession(s.id), TEXT.revoked)}
                >
                  {busy === s.id && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {TEXT.revoke}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy !== null}
          data-testid="session-revoke-others"
          onClick={() => void run("others", revokeOtherSessions, TEXT.revokedOthers)}
        >
          {busy === "others" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          {TEXT.revokeOthers}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{TEXT.noOthers}</p>
      )}
    </div>
  );
}
