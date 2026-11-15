/**
 * Pemisahan konten vs orang (S10) + adegan per menu View (S11), murni.
 * Panggung = slot layout (screen-share + kamera yang ditaruh eksplisit); strip orang = kamera/avatar di luar panggung.
 */
import type { LayoutState, TrackRef } from "../../shared/layout.model";
import { autoLayout, keyOf, refOf, resolveSlots, type ExtraItem, type ResolvedSlot, type TrackLike } from "./stage.resolve";
import type { StageView, StripPosition } from "./view.prefs";

const SCREEN_SOURCE = "screen_share"; // = Track.Source.ScreenShare
const CAMERA_SOURCE = "camera"; // = Track.Source.Camera

export type StageSplit<T> = {
  effective: LayoutState;
  slots: ResolvedSlot<T>[];
  /** Screen-share yang tidak ada di layout (strip "Others", bisa diseret editor ke panggung). */
  screens: ExtraItem<T>[];
  /** Kamera/avatar yang tidak ada di panggung (strip orang). */
  people: ExtraItem<T>[];
  /** Semua kamera + avatar (Gallery/Speaker), urut stabil. */
  everyone: ExtraItem<T>[];
  /** Ada konten: layout bersama berisi slot, atau ada screen-share. */
  hasContent: boolean;
};

/** Layout bersama efektif (Stage & approve request, S6): layout bersama, atau layout otomatis bila belum ada. */
export const sharedEffectiveLayout = (layout: LayoutState | null, tracks: TrackLike[], avatars: TrackRef[]): LayoutState =>
  layout ?? autoLayout(tracks, avatars);

/** `layout` = layout yang ditampilkan (bersama atau salinan lokal), null = otomatis (`effective` bisa diberikan pemanggil). */
export function splitStage<T extends TrackLike>(
  layout: LayoutState | null,
  tracks: T[],
  avatars: TrackRef[],
  effective: LayoutState = sharedEffectiveLayout(layout, tracks, avatars),
): StageSplit<T> {
  const { slots, extras } = resolveSlots(effective, tracks, avatars);
  const isScreen = (x: ExtraItem<T>) => x.track?.source === SCREEN_SOURCE;
  const everyone: ExtraItem<T>[] = [
    ...tracks.filter((t) => t.source === CAMERA_SOURCE).map((t) => ({ ref: refOf(t), track: t })),
    ...avatars.map((ref) => ({ ref, track: null })),
  ].toSorted((a, b) => keyOf(a.ref).localeCompare(keyOf(b.ref), "en", { numeric: true }));
  const hasContent = (layout !== null && layout.slots.length > 0) || tracks.some((t) => t.source === SCREEN_SOURCE);
  return { effective, slots, screens: extras.filter(isScreen), people: extras.filter((x) => !isScreen(x)), everyone, hasContent };
}

export type Scene = "stage" | "gallery" | "speaker";

/**
 * Auto: konten → panggung; tanpa konten → gallery. Tanpa layout bersama, layout otomatis tanpa layar sudah berupa
 * grid kamera (gallery yang tetap bisa diedit host), jadi tetap "stage".
 */
export function sceneOf(view: StageView, hasContent: boolean, sharedLayout: boolean): Scene {
  if (view === "gallery" || view === "speaker") return view;
  if (view === "content") return "stage";
  return hasContent || !sharedLayout ? "stage" : "gallery";
}

/** Strip orang tampil kecuali Gallery / Content only / posisi Hidden / tidak ada isinya. */
export const showStrip = (view: StageView, scene: Scene, strip: StripPosition, count: number): boolean =>
  scene !== "gallery" && view !== "content" && strip !== "hidden" && count > 0;

/** Speaker: kamera pembicara aktif (atau orang pertama) besar, sisanya di strip. */
export function speakerSplit<T>(everyone: ExtraItem<T>[], speaker: string | null): { main: ExtraItem<T> | null; rest: ExtraItem<T>[] } {
  const main = everyone.find((x) => x.ref.identity === speaker) ?? everyone[0] ?? null;
  return { main, rest: everyone.filter((x) => x !== main) };
}
