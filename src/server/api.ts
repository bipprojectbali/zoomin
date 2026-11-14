import { Elysia } from "elysia";
import type { ApiError } from "../shared/api.types";
import type { ApiDeps } from "./api.deps";
import { authRoutes } from "./auth.route";
import { layoutRoutes } from "./layout.route";
import { roomsRoutes } from "./rooms.route";
import { tokenRoutes } from "./token.route";

const HTTP_BAD_REQUEST = 400;

/** App Elysia untuk semua endpoint /api. Tidak listen; dipasang oleh main.ts atau dites via `.handle()`. */
export function createApi(deps: ApiDeps) {
  return new Elysia({ prefix: "/api" })
    // Elysia default 422 untuk VALIDATION; kontrak API memakai 400 + path field yang gagal.
    .onError({ as: "global" }, ({ code, error, status }) => {
      if (code !== "VALIDATION") return;
      const first = error.all[0];
      const body: ApiError = { error: first?.summary ?? first?.message ?? "invalid request" };
      if (first && "path" in first && first.path) body.path = first.path;
      return status(HTTP_BAD_REQUEST, body);
    })
    .get("/health", () => ({ ok: true }))
    .use(authRoutes(deps))
    .use(roomsRoutes(deps))
    .use(tokenRoutes(deps))
    .use(layoutRoutes(deps));
}
