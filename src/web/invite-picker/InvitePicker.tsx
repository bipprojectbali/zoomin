import { Loader2 } from "lucide-react";
import { useId, useImperativeHandle, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Input } from "@/components/ui/input";
import { useSession } from "@/session.context";
import { InviteChip } from "./InviteChip";
import { InviteOptionRow } from "./InviteOption";
import { useManualEmails } from "./invite.manual.store";
import { buildOptions, defaultActive, type InviteOption } from "./invite.options";
import { normalizeEmail, parseEmails, type InviteEntry } from "./invite.parse";
import { INVITE_PICKER_TEXT as TEXT } from "./invite-picker.labels";
import { useUserSearch } from "./useUserSearch";

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
const LIST_CLASS = "absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";
const NOTE_CLASS = "flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground";

/**
 * Dropdown multi-select "Undang orang" (P1/P3 + M1–M6, RND/plan/09): terbuka saat fokus, akun terdaftar + email manual
 * tersimpan ber-checkbox, "Tambah <email>" untuk email baru, tempel banyak email, chip ber-peran di bawahnya.
 */
export function InvitePicker({ value, onChange, inputId, describedBy, disabled, legacyInputTestId, action, ref }: Props) {
  const self = useSession().user;
  const manual = useManualEmails(self?.id);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null); // null = baris bawaan (defaultActive)
  const listId = useId();
  const expanded = open && !disabled;
  const search = useUserSearch(text, expanded);
  const options = buildOptions({ text, users: search.items, saved: manual.list, selfEmail: self?.email });
  const checked = new Set(value.map((v) => v.email));
  const activeIndex = Math.min(active ?? defaultActive(options, text), options.length - 1);

  function resetText() {
    setText("");
    setActive(null);
  }

  /** Toggle centang; teks cari tetap (centang beberapa dari satu pencarian), kecuali "Tambah <email>". */
  function toggle(option: InviteOption) {
    if (option.kind === "add") (resetText(), manual.add([option.email]));
    if (checked.has(option.email)) {
      if (option.kind !== "add") onChange(value.filter((v) => v.email !== option.email)); // "Tambah" tidak pernah menghapus centang
      return;
    }
    const extra = option.kind === "user" ? { name: option.user.name, image: option.user.image } : {};
    onChange([...value, { email: option.email, role: DEFAULT_ROLE, ...extra }]);
  }

  function removeSaved(email: string) {
    manual.remove(email);
    if (checked.has(email)) onChange(value.filter((v) => v.email !== email));
  }

  /** Teks bebas → chip: valid juga disimpan sebagai email manual (M3), tidak valid ditandai. */
  function commitText(raw = text): InviteEntry[] {
    const taken = [...checked, ...(self?.email ? [normalizeEmail(self.email)] : [])];
    const parsed = parseEmails(raw, taken);
    manual.add(parsed.filter((p) => !p.invalid).map((p) => p.email));
    const next = parsed.length ? [...value, ...parsed.map(({ email, invalid }) => ({ email, role: DEFAULT_ROLE, ...(invalid && { invalid }) }))] : value;
    if (parsed.length) onChange(next);
    resetText();
    return next;
  }

  // Bukan commit saat blur: chip baru menggeser layout (dialog ter-center ulang) sehingga klik tombol submit meleset.
  // Teks tanpa "@" = sisa kata cari (toggle tidak mengosongkan input) → dibuang, bukan jadi chip tidak valid.
  useImperativeHandle(ref, () => ({ flush: () => (text.includes("@") ? commitText() : (resetText(), value)) }));

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const option = expanded && activeIndex >= 0 ? options[activeIndex] : undefined;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const n = options.length;
      if (n) setActive(e.key === "ArrowDown" ? (activeIndex + 1) % n : (activeIndex - 1 + n) % n);
    } else if (e.key === "Enter" || (e.key === " " && !text && option)) {
      if (option) {
        e.preventDefault();
        toggle(option);
      } else if (text.trim()) {
        e.preventDefault();
        commitText();
      } // Enter tanpa teks & tanpa baris aktif → submit form
    } else if (e.key === "," && text.trim()) {
      e.preventDefault();
      commitText();
    } else if (e.key === "Delete" && option?.kind === "saved") {
      e.preventDefault();
      removeSaved(option.email);
    } else if (e.key === "Escape" && expanded) {
      e.preventDefault(); // tutup dropdown saja; dialog induk menahan Escape ini lewat onEscapeKeyDown (RoomSettingsDialog)
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
              aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
              aria-describedby={describedBy}
              autoComplete="off"
              placeholder={TEXT.placeholder}
              disabled={disabled}
              value={text}
              onChange={(e) => (setText(e.target.value), setOpen(true), setActive(null))}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
          </label>
          {expanded && (
            <ul id={listId} role="listbox" aria-multiselectable="true" aria-label={TEXT.label} className={LIST_CLASS}>
              {options.map((option, i) => (
                <InviteOptionRow
                  key={`${option.kind}:${option.email}`}
                  option={option}
                  id={optionId(i)}
                  checked={checked.has(option.email)}
                  active={i === activeIndex}
                  onHover={() => setActive(i)}
                  onToggle={() => toggle(option)}
                  onRemoveSaved={() => removeSaved(option.email)}
                />
              ))}
              {search.loading && (
                <li className={NOTE_CLASS} role="presentation">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  {TEXT.searching}
                </li>
              )}
              {!search.loading && options.length === 0 && <li className={NOTE_CLASS} role="presentation" data-testid="invite-picker-empty">{TEXT.empty}</li>}
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
