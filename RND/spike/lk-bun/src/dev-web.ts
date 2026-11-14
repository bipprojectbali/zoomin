import index from "../web/index.html";
import { livekitConfig } from "./config";
import { createJoinToken, SAFE_ID_PATTERN } from "./token";

const DEFAULT_PORT = 5173;
const SAFE_ID = new RegExp(SAFE_ID_PATTERN);
const HTTP_BAD_REQUEST = 400;

/** GET /api/token?room=&identity=&name= -> { token, url } (grant publish+subscribe). */
async function handleToken(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const room = q.get("room") ?? "";
  const identity = q.get("identity") ?? "";
  const name = q.get("name") || undefined;
  if (!SAFE_ID.test(room) || !SAFE_ID.test(identity)) {
    return Response.json({ error: `room & identity wajib cocok ${SAFE_ID_PATTERN}` }, { status: HTTP_BAD_REQUEST });
  }
  if (name !== undefined && name.length > 128) {
    return Response.json({ error: "name maks 128 karakter" }, { status: HTTP_BAD_REQUEST });
  }
  const token = await createJoinToken({ room, identity, name, role: "participant" });
  return Response.json({ token, url: livekitConfig.url });
}

/** Membuat dev server halaman uji browser (port 0 = acak, untuk test). */
export function createDevWebServer(port: number) {
  return Bun.serve({
    port,
    development: process.env.NODE_ENV !== "production",
    routes: {
      "/": index,
      "/api/token": { GET: handleToken },
    },
  });
}

if (import.meta.main) {
  const server = createDevWebServer(Number(process.env.PORT ?? DEFAULT_PORT));
  console.info(`dev web: ${server.url} (LiveKit ${livekitConfig.url})`);
}
