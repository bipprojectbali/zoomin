import { Loader2, Mail } from "lucide-react";
import { useId, useImperativeHandle, useMemo, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { UserAvatar } from "@/app/UserAvatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSession } from "@/session.context";
import type { UserSearchItem } from "../../shared/api.types";
import { InviteChip } from "./InviteChip";
import { isEmail, normalizeEmail, parseEmails, type InviteEntry } from "./invite.parse";
import { INVITE_PICKER_TEXT as TEXT } from "./invite-picker.labels";
import { useUserSearch } from "./useUserSearch";

type Option = { kind: "user"; user: UserSearchItem } | { kind: "manual"; email: string };

/** Handle imperatif: `flush()` meng-commit teks yang masih diketik jadi chip lalu mengembalikan nilai lengkapnya. */
export type InvitePickerHandle = { flush: () => InviteEntry[] };

type Props = {
  ref?: Ref<InvitePickerHandle>;
  value: InviteEntry[];
  onChange: (next: InviteEntry[]) => void;
  /** id input (untuk <Label htmlFor>). */
  inputId?: string;
  /** id elemen petunjuk (aria-describedby input). */
  describedBy?: string;
  disabled?: boolean;
  /** testid tambahan di <label> pembungkus input (kompat e2e lama `member-email-input`; Playwright fill diteruskan ke input). */
  legacyInputTestId?: string;
  /** Tombol di samping input (mis. "Tambahkan"); di atas chip agar tidak bergeser saat blur meng-commit chip. */
  action?: ReactNode;
};

const DEFAULT_ROLE = "participant" as const;

/**
 * Combobox "Undang orang" (P1–P3): saran akun terdaftar, opsi "Undang <email>" untuk email manual, tempel banyak
 * email, chip ber-peran. Email sesi sendiri & duplikat diabaikan.
 */
export function InvitePicker({ value, onChange, inputId, describedBy, disabled, legacyInputTestId, action, ref }: Props) {
  const selfEmail = useSession().user?.email;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const search = useUserSearch(text);
  const taken = useMemo(
    () => new Set([...value.map((v) => v.email), ...(selfEmail ? [normalizeEmail(selfEmail)] : [])]),
    [value, selfEmail],
  );

  const typed = normalizeEmail(text);
  const options: Option[] = search.items.filter((u) => !taken.has(normalizeEmail(u.email))).map((user) => ({ kind: "user", user }));
  if (isEmail(typed) && !taken.has(typed) && !search.items.some((u) => normalizeEmail(u.email) === typed)) {
    options.push({ kind: "manual", email: typed });
  }
  const expanded = open && (options.length > 0 || search.loading);
  const activeIndex = Math.min(active, options.length - 1);

  function add(entries: InviteEntry[]): InviteEntry[] {
    const next = entries.length ? [...value, ...entries] : value;
    if (entries.length) onChange(next);
    setText("");
    setActive(0);
    return next;
  }

  function pick(option: Option) {
    if (option.kind === "manual") return add([{ email: option.email, role: DEFAULT_ROLE }]);
    const { email, name, image } = option.user;
    add([{ email: normalizeEmail(email), role: DEFAULT_ROLE, name, image }]);
  }

  /** Teks bebas → chip (tidak valid ditandai). */
  const commitText = (raw = text) =>
    add(parseEmails(raw, taken).map(({ email, invalid }) => ({ email, role: DEFAULT_ROLE, ...(invalid && { invalid }) })));

  // Bukan commit saat blur: chip baru menggeser layout (dialog ter-center ulang) sehingga klik tombol submit meleset.
  useImperativeHandle(ref, () => ({ flush: () => commitText() }));

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((activeIndex + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" || (e.key === "," && text.trim())) {
      if (e.key === "Enter" && !text.trim()) return; // Enter kosong → submit form
      e.preventDefault();
      const option = expanded ? options[activeIndex] : undefined;
      if (option) pick(option);
      else commitText();
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault(); // jangan tutup dialog induk
      setOpen(false);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    if (!/[\s,;]/.test(pasted.trim())) return; // satu token → biarkan masuk input (bisa jadi kata kunci cari)
    e.preventDefault();
    commitText(`${text} ${pasted}`);
  }

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const invalidCount = value.filter((v) => v.invalid).length;

  return (
    <div data-testid="invite-picker" className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="relative flex-1">
          <label data-testid={legacyInputTestId} className="contents">
            <Input
              id={inputId}
              data-testid="invite-picker-input"
              role="combobox"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={expanded && options.length ? optionId(activeIndex) : undefined}
              aria-describedby={describedBy}
              autoComplete="off"
              placeholder={TEXT.placeholder}
              disabled={disabled}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setOpen(true);
                setActive(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
          </label>
          {expanded && (
            <ul
              id={listId}
              role="listbox"
              aria-label={TEXT.label}
              className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {search.loading && options.length === 0 && (
                <li className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground" role="presentation">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {TEXT.searching}
                </li>
              )}
              {options.map((option, i) => (
                <li
                  key={option.kind === "user" ? option.user.id : `manual:${option.email}`}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  data-testid={option.kind === "user" ? "invite-picker-option" : "invite-picker-manual"}
                  data-email={option.kind === "user" ? normalizeEmail(option.user.email) : option.email}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                    i === activeIndex && "bg-accent text-accent-foreground",
                  )}
                  // mousedown: cegah blur input (blur akan meng-commit teks sebelum klik opsi terproses).
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(option)}
                >
                  {option.kind === "user" ? (
                    <>
                      <UserAvatar user={option.user} className="size-6" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{option.user.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{option.user.email}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Mail className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{TEXT.manual(option.email)}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {action}
      </div>
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={TEXT.label}>
          {value.map((entry, i) => (
            <InviteChip
              key={entry.email}
              entry={entry}
              disabled={disabled}
              onRole={(role) => onChange(value.map((v, j) => (j === i ? { ...v, role } : v)))}
              onRemove={() => onChange(value.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}
      {invalidCount > 0 && (
        <p className="text-xs text-destructive" role="status">
          {TEXT.invalidCount(invalidCount)}
        </p>
      )}
    </div>
  );
}
