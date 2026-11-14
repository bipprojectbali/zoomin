/** Render template layout: side-by-side & focus (resizable), grid (CSS grid). */
import type { TrackReference } from "@livekit/components-react";
import { useEffect, type CSSProperties } from "react";
import { useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { LayoutState } from "../../shared/layout.model";
import { STAGE_LABELS } from "./stage.labels";
import type { ResolvedSlot } from "./stage.resolve";
import { ExtraTile, SlotTile, type StageActions } from "./StageTile";

type Slots = ResolvedSlot<TrackReference>[];
const FOCUS_IDS = ["stage", "strip"];
const FOCUS_DEFAULT = [75, 25];
const SIZE_PRECISION = 100; // 2 desimal: cukup presisi, metadata tetap kecil

const toLayout = (ids: string[], sizes: number[]): Layout => Object.fromEntries(ids.map((id, i) => [id, sizes[i] ?? 0]));

/** Group resizable: sizes remote diterapkan via setLayout; commit hanya setelah drag user selesai. */
function PanelGroup({ ids, sizes, orientation, actions, children }: {
  ids: string[];
  sizes: number[] | undefined;
  orientation: "horizontal" | "vertical";
  actions: StageActions | null;
  children: (id: string, i: number) => React.ReactNode;
}) {
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
        i > 0 && <ResizableHandle key={`h-${id}`} withHandle={!!actions} />,
        <ResizablePanel key={id} id={id} minSize="5">
          {children(id, i)}
        </ResizablePanel>,
      ])}
    </ResizablePanelGroup>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full gap-2 overflow-x-auto p-1">{children}</div>;
}
const stripItem = "aspect-video h-full shrink-0";

export function TemplateView({ layout, slots, actions }: { layout: LayoutState; slots: Slots; actions: StageActions | null }) {
  const n = slots.length;
  if (n === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{STAGE_LABELS.empty}</div>;
  }
  const tile = (s: ResolvedSlot<TrackReference>) => <SlotTile item={s} count={n} actions={actions} />;
  switch (layout.template) {
    case "side-by-side":
      return (
        <PanelGroup ids={slots.map((s) => `slot-${s.index}`)} sizes={layout.panelSizes} orientation="horizontal" actions={actions}>
          {(_, i) => <div className="h-full p-1">{tile(slots[i]!)}</div>}
        </PanelGroup>
      );
    case "focus":
      return (
        <PanelGroup ids={FOCUS_IDS} sizes={layout.panelSizes ?? FOCUS_DEFAULT} orientation="vertical" actions={actions}>
          {(id) =>
            id === "stage" ? (
              <div className="h-full p-1">{tile(slots[0]!)}</div>
            ) : (
              <Strip>
                {slots.slice(1).map((s) => (
                  <div key={s.index} className={stripItem}>{tile(s)}</div>
                ))}
              </Strip>
            )
          }
        </PanelGroup>
      );
    case "grid": {
      const style = { "--cols": Math.ceil(Math.sqrt(n)) } as CSSProperties;
      return (
        <div style={style} className="grid h-full auto-rows-fr grid-cols-1 gap-2 p-1 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))]">
          {slots.map((s) => (
            <div key={s.index} className="min-h-0">{tile(s)}</div>
          ))}
        </div>
      );
    }
  }
}

/** Track yang tidak ada di layout, agar tidak hilang dari pandangan. */
export function OthersStrip({ extras, actions }: { extras: TrackReference[]; actions: StageActions | null }) {
  return (
    <section aria-label={STAGE_LABELS.others} className="h-28 shrink-0 border-t">
      <h3 className="sr-only">{STAGE_LABELS.others}</h3>
      <Strip>
        {extras.map((t) => (
          <div key={`${t.participant.identity}/${t.publication.trackName}`} className={stripItem}>
            <ExtraTile track={t} actions={actions} />
          </div>
        ))}
      </Strip>
    </section>
  );
}
