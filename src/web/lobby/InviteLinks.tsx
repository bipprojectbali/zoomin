import { Copy, Link2, Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite } from "@/api.client";
import { copyText } from "@/clipboard.copy";
import { errorMessage } from "@/error.message";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, ROLES } from "@/role.label";
import type { RoomRole } from "../../shared/api.types";
import { loadInvites, saveInvites, type StoredInvites } from "./invite.storage";
import { formatDateTime } from "./lobby.format";
import { LOBBY_TEXT } from "./lobby.labels";

const TEXT = LOBBY_TEXT.inviteLinks;

/** Pilih peran → buat link undangan → salin. Link tersimpan di sessionStorage sampai tab ditutup. */
export function InviteLinks({ roomId }: { roomId: string }) {
  const [role, setRole] = useState<RoomRole>("participant");
  const [links, setLinks] = useState<StoredInvites>(() => loadInvites(roomId));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const res = await createInvite(roomId, { role });
      const next = { ...links, [role]: res };
      setLinks(next);
      saveInvites(roomId, next);
    } catch (err) {
      console.error(`lobby: buat undangan ${role} untuk room ${roomId} gagal`, err);
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function copy(url: string) {
    try {
      await copyText(url);
      toast.success(TEXT.copied);
    } catch (err) {
      console.error("lobby: salin link gagal", err);
      toast.error(TEXT.copyFailed);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label={TEXT.roleGroup} className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto">
          {ROLES.map((r) => (
            <label
              key={r}
              data-testid="invite-role"
              data-role={r}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring sm:flex-none",
                role === r && "bg-background text-foreground shadow-xs dark:bg-white/15",
              )}
            >
              <input type="radio" name={`invite-role-${roomId}`} value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
        <Button type="button" size="sm" variant="outline" data-testid="create-invite" data-role={role} disabled={pending} onClick={() => void create()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {pending ? TEXT.creating : TEXT.create(ROLE_LABEL[role])}
        </Button>
      </div>
      {role === "host" ? (
        <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200" role="note">
          <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
          {TEXT.hostWarning}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{TEXT.roleHint[role]}</p>
      )}
      {ROLES.map((r) => {
        const link = links[r];
        if (!link) return null;
        const inputId = `invite-${roomId}-${r}`;
        return (
          <div key={r} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{TEXT.linkLabel(ROLE_LABEL[r])}</span> ·{" "}
              {TEXT.expires(formatDateTime(link.expiresAt))}
            </label>
            <div className="flex gap-2">
              <Input
                id={inputId}
                data-testid="invite-url"
                data-role={r}
                readOnly
                value={link.url}
                className="min-w-0 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" size="sm" variant="secondary" aria-label={TEXT.copyLabel(ROLE_LABEL[r])} onClick={() => void copy(link.url)}>
                <Copy aria-hidden="true" />
                <span className="hidden sm:inline">{TEXT.copy}</span>
              </Button>
            </div>
          </div>
        );
      })}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
