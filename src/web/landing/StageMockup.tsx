import { useState } from "react";
import { cn } from "@/lib/utils";
import { MOCKUP } from "./landing.copy";

type TemplateId = (typeof MOCKUP.templates)[number]["id"];

/** Kelas grid panggung + posisi tiap layar per template (meniru template di room asli). */
const LAYOUTS: Record<TemplateId, { stage: string; tiles: [string, string, string] }> = {
  side: { stage: "grid-cols-3 grid-rows-1", tiles: ["", "", ""] },
  grid: { stage: "grid-cols-2 grid-rows-2", tiles: ["", "", ""] },
  focus: { stage: "grid-cols-3 grid-rows-2", tiles: ["col-span-2 row-span-2", "", ""] },
};

/** Wireframe halaman checkout mini; `variant` membedakan isi layar A/B/C. */
function ScreenContent({ variant }: { variant: number }) {
  if (variant === 2) {
    return (
      <div className="mx-auto flex h-full w-[38%] min-w-10 flex-col gap-1 rounded-md border border-foreground/15 bg-background p-1.5">
        <div className="h-1 w-1/2 rounded-full bg-foreground/25" />
        <div className="flex-1 rounded-sm bg-brand/15" />
        <div className="h-1 rounded-full bg-foreground/15" />
        <div className="h-2 rounded-sm bg-brand" />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1.5 rounded-md bg-background p-2">
      <div className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-foreground/25" />
        <span className="h-1 w-1/3 rounded-full bg-foreground/25" />
      </div>
      <div className={cn("flex flex-1 gap-1.5", variant === 1 && "flex-row-reverse")}>
        <div className="flex flex-1 flex-col gap-1">
          <div className="h-1 w-4/5 rounded-full bg-foreground/15" />
          <div className="h-1 w-3/5 rounded-full bg-foreground/15" />
          <div className="h-1 w-2/3 rounded-full bg-foreground/15" />
        </div>
        <div className={cn("w-2/5 rounded-sm", variant === 1 ? "bg-brand/25" : "bg-foreground/10")} />
      </div>
      <div className={cn("h-2 rounded-sm", variant === 1 ? "w-full bg-brand" : "w-1/2 bg-foreground/40")} />
    </div>
  );
}

/** Mockup panggung multi-layar di hero, dibuat dengan HTML/CSS. Tombol template mengubah susunan secara lokal. */
export function StageMockup() {
  const [template, setTemplate] = useState<TemplateId>("side");
  const layout = LAYOUTS[template];

  return (
    <figure
      aria-label={MOCKUP.label}
      className="relative rounded-2xl border bg-card p-2 shadow-2xl shadow-brand/10 sm:p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <span className="truncate text-xs font-medium sm:text-sm">{MOCKUP.room}</span>
        <div role="group" aria-label={MOCKUP.templatesLabel} className="flex gap-1">
          {MOCKUP.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={template === t.id}
              onClick={() => setTemplate(t.id)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors sm:text-xs",
                template === t.id ? "border-transparent bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "grid aspect-[16/8] gap-1.5 rounded-xl bg-muted p-1.5 motion-safe:transition-all sm:gap-2 sm:p-2",
          layout.stage,
        )}
      >
        {MOCKUP.screens.map((s, i) => (
          <div
            key={s.tag}
            className={cn(
              "relative min-h-0 overflow-hidden rounded-lg border bg-background/60 p-1.5 pb-6 sm:p-2 sm:pb-7",
              i === 0 && "ring-2 ring-brand/60",
              layout.tiles[i],
            )}
          >
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded bg-brand font-mono text-[11px] font-bold text-brand-foreground"
            >
              {s.tag}
            </span>
            <ScreenContent variant={i} />
            <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] truncate rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] text-background">
              {s.owner}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 pt-2" aria-hidden="true">
        {MOCKUP.cams.map((name) => (
          <span
            key={name}
            className="flex h-8 w-14 items-end rounded-md bg-gradient-to-br from-foreground/15 to-foreground/5 p-1 text-[10px] sm:h-10 sm:w-18"
          >
            {name}
          </span>
        ))}
        <span className="ml-auto hidden font-mono text-[11px] text-muted-foreground sm:inline">{MOCKUP.hostNote}</span>
      </div>
    </figure>
  );
}
