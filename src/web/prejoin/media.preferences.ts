import type { PreJoinChoices } from "./prejoin.types";

/** Key localStorage preferensi mic/kamera (UX-29). */
export const MEDIA_PREFERENCES_KEY = "zoomin:media-preferences";

/** Default aman: mic & kamera mati sampai user menyalakan. */
export const DEFAULT_MEDIA_PREFERENCES: PreJoinChoices = { audioEnabled: false, videoEnabled: false };

const optionalString = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** Normalisasi nilai mentah (JSON tak tepercaya) menjadi PreJoinChoices valid. */
export function parseMediaPreferences(raw: unknown): PreJoinChoices {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEDIA_PREFERENCES };
  const r = raw as Record<string, unknown>;
  const choices: PreJoinChoices = {
    audioEnabled: typeof r.audioEnabled === "boolean" ? r.audioEnabled : DEFAULT_MEDIA_PREFERENCES.audioEnabled,
    videoEnabled: typeof r.videoEnabled === "boolean" ? r.videoEnabled : DEFAULT_MEDIA_PREFERENCES.videoEnabled,
  };
  const audioDeviceId = optionalString(r.audioDeviceId);
  const videoDeviceId = optionalString(r.videoDeviceId);
  if (audioDeviceId) choices.audioDeviceId = audioDeviceId;
  if (videoDeviceId) choices.videoDeviceId = videoDeviceId;
  return choices;
}

/** Baca preferensi; storage tak tersedia/rusak → default (dicatat warn, bukan fatal). */
export function loadMediaPreferences(storage: Storage | undefined = globalThis.localStorage): PreJoinChoices {
  try {
    const text = storage?.getItem(MEDIA_PREFERENCES_KEY);
    return text ? parseMediaPreferences(JSON.parse(text)) : { ...DEFAULT_MEDIA_PREFERENCES };
  } catch (err) {
    console.warn("prejoin: gagal membaca preferensi media, pakai default", err);
    return { ...DEFAULT_MEDIA_PREFERENCES };
  }
}

/** Simpan preferensi; kegagalan (mode privat/kuota) hanya di-warn karena tidak menghalangi join. */
export function saveMediaPreferences(
  choices: PreJoinChoices,
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(MEDIA_PREFERENCES_KEY, JSON.stringify(parseMediaPreferences(choices)));
  } catch (err) {
    console.warn("prejoin: gagal menyimpan preferensi media", err);
  }
}

/** Key sessionStorage pilihan pre-join untuk join pertama ke room (RoomPage melewati pre-join kedua). */
export const prejoinSessionKey = (roomId: string) => `zoomin:prejoin:${roomId}`;

/** Titipkan pilihan pre-join untuk dibaca sekali oleh RoomPage. */
export function stashFirstJoinChoices(
  roomId: string,
  choices: PreJoinChoices,
  storage: Storage | undefined = globalThis.sessionStorage,
): void {
  try {
    storage?.setItem(prejoinSessionKey(roomId), JSON.stringify(parseMediaPreferences(choices)));
  } catch (err) {
    console.warn("prejoin: gagal menitipkan pilihan join pertama", { roomId }, err);
  }
}

/** Ambil & hapus titipan pilihan pre-join; null bila tidak ada (→ tampilkan pre-join). */
export function takeFirstJoinChoices(
  roomId: string,
  storage: Storage | undefined = globalThis.sessionStorage,
): PreJoinChoices | null {
  try {
    const key = prejoinSessionKey(roomId);
    const text = storage?.getItem(key);
    if (!text) return null;
    storage?.removeItem(key);
    return parseMediaPreferences(JSON.parse(text));
  } catch (err) {
    console.warn("prejoin: titipan pilihan join pertama tidak terbaca", { roomId }, err);
    return null;
  }
}
