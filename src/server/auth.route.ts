import { Elysia } from "elysia";
import type { ApiDeps } from "./api.deps";

// STUB(m1): diisi oleh worker gelombang 2, jangan merge sebagai stub
/** Plugin route auth (lihat kontrak di src/shared/api.types.ts). */
export function authRoutes(_deps: ApiDeps) {
  return new Elysia({ name: "auth" });
}
