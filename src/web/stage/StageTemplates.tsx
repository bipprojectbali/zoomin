/** Render template layout: side-by-side & focus (resizable), grid (CSS grid responsif). */
import type { TrackReference } from "@livekit/components-react";
import { useEffect, type CSSProperties } from "react";
import { useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { LayoutState } from "../../shared/layout.model";
import { useStage } from "./stage.context";
import { STAGE_LABELS } from "./stage.labels";
import { SIDE_BY_SIDE_MAX, type ResolvedSlot } from "./stage.resolve";
import { tileTitle } from "./stage.tile.logic";
import { ExtraTile, SlotTile } from "./StageTile";

type Slots = ResolvedSlot<TrackReference>[];
const FOCUS_IDS = ["stage", "strip"];
const FOCUS_DEFAULT = [75, 25];
const SIZE_PRECISION = 100; // 2 desimal: cukup presisi, metadata tetap kecil
const PANEL_MIN_PERCENT = "15"; // panel di bawah ini terlalu sempit untuk konten + toolbar (UX-19)
const GRID_TILE_MIN = "10rem"; // 360px → 2 kolom; layar lebar dibatasi --cols
const GRID_ROW_MIN = "8rem"; // banyak baris di mobile → scroll vertikal, bukan tile gepeng

const toLayout = (ids: string[], sizes: number[]): Layout => Object.fromEntries(ids.map((id, i) => [id, sizes[i] ?? 0]));

/** Group resizable: sizes remote diterapkan via setLayout; commit hanya setelah drag user selesai. */
function PanelGroup({ ids, sizes, orientation, handleLabel, children }: {
  ids: string[];
  sizes: number[] | undefined;
  orientation: "horizontal" | "vertical";
  handleLabel: (i: number) => string;
  children: (id: string, i: number) => React.ReactNode;
}) {
  const { actions } = useStage();
  const groupRef = useGroupRef();
  // Dependensi effect = isi array (string), bukan identitas array yang baru tiap render.
  const sizesKey = sizes?.join(",");
  const idsKey = ids.join("|");
  useEffect(() => {
    if (sizesKey && groupRef.current) groupRef.current.setLayout(toLayout(idsKey.split("|"), sizesKey.split(",").map(Number)));
  }, [sizesKey, idsKey, groupRef]);
  // onLayoutChanged (bukan onLayoutChange) = dipanggil setelah pointer dilepas, tidak per frame.
  const onLayoutChanged = (layout: Layout, meta: LayoutChangedMeta) => {
    if (!actions || !meta.isUserInteraction) return;
    actions.resize(ids.map((id) => Math.round((layout[id] ?? 0) * SIZE_PRECISION) / SIZE_PRECISION));
  };
  return (
    <ResizablePanelGroup
      key={idsKey}
      groupRef={groupRef}
      orientation={orientation}
      disabled={!actions}
      defaultLayout={sizes ? toLayout(ids, sizes) : undefined}
      onLayoutChanged={onLayoutChanged}
    >
      {ids.map((id, i) => [
        i > 0 && <ResizableHandle key={`h-${id}`} withHandle={!!actions} aria-label={handleLabel(i)} />,
        <ResizablePanel key={id} id={id} minSize={PANEL_MIN_PERCENT}>
          {children(id, i)}
        </ResizablePanel>,
      ])}
    </ResizablePanelGroup>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full gap-2 overflow-x-auto overflow-y-hidden p-1">{children}</div>;
}
const stripItem = "aspect-video h-full shrink-0";

/** Grid responsif: maks --cols kolom (≈√n), tiap kolom ≥ GRID_TILE_MIN sehingga layar sempit turun ke 1–2 kolom. */
function Grid({ slots }: { slots: Slots }) {
  const cols = Math.ceil(Math.sqrt(slots.length));
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fit, minmax(max(min(100%, ${GRID_TILE_MIN}), calc((100% - ${cols - 1} * 0.5rem) / ${cols})), 1fr))`,
    gridAutoRows: `minmax(${GRID_ROW_MIN}, 1fr)`,
  };
  return (
    <div style={style} className="grid h-full gap-2 overflow-y-auto p-1">
      {slots.map((s) => (
        <div key={s.index} className="min-h-0">
          <SlotTile item={s} />
        </div>
      ))}
    </div>
  );
}

export function TemplateView({ layout, slots }: { layout: LayoutState; slots: Slots }) {
  const { who, actions } = useStage();
  const n = slots.length;
  if (n === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{STAGE_LABELS.empty}</div>;
  }
  const titleOf = (s: ResolvedSlot<TrackReference>) => tileTitle(who(s.slot.trackRef.identity).person, s.slot.trackRef.trackName);
  switch (layout.template) {
    case "side-by-side":
      if (n > SIDE_BY_SIDE_MAX) {
        return (
          <div className="flex h-full flex-col">
            {actions && <p className="shrink-0 px-2 text-xs text-muted-foreground">{STAGE_LABELS.sideBySideAsGrid(SIDE_BY_SIDE_MAX)}</p>}
            <div className="min-h-0 flex-1">
              <Grid slots={slots} />
            </div>
          </div>
        );
      }
      return (
        <PanelGroup
          ids={slots.map((s) => `slot-${s.index}`)}
          sizes={layout.panelSizes}
          orientation="horizontal"
          handleLabel={(i) => STAGE_LABELS.resizeBetween(titleOf(slots[i - 1]!), titleOf(slots[i]!))}
        >
          {(_, i) => <div className="h-full p-1"><SlotTile item={slots[i]!} /></div>}
        </PanelGroup>
      );
    case "focus":
      if (n === 1) return <div className="h-full p-1"><SlotTile item={slots[0]!} /></div>;
      return (
        <PanelGroup ids={FOCUS_IDS} sizes={layout.panelSizes ?? FOCUS_DEFAULT} orientation="vertical" handleLabel={() => STAGE_LABELS.resizeFocus}>
          {(id) =>
            id === "stage" ? (
              <div className="h-full p-1"><SlotTile item={slots[0]!} /></div>
            ) : (
              <Strip>
                {slots.slice(1).map((s) => (
                  <div key={s.index} className={stripItem}><SlotTile item={s} /></div>
                ))}
              </Strip>
            )
          }
        </PanelGroup>
      );
    case "grid":
      return <Grid slots={slots} />;
  }
}

/** Track yang tidak ada di layout (mis. kamera saat ada layar), strip kecil scroll horizontal. */
export function OthersStrip({ extras }: { extras: TrackReference[] }) {
  return (
    <section aria-label={STAGE_LABELS.others} data-testid="stage-extras" className="h-24 shrink-0 border-t sm:h-28">
      <h3 className="sr-only">{STAGE_LABELS.others}</h3>
      <Strip>
        {extras.map((t) => (
          <div key={`${t.participant.identity}/${t.publication.trackName}`} className={stripItem}>
            <ExtraTile track={t} />
          </div>
        ))}
      </Strip>
    </section>
  );
}
