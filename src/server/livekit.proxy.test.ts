import { afterAll, describe, expect, test } from "bun:test";
import { SKIP_LIVEKIT_TESTS } from "../../test/livekit.gate";
import { Room, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";
import { createTestDeps, createTestUser } from "../../test/auth.helpers";
import { startSyntheticAudio } from "../../test/synthetic-media";
import type { TokenResponse } from "../shared/api.types";
import { forwardedHeaders, livekitProxy, livekitWebSocket, upstreamUrl } from "./livekit.proxy";
import { createServer } from "./main";
import { createRoom } from "./rooms.repository";

describe("upstreamUrl", () => {
  test("prefix dibuang, query dipertahankan, skema ws/http", () => {
    const req = "https://app.test/livekit/rtc/v1?access_token=abc&auto_subscribe=1";
    expect(upstreamUrl(req, "ws://127.0.0.1:7880", "ws").href).toBe("ws://127.0.0.1:7880/rtc/v1?access_token=abc&auto_subscribe=1");
    expect(upstreamUrl(req, "wss://lk.test", "http").href).toBe("https://lk.test/rtc/v1?access_token=abc&auto_subscribe=1");
    expect(upstreamUrl(req, "https://lk.test", "ws").href).toBe("wss://lk.test/rtc/v1?access_token=abc&auto_subscribe=1");
  });

  test("root prefix → root upstream; host remote + path dasar upstream dipertahankan", () => {
    expect(upstreamUrl("http://app.test/livekit", "ws://203.0.113.5:7880", "http").href).toBe("http://203.0.113.5:7880/");
    expect(upstreamUrl("http://app.test/livekit/rtc/v1/validate?x=1", "wss://lk.test/base/", "http").href)
      .toBe("https://lk.test/base/rtc/v1/validate?x=1");
  });
});

test("forwardedHeaders: allowlist, cookie dibuang, authorization (Bearer rtc-node) diteruskan", () => {
  const out = forwardedHeaders(new Headers({
    cookie: "zoomin_session=x", "x-forwarded-for": "1.2.3.4", authorization: "Bearer y", "user-agent": "ua", accept: "*/*",
  }));
  expect(out.get("cookie")).toBeNull();
  expect(out.get("x-forwarded-for")).toBeNull();
  expect(out.get("authorization")).toBe("Bearer y");
  expect(out.get("user-agent")).toBe("ua");
  expect(out.get("accept")).toBe("*/*");
});

// Upstream palsu: echo pesan; "close" → tutup 4001; "kill" → putus tanpa close frame. Catat cookie handshake.
const seenCookies: (string | null)[] = [];
const fake = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req, server) {
    seenCookies.push(req.headers.get("cookie"));
    if (server.upgrade(req)) return undefined;
    return new Response(`http ${new URL(req.url).pathname}${new URL(req.url).search}`);
  },
  websocket: {
    open: (ws) => void ws.send("welcome"),
    message: (ws, msg) => (msg === "close" ? ws.close(4001, "bye") : msg === "kill" ? ws.terminate() : void ws.send(msg)),
  },
});
// Upstream "remote" yang menerima TCP tapi tak pernah menjawab handshake (host lambat/terblokir).
const silent = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
function appServer(livekitUrl: string, extra: Record<string, string> = {}) {
  const deps = createTestDeps({ LIVEKIT_URL: livekitUrl, ...extra });
  return { server: createServer(deps, 0), config: deps.config, roomService: deps.roomService, deps };
}
const viaFake = appServer(`ws://127.0.0.1:${fake.port}`).server;
const deadPort = Bun.serve({ port: 0, fetch: () => new Response() });
const deadUrl = `ws://127.0.0.1:${deadPort.port}`;
deadPort.stop(true);
const viaDead = appServer(deadUrl).server;
const proxySilent = livekitProxy(`ws://127.0.0.1:${silent.port}`, 300);
const viaSilent = Bun.serve({ port: 0, hostname: "127.0.0.1", websocket: livekitWebSocket, routes: { "/livekit/*": proxySilent } });
afterAll(() => {
  for (const s of [fake, viaFake, viaDead, viaSilent]) s.stop(true);
  silent.stop(true);
});

const wsUrl = (server: { port?: number }, path: string) => `ws://127.0.0.1:${server.port}${path}`;
/** true bila upgrade sukses, false bila gagal (error sebelum open). */
const opens = (ws: WebSocket) => new Promise<boolean>((r) => ((ws.onopen = () => r(true)), (ws.onerror = () => r(false))));
async function quietWarn<T>(fn: () => Promise<T>): Promise<{ result: T; warns: string[] }> {
  const warn = console.warn;
  const warns: string[] = [];
  console.warn = (...a: unknown[]) => void warns.push(a.join(" "));
  try {
    return { result: await fn(), warns };
  } finally {
    console.warn = warn;
  }
}

describe("proxy ke upstream palsu", () => {
  test("WS: pesan awal ter-buffer, relay text & binary, close upstream diteruskan berpasangan", async () => {
    const ws = new WebSocket(wsUrl(viaFake, "/livekit/rtc/v1?access_token=t"), { headers: { cookie: "zoomin_session=rahasia" } } as never);
    ws.binaryType = "arraybuffer";
    const got: (string | ArrayBuffer)[] = [];
    const closed = new Promise<CloseEvent>((r) => (ws.onclose = r));
    ws.onmessage = (e) => {
      got.push(e.data);
      if (got.length === 1) ws.send("halo");
      if (got.length === 2) ws.send(new Uint8Array([1, 2, 3]));
      if (got.length === 3) ws.send("close");
    };
    const ev = await closed;
    expect(got[0]).toBe("welcome");
    expect(got[1]).toBe("halo");
    expect([...new Uint8Array(got[2] as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect([ev.code, ev.reason]).toEqual([4001, "bye"]);
    expect(seenCookies.at(-1)).toBeNull();
  });

  test("WS: upstream putus mendadak → klien ditutup 1011", async () => {
    const ws = new WebSocket(wsUrl(viaFake, "/livekit/rtc/v1"));
    const closed = new Promise<CloseEvent>((r) => (ws.onclose = r));
    ws.onmessage = () => ws.send("kill");
    const { result: ev } = await quietWarn(() => closed);
    expect(ev.code).toBe(1011);
  });

  test("HTTP: GET diteruskan dengan query tanpa cookie; POST → 405", async () => {
    const res = await fetch(`http://127.0.0.1:${viaFake.port}/livekit/rtc/v1/validate?access_token=t`, { headers: { cookie: "a=b" } });
    expect(await res.text()).toBe("http /rtc/v1/validate?access_token=t");
    expect(seenCookies.at(-1)).toBeNull();
    expect((await fetch(`http://127.0.0.1:${viaFake.port}/livekit/x`, { method: "POST" })).status).toBe(405);
  });

  test("upstream mati: WS upgrade gagal (bukan open), HTTP → 502, access_token tak dilog; /api tetap jalan", async () => {
    const { result, warns } = await quietWarn(async () => [
      await opens(new WebSocket(wsUrl(viaDead, "/livekit/rtc/v1?access_token=rahasia"))),
      (await fetch(`http://127.0.0.1:${viaDead.port}/livekit/rtc/v1/validate?access_token=rahasia`)).status,
    ]);
    expect(result).toEqual([false, 502]);
    expect(warns.length).toBeGreaterThan(0);
    expect(warns.join("\n")).not.toContain("rahasia");
    expect((await fetch(`http://127.0.0.1:${viaDead.port}/api/health`)).status).toBe(200);
  });

  test("upstream tak menjawab: timeout → WS upgrade gagal & HTTP 502", async () => {
    const { result, warns } = await quietWarn(async () => [
      await opens(new WebSocket(wsUrl(viaSilent, "/livekit/rtc/v1"))),
      (await fetch(`http://127.0.0.1:${viaSilent.port}/livekit/rtc/v1/validate`)).status,
    ]);
    expect(result).toEqual([false, 502]);
    expect(warns.join("\n")).toContain("timeout");
  });
});

// Integrasi nyata: butuh LiveKit dev (`livekit-server --dev`, ws://127.0.0.1:7880, devkey/secret).
describe.skipIf(SKIP_LIVEKIT_TESTS)("proxy ke LiveKit nyata", () => {
  const real = appServer("ws://127.0.0.1:7880");
  const proxyUrl = `ws://127.0.0.1:${real.server.port}/livekit`;
  const withProxyUrl = appServer("ws://127.0.0.1:7880", { PUBLIC_LIVEKIT_URL: proxyUrl });
  const roomId = `proxy-${crypto.randomUUID().slice(0, 8)}`;
  const room = new Room();
  const stops: (() => Promise<void>)[] = [];
  afterAll(async () => {
    await room.disconnect();
    await Promise.all(stops.map((s) => s()));
    await real.roomService.deleteRoom(roomId);
    real.server.stop(true);
    withProxyUrl.server.stop(true);
  });

  test("HEAD /livekit (cek jaringan livekit-client) → 200", async () => {
    expect((await fetch(`http://127.0.0.1:${real.server.port}/livekit`, { method: "HEAD" })).status).toBe(200);
  });

  test("validate dengan token salah → 401 asli LiveKit", async () => {
    expect((await fetch(`http://127.0.0.1:${real.server.port}/livekit/rtc/v1/validate?access_token=salah`)).status).toBe(401);
  });

  test("rtc-node connect via proxy dengan token dari endpoint lalu publish audio", async () => {
    const { deps } = withProxyUrl;
    const { user, cookie } = await createTestUser(deps, { email: "pxadmin@example.test", role: "admin" });
    createRoom(deps.db, { id: roomId, title: "Proxy IT", createdBy: user.id });
    const res = await fetch(`http://127.0.0.1:${withProxyUrl.server.port}/api/rooms/${roomId}/token`, { method: "POST", headers: { cookie } });
    expect(res.status).toBe(200);
    const { url, token } = (await res.json()) as TokenResponse;
    expect(url).toBe(proxyUrl);
    await room.connect(url, token);
    expect(room.isConnected).toBe(true);
    const audio = startSyntheticAudio("mic");
    stops.push(audio.stop);
    const pub = await room.localParticipant!.publishTrack(audio.track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }));
    expect(pub.sid).toMatch(/^TR_/);
  }, 30_000);
});
