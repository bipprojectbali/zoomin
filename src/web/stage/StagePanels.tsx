/** Panel resizable & strip horizontal yang dipakai template stage. */
import { useEffect } from "react";
import { useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useStage } from "./stage.context";

const SIZE_PRECISION = 100; // 2 desimal: cukup presisi, metadata tetap kecil
const PANEL_MIN_PERCENT = "15"; // panel di bawah ini terlalu sempit untuk konten + toolbar (UX-19)

const toLayout = (ids: string[], sizes: number[]): Layout => Object.fromEntries(ids.map((id, i) => [id, sizes[i] ?? 0]));

/** Group resizable: sizes remote diterapkan via setLayout; commit hanya setelah drag user selesai. */
export function PanelGroup({ ids, sizes, orientation, handleLabel, children }: {
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

export function Strip({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full gap-2 overflow-x-auto overflow-y-hidden p-1">{children}</div>;
}
export const stripItem = "aspect-video h-full shrink-0";

