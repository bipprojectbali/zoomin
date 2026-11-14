import { afterAll, expect, test } from "bun:test";
import { TokenVerifier } from "livekit-server-sdk";
import { livekitConfig } from "./config";
import { createDevWebServer } from "./dev-web";

const server = createDevWebServer(0);
afterAll(() => server.stop(true));

test("GET / mengembalikan HTML halaman uji", async () => {
  const res = await fetch(new URL("/", server.url));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(await res.text()).toContain("Tambah layar");
});

test("GET /api/token valid -> JWT dengan grant publish+subscribe", async () => {
  const res = await fetch(new URL("/api/token?room=spike&identity=alice", server.url));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string; url: string };
  expect(body.url).toBe(livekitConfig.url);

  const claims = await new TokenVerifier(livekitConfig.apiKey, livekitConfig.apiSecret).verify(body.token);
  expect(claims.sub).toBe("alice");
  expect(claims.video).toMatchObject({ room: "spike", roomJoin: true, canPublish: true, canSubscribe: true });
  expect(claims.video?.canPublishSources).toEqual(
    expect.arrayContaining(["camera", "microphone", "screen_share", "screen_share_audio"]),
  );
});

test.each([
  "/api/token",
  "/api/token?room=spike",
  "/api/token?identity=alice",
  "/api/token?room=bad%20room&identity=alice",
  "/api/token?room=spike&identity=" + "x".repeat(65),
])("GET %s -> 400", async (path) => {
  const res = await fetch(new URL(path, server.url));
  expect(res.status).toBe(400);
  expect(((await res.json()) as { error: string }).error).toBeTruthy();
});
