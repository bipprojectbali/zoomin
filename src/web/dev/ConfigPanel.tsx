import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getDevConfig } from "../api.client";
import { errorMessage } from "../error.message";
import { DevNotice, DevSectionHeader } from "./DevParts";
import { DEV_TEXT } from "./dev.labels";

const T = DEV_TEXT.config;
const SECRET_STATES = new Set(["diset", "kosong"]);

/** Tab Konfigurasi: ringkasan config server read-only (secret sudah disamarkan server jadi "diset"/"kosong"). */
export function ConfigPanel() {
  const [config, setConfig] = useState<[string, string][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getDevConfig();
      setConfig(Object.entries(res)); // urutan server sudah dikelompokkan, tidak diurut ulang
      setError(null);
    } catch (err) {
      console.error("dev: GET /api/dev/config gagal", err);
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4">
      <DevSectionHeader title={DEV_TEXT.tabs.config} description={T.description} />
      {error && <DevNotice onRetry={() => void load()}>{error}</DevNotice>}
      {!config && !error && <Skeleton className="h-48 w-full" />}
      {config && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">{T.colKey}</TableHead>
                <TableHead className="px-3">{T.colValue}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell className="px-3 font-mono text-xs">{key}</TableCell>
                  <TableCell className="px-3 font-mono text-xs break-all whitespace-normal">
                    {SECRET_STATES.has(value) ? (
                      <span className={cn("rounded px-1.5 py-0.5", value === "diset" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
                        {value}
                      </span>
                    ) : (
                      value || <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
