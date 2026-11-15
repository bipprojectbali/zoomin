/** Badge mode stage saat ini, terlihat semua peserta (S7). */
import { Badge } from "@/components/ui/badge";
import type { StageMode } from "../../shared/api.types";
import { STAGE_CONTROL_TEXT as TEXT } from "./stage-control.labels";

export function StageModeBadge({ mode }: { mode: StageMode }) {
  return (
    <Badge variant="secondary" data-testid="stage-mode-badge" data-mode={mode} title={TEXT.modeHint[mode]}>
      {TEXT.badge(TEXT.mode[mode])}
    </Badge>
  );
}
