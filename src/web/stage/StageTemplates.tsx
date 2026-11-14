/** Render template layout: side-by-side & focus (resizable), grid (CSS grid responsif). */
import type { TrackReference } from "@livekit/components-react";
import type { CSSProperties } from "react";
import type { LayoutState } from "../../shared/layout.model";
import { useStage } from "./stage.context";
import { STAGE_LABELS } from "./stage.labels";
import { focusMainIndex, keyOf, SIDE_BY_SIDE_MAX, type ExtraItem, type ResolvedSlot } from "./stage.resolve";
import { tileTitle } from "./stage.tile.logic";
import { PanelGroup, Strip, stripItem } from "./StagePanels";
import { ExtraTile, SlotTile } from "./StageTile";

type Slots = ResolvedSlot<TrackReference>[];
// Bukan "stage": react-resizable-panels memberi panel data-testid=id, bentrok dengan root stage (QA-18).
const FOCUS_IDS = ["focus-main", "focus-strip"];
const FOCUS_DEFAULT = [75, 25];
const GRID_TILE_MIN = "10rem"; // 360px → 2 kolom; layar lebar dibatasi --cols
const GRID_ROW_MIN = "8rem"; // banyak baris di mobile → scroll vertikal, bukan tile gepeng

const Empty = ({ text }: { text: string }) => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>
);
const Note = ({ text }: { text: string }) => <p className="shrink-0 px-2 text-xs text-muted-foreground">{text}</p>;

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

/**
 * Fokus (QA-03): slot fokus tidak aktif → slot aktif pertama tampil besar SECARA LOKAL (layout bersama tidak diubah);
 * admin diberi catatan, non-admin tidak melihat slot mati di strip.
 */
function FocusView({ layout, slots }: { layout: LayoutState; slots: Slots }) {
  const { actions } = useStage();
  const main = focusMainIndex(slots);
  const rest = slots.filter((s, i) => i !== main && (actions || s.live));
  const big = main < 0 ? <Empty text={STAGE_LABELS.noActive} /> : <div className="h-full p-1"><SlotTile item={slots[main]!} /></div>;
  const view =
    rest.length === 0 ? (
      big
    ) : (
      <PanelGroup ids={FOCUS_IDS} sizes={layout.panelSizes ?? FOCUS_DEFAULT} orientation="vertical" handleLabel={() => STAGE_LABELS.resizeFocus}>
        {(id) =>
          id === FOCUS_IDS[0] ? (
            big
          ) : (
            <Strip>
              {rest.map((s) => (
                <div key={s.index} className={stripItem}><SlotTile item={s} /></div>
              ))}
            </Strip>
          )
        }
      </PanelGroup>
    );
  if (main === 0 || !actions) return view;
  return (
    <div className="flex h-full flex-col">
      <Note text={STAGE_LABELS.focusInactive} />
      <div className="min-h-0 flex-1">{view}</div>
    </div>
  );
}

export function TemplateView({ layout, slots }: { layout: LayoutState; slots: Slots }) {
  const { who, actions } = useStage();
  const n = slots.length;
  if (n === 0) return <Empty text={STAGE_LABELS.empty} />;
  const titleOf = (s: ResolvedSlot<TrackReference>) => tileTitle(who(s.slot.trackRef.identity).person, s.slot.trackRef.trackName);
  switch (layout.template) {
    case "side-by-side":
      if (n > SIDE_BY_SIDE_MAX) {
        return (
          <div className="flex h-full flex-col">
            {actions && <Note text={STAGE_LABELS.sideBySideAsGrid(SIDE_BY_SIDE_MAX)} />}
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
      return <FocusView layout={layout} slots={slots} />;
    case "grid":
      return <Grid slots={slots} />;
  }
}

/** Track/avatar yang tidak ada di layout (mis. kamera saat ada layar), strip kecil scroll horizontal. */
export function OthersStrip({ extras }: { extras: ExtraItem<TrackReference>[] }) {
  return (
    <section aria-label={STAGE_LABELS.others} data-testid="stage-extras" className="h-24 shrink-0 border-t sm:h-28">
      <h3 className="sr-only">{STAGE_LABELS.others}</h3>
      <Strip>
        {extras.map((x) => (
          <div key={keyOf(x.ref)} className={stripItem}>
            <ExtraTile item={x} />
          </div>
        ))}
      </Strip>
    </section>
  );
}
