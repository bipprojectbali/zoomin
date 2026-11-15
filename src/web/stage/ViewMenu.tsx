/** Menu "View" per orang (S11): pilihan tampilan + posisi strip orang, lokal (tidak memengaruhi orang lain). */
import { LayoutDashboard } from "lucide-react";
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
import { STAGE_LABELS } from "./stage.labels";
import { setViewPrefs, STAGE_VIEWS, STRIP_POSITIONS, useViewPrefs, type StageView, type StripPosition } from "./view.prefs";

export function ViewMenu() {
  const prefs = useViewPrefs();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" data-testid="view-menu" aria-label={`${STAGE_LABELS.view}: ${STAGE_LABELS.views[prefs.view]}`}>
          <LayoutDashboard />
          {STAGE_LABELS.view}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{STAGE_LABELS.view}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={prefs.view} onValueChange={(v) => setViewPrefs({ view: v as StageView })}>
          {STAGE_VIEWS.map((v) => (
            <DropdownMenuRadioItem key={v} value={v}>
              {STAGE_LABELS.views[v]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{STAGE_LABELS.stripPosition}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={prefs.strip} onValueChange={(v) => setViewPrefs({ strip: v as StripPosition })}>
          {STRIP_POSITIONS.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              {STAGE_LABELS.strips[p]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
