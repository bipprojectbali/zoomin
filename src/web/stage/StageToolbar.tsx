/** Toolbar admin: pilih template layout. */
import { Button } from "@/components/ui/button";
import { LAYOUT_TEMPLATES, type LayoutTemplate } from "../../shared/layout.model";
import { STAGE_LABELS } from "./stage.labels";

export function StageToolbar({ template, onSelect }: { template: LayoutTemplate; onSelect: (t: LayoutTemplate) => void }) {
  return (
    <div role="toolbar" aria-label={STAGE_LABELS.toolbar} className="flex shrink-0 gap-1 p-1">
      {LAYOUT_TEMPLATES.map((t) => (
        <Button
          key={t}
          type="button"
          size="sm"
          variant={t === template ? "default" : "outline"}
          aria-pressed={t === template}
          onClick={() => onSelect(t)}
        >
          {STAGE_LABELS.templates[t]}
        </Button>
      ))}
    </div>
  );
}
