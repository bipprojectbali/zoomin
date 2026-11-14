import { Info, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getSettings, putSettings } from "../api.client";
import { errorMessage } from "../error.message";
import { DevNotice, DevSectionHeader } from "./DevParts";
import { addDomains, ALLOWED_EMAIL_DOMAINS_MAX, sameDomains } from "./dev.domains";
import { DEV_TEXT } from "./dev.labels";

const T = DEV_TEXT.settings;

/** Tab Pengaturan: domain email yang boleh login (A9); kosong = semua akun Google. */
export function SettingsPanel() {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const errorId = useId();

  const load = useCallback(async () => {
    try {
      const s = await getSettings();
      setSaved(s.allowedEmailDomains);
      setDomains(s.allowedEmailDomains);
      setLoadError(null);
    } catch (err) {
      console.error("dev: GET /api/dev/settings gagal", err);
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function commitDraft() {
    const res = addDomains(domains, draft);
    setDomains(res.domains);
    setInputError(res.error);
    if (!res.error) setDraft("");
    return res;
  }

  async function save() {
    // Isian yang belum di-Enter ikut disimpan bila valid, supaya tidak hilang diam-diam.
    const next = commitDraft();
    if (next.error) return;
    setSaving(true);
    try {
      const res = await putSettings({ allowedEmailDomains: next.domains });
      setSaved(res.allowedEmailDomains);
      setDomains(res.allowedEmailDomains);
      toast.success(T.saved);
    } catch (err) {
      console.error("dev: PUT /api/dev/settings gagal", err);
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <DevNotice onRetry={() => void load()}>{loadError}</DevNotice>;
  if (saved === null) return <Skeleton className="h-48 w-full" />;

  const dirty = !sameDomains(domains, saved) || draft.trim() !== "";

  return (
    <section className="flex max-w-2xl flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <DevSectionHeader title={T.title} description={T.description} />
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor={inputId}>{T.inputLabel}</Label>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{T.count(domains.length, ALLOWED_EMAIL_DOMAINS_MAX)}</span>
        </div>
        <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
          {domains.map((d) => (
            <span key={d} data-testid="settings-domain-chip" className="inline-flex items-center gap-1 rounded-md border bg-muted py-0.5 pr-0.5 pl-2 font-mono text-xs">
              {d}
              <button
                type="button"
                className="rounded-sm p-0.5 text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={T.remove(d)}
                onClick={() => setDomains((prev) => prev.filter((x) => x !== d))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
          <Input
            id={inputId}
            data-testid="settings-domain-input"
            value={draft}
            placeholder={T.placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={inputError !== null}
            aria-describedby={inputError ? errorId : undefined}
            className="h-7 min-w-32 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            onChange={(e) => {
              setDraft(e.target.value);
              setInputError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Backspace" && draft === "" && domains.length > 0) {
                setDomains((prev) => prev.slice(0, -1));
              }
            }}
          />
        </div>
        {inputError && (
          <p id={errorId} className="text-sm text-destructive" role="alert">
            {inputError}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {domains.length === 0 && (
          <li className="flex gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {T.emptyAll}
          </li>
        )}
        <li className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {T.superAdminNote}
        </li>
      </ul>
      <div className="flex justify-end border-t pt-4">
        <Button data-testid="settings-save" onClick={() => void save()} disabled={!dirty || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {T.save}
        </Button>
      </div>
    </section>
  );
}
