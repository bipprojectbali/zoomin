import type { CreateInviteResponse, Role } from "../../shared/api.types";

/** Link undangan terakhir per role untuk satu room. */
export type StoredInvites = Partial<Record<Role, CreateInviteResponse>>;

const key = (roomId: string) => `zm.invites.${roomId}`;

/**
 * Baca link yang dibuat di tab ini (sessionStorage: hilang saat tab ditutup, token tidak menetap di disk).
 * Link kedaluwarsa dibuang. Storage tak tersedia/rusak → kosong (fitur kenyamanan, bukan data penting).
 */
export function loadInvites(roomId: string, now = Date.now()): StoredInvites {
  try {
    const raw = sessionStorage.getItem(key(roomId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredInvites;
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v && v.expiresAt > now)) as StoredInvites;
  } catch (err) {
    console.warn(`invite.storage: gagal membaca link room ${roomId}, diabaikan`, err);
    return {};
  }
}

/** Simpan link per room; gagal (kuota/privat) hanya di-log, state di memori tetap dipakai. */
export function saveInvites(roomId: string, invites: StoredInvites): void {
  try {
    sessionStorage.setItem(key(roomId), JSON.stringify(invites));
  } catch (err) {
    console.warn(`invite.storage: gagal menyimpan link room ${roomId}`, err);
  }
}
