import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Tooltip tombol control bar: label + shortcut opsional (mis. "⌘+D"). Anak harus satu elemen yang meneruskan ref. */
export function ControlTooltip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="flex items-center gap-2">
        {label}
        {shortcut && <kbd className="rounded border border-background/30 px-1 font-mono text-[10px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
