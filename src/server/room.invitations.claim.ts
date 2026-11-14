import type { Database } from "bun:sqlite";

// Rank role room untuk upsert yang hanya menaikkan (host > participant > viewer), sama dengan auth.invite.route.ts.
const RANK = (col: string) => `(CASE ${col} WHEN 'host' THEN 3 WHEN 'participant' THEN 2 ELSE 1 END)`;

/**
 * Pindahkan undangan pending (room_invitations) untuk `email` ke room_members milik `userId` lalu hapus barisnya,
 * dalam satu transaksi (R2). Role anggota yang sudah lebih tinggi tidak diturunkan. Mengembalikan jumlah room diklaim.
 */
export function claimPendingInvitations(db: Database, userId: string, email: string): number {
  const normalized = email.trim().toLowerCase();
  return db.transaction(() => {
    db.query(
      `INSERT INTO room_members (room_id, user_id, role) SELECT room_id, ?1, role FROM room_invitations WHERE email = ?2
       ON CONFLICT(room_id, user_id) DO UPDATE SET role = excluded.role WHERE ${RANK("excluded.role")} > ${RANK("room_members.role")}`,
    ).run(userId, normalized);
    return db.query("DELETE FROM room_invitations WHERE email = ?").run(normalized).changes;
  })();
}
