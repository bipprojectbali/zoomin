/** Menu "⋯" tile: aksi admin + aksi lokal (perbesar/layar penuh) sebagai item menu nyata. */
import { Ellipsis, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAGE_LABELS } from "./stage.labels";

export type TileMenuItem = { label: string; icon: LucideIcon; onSelect: () => void; destructive?: boolean };

/** groups: dirender berurutan dengan separator; grup kosong dilewati. */
export function TileMenu({ title, groups }: { title: string; groups: TileMenuItem[][] }) {
  const nonEmpty = groups.filter((g) => g.length > 0);
  if (nonEmpty.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          data-testid="tile-menu"
          aria-label={STAGE_LABELS.tileMenu(title)}
          className="text-white hover:bg-white/20 hover:text-white"
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {nonEmpty.map((group, gi) => [
          gi > 0 && <DropdownMenuSeparator key={`sep-${gi}`} />,
          ...group.map((item) => (
            <DropdownMenuItem
              key={item.label}
              variant={item.destructive ? "destructive" : "default"}
              onSelect={item.onSelect}
            >
              <item.icon />
              {item.label}
            </DropdownMenuItem>
          )),
        ])}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
