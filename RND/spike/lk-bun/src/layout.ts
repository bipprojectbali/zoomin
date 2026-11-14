import type { RoomServiceClient } from "livekit-server-sdk";

/**
 * Batas metadata LiveKit: "Room metadata is limited to 512 KiB" (sama untuk
 * semua field metadata) — https://docs.livekit.io/home/client/state/room-metadata/
 */
export const LIVEKIT_METADATA_MAX_BYTES = 512 * 1024;
/** Batas layout kita jauh di bawah batas LiveKit; layout wajar < 2 KiB. */
export const LAYOUT_MAX_BYTES = 16 * 1024;
export const LAYOUT_MAX_SLOTS = 49; // grid 7x7
export const LAYOUT_TEMPLATES = ["side-by-side", "grid", "focus"] as const;
export const SLOT_SIZES = ["small", "medium", "large"] as const;

export type LayoutTemplate = (typeof LAYOUT_TEMPLATES)[number];
export type SlotSize = (typeof SLOT_SIZES)[number];
export type TrackRef = { identity: string; trackName: string };
export type LayoutSlot = { trackRef: TrackRef; size?: SlotSize };
/** State layout yang disiarkan ke semua klien via room metadata. */
export type LayoutState = {
  version: number;
  template: LayoutTemplate;
  slots: LayoutSlot[];
  updatedBy: string;
  updatedAt: number;
};

export class LayoutError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function nonEmptyString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) throw new LayoutError(`${path}: harus string non-kosong`);
  return v;
}

function parseSlot(v: unknown, i: number): LayoutSlot {
  const p = `slots[${i}]`;
  if (!isObj(v) || !isObj(v.trackRef)) throw new LayoutError(`${p}.trackRef: harus object`);
  const trackRef = {
    identity: nonEmptyString(v.trackRef.identity, `${p}.trackRef.identity`),
    trackName: nonEmptyString(v.trackRef.trackName, `${p}.trackRef.trackName`),
  };
  if (v.size === undefined) return { trackRef };
  if (!SLOT_SIZES.includes(v.size as SlotSize)) {
    throw new LayoutError(`${p}.size: "${String(v.size)}" bukan salah satu dari ${SLOT_SIZES.join("|")}`);
  }
  return { trackRef, size: v.size as SlotSize };
}

/** Parse + validasi ketat JSON layout (dari room.metadata). Melempar LayoutError. */
export function parseLayout(json: string): LayoutState {
  if (new TextEncoder().encode(json).byteLength > LAYOUT_MAX_BYTES) {
    throw new LayoutError(`layout melebihi ${LAYOUT_MAX_BYTES} byte`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new LayoutError(`layout bukan JSON valid: ${(e as Error).message}`, { cause: e });
  }
  if (!isObj(raw)) throw new LayoutError("layout: harus object");
  if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 0) {
    throw new LayoutError("version: harus integer >= 0");
  }
  if (!LAYOUT_TEMPLATES.includes(raw.template as LayoutTemplate)) {
    throw new LayoutError(`template: "${String(raw.template)}" tidak dikenal`);
  }
  if (!Array.isArray(raw.slots)) throw new LayoutError("slots: harus array");
  if (raw.slots.length > LAYOUT_MAX_SLOTS) throw new LayoutError(`slots: maks ${LAYOUT_MAX_SLOTS}`);
  const slots = raw.slots.map(parseSlot);
  const keys = new Set(slots.map((s) => refKey(s.trackRef)));
  if (keys.size !== slots.length) throw new LayoutError("slots: trackRef duplikat");
  if (!Number.isFinite(raw.updatedAt)) throw new LayoutError("updatedAt: harus angka (epoch ms)");
  return {
    version: raw.version as number,
    template: raw.template as LayoutTemplate,
    slots,
    updatedBy: nonEmptyString(raw.updatedBy, "updatedBy"),
    updatedAt: raw.updatedAt as number,
  };
}

/** Serialisasi layout; melempar bila melewati LAYOUT_MAX_BYTES. */
export function serializeLayout(state: LayoutState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > LAYOUT_MAX_BYTES) throw new LayoutError(`layout ${bytes} byte melebihi ${LAYOUT_MAX_BYTES}`);
  return json;
}

const refKey = (r: TrackRef) => `${r.identity}\u0000${r.trackName}`;
const sameRef = (a: TrackRef, b: TrackRef) => refKey(a) === refKey(b);

/** Tukar isi slot i dan j (ukuran ikut posisi slot). Versi naik. */
export function swapSlots(state: LayoutState, i: number, j: number, by: string): LayoutState {
  const n = state.slots.length;
  if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= n || j >= n) {
    throw new LayoutError(`swapSlots: index ${i},${j} di luar 0..${n - 1}`);
  }
  const slots = state.slots.map((s) => ({ ...s }));
  const a = slots[i]!;
  const b = slots[j]!;
  [a.trackRef, b.trackRef] = [b.trackRef, a.trackRef];
  return bump(state, { slots }, by);
}

/** Template focus: trackRef ke slot 0 ukuran large, sisanya small di bawah. */
export function setFocus(state: LayoutState, trackRef: TrackRef, by: string): LayoutState {
  const rest = state.slots.filter((s) => !sameRef(s.trackRef, trackRef));
  if (rest.length === state.slots.length) {
    throw new LayoutError(`setFocus: track ${trackRef.identity}/${trackRef.trackName} tidak ada di layout`);
  }
  const slots: LayoutSlot[] = [
    { trackRef, size: "large" },
    ...rest.map((s) => ({ trackRef: s.trackRef, size: "small" as const })),
  ];
  return bump(state, { template: "focus", slots }, by);
}

function bump(state: LayoutState, patch: Partial<LayoutState>, by: string): LayoutState {
  return { ...state, ...patch, version: state.version + 1, updatedBy: by, updatedAt: Date.now() };
}

/** Siarkan layout ke semua klien lewat room metadata (server-side, butuh API secret). */
export async function publishLayout(roomService: RoomServiceClient, room: string, state: LayoutState) {
  const json = serializeLayout(state);
  try {
    return await roomService.updateRoomMetadata(room, json);
  } catch (e) {
    throw new LayoutError(`publishLayout room=${room} v=${state.version} gagal: ${(e as Error).message}`, {
      cause: e,
    });
  }
}
