/** Adegan orang (S10/S11): strip orang di samping/bawah panggung, Gallery kamera, dan Speaker. */
import { useSpeakingParticipants, type TrackReference } from "@livekit/components-react";
import type { Room } from "livekit-client";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { STAGE_LABELS } from "./stage.labels";
import { keyOf, type ExtraItem } from "./stage.resolve";
import { speakerSplit } from "./stage.split";
import { Empty, gridStyle } from "./StageTemplates";
import { ExtraTile } from "./StageTile";
import type { StripPosition } from "./view.prefs";

type Items = ExtraItem<TrackReference>[];

/** Kamera/avatar di luar panggung; indikator bicara dari TileView (SpeakingRing). */
export function PeopleStrip({ items, position }: { items: Items; position: Exclude<StripPosition, "hidden"> }) {
  const right = position === "right";
  return (
    <section
      aria-label={STAGE_LABELS.people}
      data-testid="people-strip"
      data-position={position}
      className={cn("shrink-0", right ? "w-40 border-l sm:w-48" : "h-24 border-t sm:h-28")}
    >
      <h3 className="sr-only">{STAGE_LABELS.people}</h3>
      <div className={cn("flex h-full gap-2 p-1", right ? "flex-col overflow-y-auto" : "overflow-x-auto overflow-y-hidden")}>
        {items.map((x) => (
          <div key={keyOf(x.ref)} className={cn("aspect-video shrink-0", right ? "w-full" : "h-full")}>
            <ExtraTile item={x} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Gallery: semua kamera/avatar tiled. */
export function PeopleGrid({ items }: { items: Items }) {
  if (items.length === 0) return <Empty text={STAGE_LABELS.noPeople} />;
  return (
    <div data-testid="people-gallery" style={gridStyle(items.length)} className="grid h-full gap-2 overflow-y-auto p-1">
      {items.map((x) => (
        <div key={keyOf(x.ref)} className="min-h-0">
          <ExtraTile item={x} />
        </div>
      ))}
    </div>
  );
}

/** Speaker: pembicara aktif terakhir besar; sisanya dikembalikan lewat render-prop untuk strip. */
export function SpeakerView({ room, items, children }: { room: Room; items: Items; children: (rest: Items) => React.ReactNode }) {
  const speakers = useSpeakingParticipants({ room });
  // Pembicara terakhir tetap besar saat semua diam (tidak berkedip ke orang pertama).
  const last = useRef<string | null>(null);
  if (speakers[0]) last.current = speakers[0].identity;
  const { main, rest } = speakerSplit(items, last.current);
  return (
    <>
      <div data-testid="speaker-view" className="min-h-0 min-w-0 flex-1 p-1">
        {main ? <ExtraTile item={main} /> : <Empty text={STAGE_LABELS.noPeople} />}
      </div>
      {children(rest)}
    </>
  );
}
