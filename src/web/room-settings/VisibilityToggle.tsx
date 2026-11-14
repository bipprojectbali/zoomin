import { Globe, Lock, LockKeyhole } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import type { RoomVisibility } from "../../shared/api.types";
import { ROOM_SETTINGS_TEXT as TEXT, VISIBILITY_TEXT } from "./room-settings.labels";

const OPTIONS: readonly RoomVisibility[] = ["public", "password", "private"];
const ICON = { public: Globe, password: LockKeyhole, private: Lock } as const;

/** Segmented control Public/Password/Private (radio native, bisa keyboard) + deskripsi singkat opsi terpilih. */
export function VisibilityToggle({ value, onChange, disabled }: { value: RoomVisibility; onChange: (v: RoomVisibility) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label={TEXT.visibility}
        aria-describedby={`${id}-hint`}
        data-testid="visibility-toggle"
        className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-fit"
      >
        {OPTIONS.map((v) => {
          const Icon = ICON[v];
          return (
            <label
              key={v}
              data-testid="visibility-option"
              data-value={v}
              className={cn(
                "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring sm:flex-none",
                value === v && "bg-background text-foreground shadow-xs dark:bg-white/15",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input type="radio" name={`${id}-visibility`} value={v} checked={value === v} disabled={disabled} onChange={() => onChange(v)} className="sr-only" />
              <Icon className="size-3.5" aria-hidden="true" />
              {VISIBILITY_TEXT[v].label}
            </label>
          );
        })}
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {VISIBILITY_TEXT[value].hint}
      </p>
    </div>
  );
}
