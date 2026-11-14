import { Mail, X } from "lucide-react";
import { UserAvatar } from "@/app/UserAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { InviteOption } from "./invite.options";
import { INVITE_PICKER_TEXT as TEXT } from "./invite-picker.labels";

const TEST_ID = { user: "invite-picker-option", saved: "invite-picker-saved", add: "invite-picker-manual" } as const;

type Props = {
  option: InviteOption;
  id: string;
  checked: boolean;
  active: boolean;
  onHover: () => void;
  onToggle: () => void;
  /** Hapus email manual dari daftar tersimpan (baris `saved` saja). */
  onRemoveSaved: () => void;
};

/** Satu baris dropdown multi-select (M2): checkbox + akun / email manual tersimpan / "Tambah <email>". */
export function InviteOptionRow({ option, id, checked, active, onHover, onToggle, onRemoveSaved }: Props) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={checked}
      data-testid={TEST_ID[option.kind]}
      data-email={option.email}
      className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm", active && "bg-accent text-accent-foreground")}
      // mousedown: fokus tetap di input (blur menutup dropdown sebelum klik terproses).
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onToggle}
    >
      {option.kind === "add" ? (
        <Mail className="size-4 shrink-0" aria-hidden="true" />
      ) : (
        // Hanya visual: klik diteruskan ke <li> (toggle satu kali); status terbaca lewat aria-selected.
        <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" className="pointer-events-none" data-testid="invite-picker-checkbox" />
      )}
      {option.kind === "user" && (
        <>
          <UserAvatar user={option.user} className="size-6" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{option.user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{option.user.email}</span>
          </span>
        </>
      )}
      {option.kind === "saved" && (
        <>
          <span className="min-w-0 flex-1 truncate">{option.email}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{TEXT.savedBadge}</span>
          <button
            type="button"
            tabIndex={-1} // fokus tetap di combobox; keyboard: tombol Delete pada baris aktif
            aria-label={TEXT.removeSaved(option.email)}
            data-testid="invite-picker-saved-remove"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveSaved();
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </>
      )}
      {option.kind === "add" && <span className="truncate">{TEXT.add(option.email)}</span>}
    </li>
  );
}
