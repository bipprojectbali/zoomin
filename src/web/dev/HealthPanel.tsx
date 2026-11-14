import { Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SystemHealth } from "../../shared/api.types";
import { getSystemHealth } from "../api.client";
import { errorMessage } from "../error.message";
import { DevNotice, DevSectionHeader } from "./DevParts";
import { formatBytes, formatUptime } from "./dev.format";
import { DEV_TEXT } from "./dev.labels";

const T = DEV_TEXT.health;
const AUTO_REFRESH_MS = 30_000;
const TIME = new Intl.DateTimeFormat("id-ID", { timeStyle: "medium" });

/** Tab Ringkasan: status LiveKit, versi/uptime, DB, jumlah super admin; auto refresh 30 dtk saat tab browser terlihat. */
export function HealthPanel() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await getSystemHealth());
      setError(null);
      setLoadedAt(Date.now());
    } catch (err) {
      console.error("dev: GET /api/dev/health gagal", err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const tick = () => document.visibilityState === "visible" && void load();
    const timer = setInterval(tick, AUTO_REFRESH_MS);
    // Kembali ke tab browser → muat segera, tidak menunggu interval berikutnya.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  return (
    <section className="flex flex-col gap-4">
      <DevSectionHeader
        title={DEV_TEXT.tabs.health}
        description={loadedAt ? `${T.updatedAt(TIME.format(loadedAt))} · ${T.autoRefresh}` : T.autoRefresh}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RotateCw />}
            {DEV_TEXT.reload}
          </Button>
        }
      />
      {error && <DevNotice onRetry={() => void load()}>{error}</DevNotice>}
      {health ? <HealthGrid health={health} /> : !error && <Skeleton className="h-48 w-full" />}
    </section>
  );
}

function HealthGrid({ health }: { health: SystemHealth }) {
  const lk = health.livekit;
  return (
    <div className="flex flex-col gap-4">
      {health.superAdminEmailsConfigured === 0 && <DevNotice tone="warning">{T.superAdminNone}</DevNotice>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Tile
          title={T.livekit}
          className="md:col-span-2 lg:col-span-1"
          testId="health-livekit"
          ok={lk.ok}
          status={
            <span className={cn("flex items-center gap-2 text-sm font-medium", lk.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              <span className={cn("size-2 rounded-full", lk.ok ? "bg-emerald-500" : "bg-destructive")} aria-hidden />
              {lk.ok ? T.ok : T.fail}
            </span>
          }
          footer={lk.error && <p className="rounded-md bg-destructive/5 px-2 py-1.5 font-mono text-xs break-all text-destructive">{lk.error}</p>}
        >
          <Row label="URL" value={lk.url} />
          <Row label={T.latency} value={lk.latencyMs === null ? "—" : `${lk.latencyMs} ms`} />
        </Tile>
        <Tile title={T.app}>
          <Row label={T.version} value={health.version} />
          <Row label={T.bun} value={health.bun} />
          <Row label={T.uptime} value={formatUptime(health.uptimeSec)} />
          <Row label={T.nodeEnv} value={health.nodeEnv} />
          <Row
            label={T.superAdmins}
            value={T.superAdminCount(health.superAdminEmailsConfigured)}
            warn={health.superAdminEmailsConfigured === 0}
          />
        </Tile>
        <Tile title={T.db}>
          <Row label={T.users} value={String(health.db.users)} />
          <Row label={T.rooms} value={String(health.db.rooms)} />
          <Row label={T.activeRooms} value={String(health.db.activeRooms)} />
          <Row label={T.dbSize} value={formatBytes(health.db.sizeBytes)} />
        </Tile>
      </div>
    </div>
  );
}

type TileProps = { title: string; children: ReactNode; className?: string; testId?: string; ok?: boolean; status?: ReactNode; footer?: ReactNode };

function Tile({ title, children, className, testId, ok, status, footer }: TileProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)} data-testid={testId} data-ok={ok === undefined ? undefined : String(ok)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
        {status}
      </div>
      <dl className="flex flex-col gap-2">{children}</dl>
      {footer}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right font-mono text-[13px] tabular-nums", warn && "text-amber-700 dark:text-amber-400")} title={value}>
        {value}
      </dd>
    </div>
  );
}
