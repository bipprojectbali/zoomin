import type { ListUsersQuery } from "@/api.client";
import type { GlobalRole } from "../../shared/api.types";

/** Nilai filter dropdown ("all" = tanpa filter; Select radix tidak menerima value kosong). */
export type RoleFilter = "all" | GlobalRole;
export type StatusFilter = "all" | "active" | "banned";

export const ROLE_FILTERS: readonly GlobalRole[] = ["user", "admin", "super_admin"];

/** Ukuran halaman list admin. */
export const ADMIN_PAGE_SIZE = 25;

/** Query GET /api/admin/users dari isian toolbar (q di-trim; "all" dilewati). */
export function usersQuery(q: string, role: RoleFilter, status: StatusFilter, cursor?: string): ListUsersQuery {
  return {
    q: q.trim() || undefined,
    role: role === "all" ? undefined : role,
    banned: status === "all" ? undefined : status === "banned",
    limit: ADMIN_PAGE_SIZE,
    cursor,
  };
}
