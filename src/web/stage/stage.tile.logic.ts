/** Logika murni tile: label nama/jenis track, inisial avatar, keputusan mirror (tanpa React/SDK). */
import { parseTrackName } from "../../shared/track.naming";
import { STAGE_LABELS } from "./stage.labels";

export type PersonLike = { identity: string; name?: string };
export type PersonInfo = { name: string; isLocal: boolean; present: boolean };

/** Nama manusia untuk identity (tanpa ID internal); tidak ada di room → "Peserta keluar". */
export function personOf(identity: string, people: PersonLike[], localIdentity: string): PersonInfo {
  const p = people.find((x) => x.identity === identity);
  if (!p) return { name: STAGE_LABELS.participantLeft, isLocal: false, present: false };
  return { name: p.name?.trim() || STAGE_LABELS.unnamed, isLocal: identity === localIdentity, present: true };
}

/** "Kamera" / "Layar 2"; nama di luar konvensi → "Video" (nama track internal tidak ditampilkan). */
export function kindLabel(trackName: string): string {
  const p = parseTrackName(trackName);
  if (p?.kind === "camera") return STAGE_LABELS.camera;
  if (p?.kind === "screen") return STAGE_LABELS.screen(p.index);
  return STAGE_LABELS.video;
}

/** Judul tile: "Budi (Anda) · Layar 2". */
export const tileTitle = (person: PersonInfo, trackName: string): string =>
  `${person.name}${person.isLocal ? ` ${STAGE_LABELS.you}` : ""} · ${kindLabel(trackName)}`;

/** Maks 2 huruf inisial dari kata pertama & terakhir. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Self-view kamera di-mirror seperti cermin; layar (termasuk milik sendiri) tidak pernah di-mirror. */
export const shouldMirror = (source: string, isLocal: boolean): boolean => isLocal && source === "camera";
