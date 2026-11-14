import type { RoomRole } from "../../shared/api.types";
import { parseTrackName } from "../../shared/track.naming";

/** Data minimum satu peserta untuk diurutkan. */
export type ParticipantLike = { identity: string; name?: string; isLocal: boolean; metadata?: string };

const ROLE_ORDER: Record<RoomRole, number> = { host: 0, participant: 1, viewer: 2 };
const UNKNOWN_ROLE_ORDER = 3;
const ROLES = Object.keys(ROLE_ORDER);

/** Peran room dari participant metadata metadata `{"role": ...}` (diset server di token); tak valid → null. */
export function roleFromMetadata(metadata: string | undefined): RoomRole | null {
  if (!metadata) return null;
  try {
    const role: unknown = JSON.parse(metadata)?.role;
    return typeof role === "string" && ROLES.includes(role) ? (role as RoomRole) : null;
  } catch {
    // Metadata bukan JSON (mis. diset pihak lain) = role tak diketahui, bukan kegagalan.
    return null;
  }
}

/** Nama tampil: name LiveKit, fallback identity. */
export function displayName(p: Pick<ParticipantLike, "identity" | "name">): string {
  return p.name?.trim() || p.identity;
}

/** Inisial avatar: huruf pertama dua kata pertama, kapital. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Urutan panel: Anda dulu, lalu host, peserta, penonton (role tak dikenal terakhir), lalu nama. */
export function sortParticipants<T extends ParticipantLike>(list: readonly T[]): T[] {
  const rank = (p: T) => {
    const role = roleFromMetadata(p.metadata);
    return p.isLocal ? -1 : role ? ROLE_ORDER[role] : UNKNOWN_ROLE_ORDER;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || displayName(a).localeCompare(displayName(b), "id"));
}

/** Jumlah layar yang sedang dibagikan dari daftar nama track. */
export function countScreens(trackNames: Iterable<string>): number {
  let n = 0;
  for (const name of trackNames) if (parseTrackName(name)?.kind === "screen") n += 1;
  return n;
}

/** Teks toast agregat masuk/keluar: 1-2 nama disebut, lebih dari itu dihitung. */
export function presenceToastText(names: readonly string[], kind: "join" | "leave"): string | null {
  const verb = kind === "join" ? "bergabung" : "keluar";
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} ${verb}`;
  if (names.length === 2) return `${names[0]} dan ${names[1]} ${verb}`;
  return `${names.length} peserta ${verb}`;
}

/** Teks toast share layar; `trackName` di luar konvensi `screen-N` → null. */
export function screenToastText(name: string, trackName: string, started: boolean): string | null {
  const parsed = parseTrackName(trackName);
  if (parsed?.kind !== "screen") return null;
  return `${name} ${started ? "mulai" : "berhenti"} membagikan Layar ${parsed.index}`;
}
