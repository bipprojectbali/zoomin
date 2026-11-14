import { Elysia, t } from "elysia";
import { livekitConfig } from "./config";
import { createJoinToken, SAFE_ID_PATTERN } from "./token";

const DEFAULT_PORT = 3000;

/** App HTTP: POST /token -> { token, url }. Tidak listen saat di-import. */
export const app = new Elysia()
  // Elysia default 422 untuk VALIDATION; kontrak API ini memakai 400.
  .onError(({ code, error, status }) => {
    if (code === "VALIDATION") return status(400, { error: "invalid body", detail: error.all });
  })
  .post(
  "/token",
  async ({ body }) => ({ token: await createJoinToken(body), url: livekitConfig.url }),
  {
    body: t.Object({
      room: t.String({ pattern: SAFE_ID_PATTERN }),
      identity: t.String({ pattern: SAFE_ID_PATTERN }),
      name: t.Optional(t.String({ minLength: 1, maxLength: 128 })),
      role: t.Union([t.Literal("admin"), t.Literal("participant"), t.Literal("viewer")]),
    }),
  },
);

if (import.meta.main) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  app.listen(port);
  console.info(`token API listening on :${port}`);
}
