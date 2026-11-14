import { Elysia } from "elysia";
import type { ApiDeps } from "./api.deps";
import { apiError } from "./api.error";
import { authRoutes } from "./auth.route";
import { layoutRoutes } from "./layout.route";
import { roomsRoutes } from "./rooms.route";
import { tokenRoutes } from "./token.route";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

/** App Elysia untuk semua endpoint /api. Tidak listen; dipasang oleh main.ts atau dites via `.handle()`. */
export function createApi(deps: ApiDeps) {
  return new Elysia({ prefix: "/api" })
    // Elysia default 422 untuk VALIDATION; kontrak API memakai 400 + code + path field yang gagal.
    // NOT_FOUND/PARSE juga dibungkus supaya semua error /api punya `code`.
    .onError({ as: "global" }, ({ code, error, status }) => {
      if (code === "NOT_FOUND") return status(HTTP_NOT_FOUND, apiError("not_found", "not found"));
      if (code === "PARSE") return status(HTTP_BAD_REQUEST, apiError("invalid_input", "invalid request body"));
      if (code !== "VALIDATION") return;
      const first = error.all[0];
      const path = first && "path" in first && first.path ? first.path : undefined;
      return status(HTTP_BAD_REQUEST, apiError("invalid_input", first?.summary ?? first?.message ?? "invalid request", path));
    })
    .get("/health", () => ({ ok: true }))
    .use(authRoutes(deps))
    .use(roomsRoutes(deps))
    .use(tokenRoutes(deps))
    .use(layoutRoutes(deps));
}
