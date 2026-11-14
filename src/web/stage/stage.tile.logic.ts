/** Logika murni tile: label nama/jenis track, inisial avatar, keputusan mirror (tanpa React/SDK). */
import { parseTrackName } from "../../shared/track.naming";
import { STAGE_LABELS } from "./stage.labels";

export type PersonLike = { identity: string; name?: string };
export type PersonInfo = { name: string; isLocal: boolean; present: boolean };

/** Catat nama terakhir yang terlihat per identity (dalam sesi) agar slot peserta yang keluar tetap bernama (QA-03). */
export function rememberNames(known: Map<string, string>, people: PersonLike[]): void {
  for (const p of people) {
    const name = p.name?.trim();
    if (name) known.set(p.identity, name);
  }
}

/** Nama manusia untuk identity (tanpa ID internal); tidak ada di room → nama terakhir yang dikenal, atau "Peserta". */
export function personOf(identity: string, people: PersonLike[], localIdentity: string, known?: Map<string, string>): PersonInfo {
  const p = people.find((x) => x.identity === identity);
  if (!p) return { name: known?.get(identity) ?? STAGE_LABELS.unnamed, isLocal: false, present: false };
  return { name: p.name?.trim() || STAGE_LABELS.unnamed, isLocal: identity === localIdentity, present: true };
}

/** "Kamera" / "Layar 2"; nama di luar konvensi → "Video" (nama track internal tidak ditampilkan). */
export function kindLabel(trackName: string): string {
  const p = parseTrackName(trackName);
  if (p?.kind === "camera") return STAGE_LABELS.camera;
  if (p?.kind === "screen") return STAGE_LABELS.screen(p.index);
  return STAGE_LABELS.video;
}

/** Judul tile: "Budi (Anda) · Layar 2"; peserta yang keluar: "Budi · keluar · Layar 2". */
export const tileTitle = (person: PersonInfo, trackName: string): string =>
  `${person.name}${person.isLocal ? ` ${STAGE_LABELS.you}` : ""}${person.present ? "" : ` · ${STAGE_LABELS.left}`} · ${kindLabel(trackName)}`;

/** Maks 2 huruf inisial dari kata pertama & terakhir. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "?";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Self-view kamera di-mirror seperti cermin; layar (termasuk milik sendiri) tidak pernah di-mirror. */
export const shouldMirror = (source: string, isLocal: boolean): boolean => isLocal && source === "camera";
