import { Copy, Link } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite } from "@/api.client";
import { errorMessage } from "@/error.message";
import { ROLE_LABEL, ROLES } from "@/role.label";
import type { CreateInviteResponse, Role } from "../../shared/api.types";

const TEXT = {
  create: (role: string) => `Link ${role}`,
  copy: "Salin",
  copied: "Link tersalin",
  copyFailed: "Gagal menyalin link",
  linkLabel: (role: string) => `Link undangan ${role}`,
  expires: (when: string) => `Berlaku sampai ${when}`,
  groupLabel: "Buat link undangan",
};

/** Tombol buat link undangan per role + tampil & salin link. */
export function InviteLinks({ roomId }: { roomId: string }) {
  const [links, setLinks] = useState<Partial<Record<Role, CreateInviteResponse>>>({});
  const [pending, setPending] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(role: Role) {
    setPending(role);
    setError(null);
    try {
      const res = await createInvite(roomId, { role });
      setLinks((prev) => ({ ...prev, [role]: res }));
    } catch (err) {
      console.error(`lobby: buat undangan ${role} untuk room ${roomId} gagal`, err);
      setError(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(TEXT.copied);
    } catch (err) {
      console.error("lobby: salin link gagal", err);
      toast.error(`${TEXT.copyFailed}: ${errorMessage(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label={TEXT.groupLabel}>
        {ROLES.map((role) => (
          <Button key={role} type="button" variant="outline" size="sm" disabled={pending !== null} onClick={() => void create(role)}>
            <Link />
            {TEXT.create(ROLE_LABEL[role])}
          </Button>
        ))}
      </div>
      {ROLES.map((role) => {
        const link = links[role];
        if (!link) return null;
        const inputId = `invite-${roomId}-${role}`;
        return (
          <div key={role} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-xs text-muted-foreground">
              {TEXT.linkLabel(ROLE_LABEL[role])} · {TEXT.expires(new Date(link.expiresAt).toLocaleString())}
            </label>
            <div className="flex gap-2">
              <Input id={inputId} readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" size="sm" variant="secondary" onClick={() => void copy(link.url)}>
                <Copy />
                {TEXT.copy}
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
