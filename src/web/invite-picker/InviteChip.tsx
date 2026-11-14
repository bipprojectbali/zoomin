import { AlertCircle, X } from "lucide-react";
import { UserAvatar } from "@/app/UserAvatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RoleSelect } from "@/room-settings/RoleSelect";
import type { RoomRole } from "../../shared/api.types";
import type { InviteEntry } from "./invite.parse";
import { INVITE_PICKER_TEXT as TEXT } from "./invite-picker.labels";

type Props = { entry: InviteEntry; disabled?: boolean; onRole: (role: RoomRole) => void; onRemove: () => void };

/** Satu chip undangan: avatar/nama/email, peran (chip valid saja), tombol hapus. Chip invalid bergaya error. */
export function InviteChip({ entry, disabled, onRole, onRemove }: Props) {
  const who = entry.name || entry.email;
  return (
    <li
      data-testid="invite-chip"
      data-email={entry.email}
      data-invalid={entry.invalid ? "true" : "false"}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2 py-1 text-sm",
        entry.invalid && "border-destructive bg-destructive/5 text-destructive",
      )}
    >
      {entry.invalid ? (
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        <UserAvatar user={{ name: who, image: entry.image ?? null }} className="size-6" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        {entry.name && <span className="truncate font-medium">{entry.name}</span>}
        <span className={cn("truncate", entry.name && "text-xs text-muted-foreground")}>{entry.email}</span>
        {entry.invalid && <span className="text-xs">{TEXT.invalid}</span>}
      </span>
      {!entry.invalid && (
        <RoleSelect value={entry.role} onChange={onRole} label={TEXT.roleFor(who)} testId="invite-chip-role" disabled={disabled} />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={TEXT.remove(who)}
        data-testid="invite-chip-remove"
        disabled={disabled}
        onClick={onRemove}
      >
        <X aria-hidden="true" />
      </Button>
    </li>
  );
}
