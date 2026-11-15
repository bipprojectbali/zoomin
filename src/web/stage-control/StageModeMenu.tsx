/** Pemilih mode stage di room untuk pengelola (S7): PUT stage-mode, toast saat gagal; mode baru tiba lewat metadata. */
import { Presentation } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setStageMode } from "@/api.client";
import { errorMessage } from "@/error.message";
import { STAGE_MODES, type RoomSummary, type StageMode } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";

export function StageModeMenu({ roomId, mode, disabled, onSummaryChanged }: {
  roomId: string;
  mode: StageMode;
  disabled?: boolean;
  onSummaryChanged?: (room: RoomSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function choose(next: StageMode) {
    if (next === mode) return;
    setBusy(true);
    try {
      onSummaryChanged?.(await setStageMode(roomId, next));
      toast.success(TEXT.modeChanged(TEXT.mode[next]));
    } catch (e) {
      console.error(`[stage] ganti mode room=${roomId} ke ${next} gagal`, e);
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} aria-label={TEXT.title} data-testid="stage-mode-menu">
          <Presentation aria-hidden="true" />
          <span className="hidden sm:inline">{TEXT.mode[mode]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{TEXT.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => void choose(v as StageMode)}>
          {STAGE_MODES.map((m) => (
            <DropdownMenuRadioItem key={m} value={m} data-testid={`stage-mode-${m}`}>
              {TEXT.mode[m]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
