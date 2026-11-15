/** Select "Stage control" (Host only / Request / Open) untuk form buat room & Pengaturan room (S7). */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_MODES, type StageMode } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";

export function StageModeSelect({ id, value, onChange, testId, disabled }: {
  id: string;
  value: StageMode;
  onChange: (mode: StageMode) => void;
  testId: string;
  disabled?: boolean;
}) {
  return (
    <>
      <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as StageMode)}>
      <SelectTrigger id={id} data-testid={testId} className="w-full" aria-describedby={`${id}-hint`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGE_MODES.map((m) => (
          <SelectItem key={m} value={m}>
            {TEXT.mode[m]}
          </SelectItem>
        ))}
      </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {TEXT.modeHint[value]}
      </p>
    </>
  );
}
