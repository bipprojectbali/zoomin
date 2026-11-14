import type { Server, ServerWebSocket, WebSocketHandler } from "bun";

/**
 * Proxy signaling LiveKit di origin app (`/livekit/*` → LIVEKIT_URL, prefix dibuang). Dipakai saat browser tak bisa
 * menjangkau LiveKit langsung (mis. Cloudflare Tunnel satu hostname): PUBLIC_LIVEKIT_URL=wss://<host>/livekit.
 * LIVEKIT_URL boleh host remote (mis. ws://<IP-VPS>:7880). livekit-client mempertahankan path URL: WS `<url>/rtc/v1`
 * (fallback `/rtc`), HTTP GET `<url>/rtc/v1/validate` saat upgrade gagal, HEAD `<url>` untuk cek jaringan.
 * Media WebRTC tidak lewat sini.
 */
export const LIVEKIT_PROXY_PREFIX = "/livekit";
const UPSTREAM_TIMEOUT_MS = 10_000;
const WS_NORMAL = 1000;
const WS_INTERNAL_ERROR = 1011;
const HTTP_BAD_GATEWAY = 502;
const HTTP_METHOD_NOT_ALLOWED = 405;
/** livekit-client hanya butuh GET (validate) + HEAD (cek jaringan). */
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);
/**
 * Allowlist header ke LiveKit; cookie sesi app tidak pernah diteruskan. `authorization` diteruskan karena SDK non-browser
 * (@livekit/rtc-node) mengirim token sebagai Bearer, sedangkan browser memakai query access_token; app tak memakainya.
 */
const FORWARDED_HEADERS = ["accept", "accept-language", "user-agent", "authorization"];

/** lib DOM menimpa overload Bun; opsi `headers` adalah ekstensi WebSocket klien Bun (bun-types WebSocketOptions). */
const BunWebSocket = WebSocket as unknown as new (url: URL, options: Bun.WebSocketOptions) => WebSocket;

/** LiveKit Twirp/validate memakai HTTP(S), sedangkan config menyimpan URL ws(s). */
export function toHttpUrl(livekitUrl: string): string {
  return livekitUrl.replace(/^ws(s?):\/\//, "http$1://");
}

/** URL upstream LiveKit untuk request proxy: prefix dibuang, query dipertahankan, skema ws(s) atau http(s). */
export function upstreamUrl(requestUrl: string, livekitUrl: string, scheme: "ws" | "http"): URL {
  const src = new URL(requestUrl);
  const base = new URL(scheme === "http" ? toHttpUrl(livekitUrl) : livekitUrl.replace(/^http(s?):\/\//, "ws$1://"));
  const rest = src.pathname.slice(LIVEKIT_PROXY_PREFIX.length);
  base.pathname = base.pathname.replace(/\/$/, "") + (rest.startsWith("/") ? rest : `/${rest}`);
  base.search = src.search;
  return base;
}

/** Header request yang boleh diteruskan ke LiveKit (allowlist). */
export function forwardedHeaders(headers: Headers): Headers {
  const out = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = headers.get(name);
    if (value !== null) out.set(name, value);
  }
  return out;
}

type ProxyData = { upstream: WebSocket; pending: (string | ArrayBuffer)[]; client?: ServerWebSocket<ProxyData> };

/** Kode close yang sah dikirim ke klien; 1005/1006/1015 hanya boleh dilaporkan, bukan dikirim. */
const toClientCode = (code: number) => ([1005, 1006, 1015].includes(code) ? WS_INTERNAL_ERROR : code);
/** WebSocket klien (ke upstream) hanya menerima 1000 atau 3000-4999. */
const toUpstreamCode = (code: number) => (code === WS_NORMAL || (code >= 3000 && code <= 4999) ? code : WS_NORMAL);

/** Buka WS upstream; resolve saat open. Pesan yang datang sebelum klien ter-upgrade ditampung di `pending`. */
function openUpstream(url: URL, headers: Headers, timeoutMs: number): Promise<ProxyData> {
  return new Promise((resolve, reject) => {
    const upstream = new BunWebSocket(url, { headers });
    upstream.binaryType = "arraybuffer";
    const data: ProxyData = { upstream, pending: [] };
    const timer = setTimeout(() => {
      upstream.close();
      reject(new Error(`timeout ${timeoutMs}ms`));
    }, timeoutMs);
    upstream.onopen = () => (clearTimeout(timer), resolve(data));
    upstream.onerror = () => {
      clearTimeout(timer);
      reject(new Error("upstream websocket error"));
      if (data.client) {
        console.warn(`livekit.proxy: upstream WS error ${url.pathname}`);
        data.client.close(WS_INTERNAL_ERROR, "livekit upstream error");
      }
    };
    upstream.onmessage = (e: MessageEvent<string | ArrayBuffer>) => {
      // ponytail: tanpa backpressure (signaling bervolume kecil); tambahkan bila send() sering mengembalikan -1.
      if (data.client) data.client.send(e.data);
      else data.pending.push(e.data);
    };
    upstream.onclose = (e) => data.client?.close(toClientCode(e.code), e.reason);
  });
}

/** Handler `websocket` Bun.serve: relay dua arah klien ↔ upstream, tutup berpasangan. */
export const livekitWebSocket: WebSocketHandler<ProxyData> = {
  open(ws) {
    const { upstream, pending } = ws.data;
    if (upstream.readyState !== WebSocket.OPEN) return ws.close(WS_INTERNAL_ERROR, "livekit upstream closed");
    ws.data.client = ws;
    for (const msg of pending.splice(0)) ws.send(msg);
  },
  message(ws, msg) {
    ws.data.upstream.send(msg);
  },
  close(ws, code, reason) {
    ws.data.upstream.close(toUpstreamCode(code), reason);
  },
};

/**
 * Handler route `/livekit` & `/livekit/*`. Upstream WS dibuka dulu: bila gagal → 502 (upgrade gagal), sehingga
 * livekit-client memanggil `/rtc/v1/validate` (juga lewat proxy) dan mendapat pesan error asli LiveKit (mis. 401).
 * `timeoutMs` membatasi connect WS + request HTTP ke upstream (LiveKit remote yang lambat/tak menjawab).
 */
export function livekitProxy(livekitUrl: string, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  return async (req: Request, server: Server<ProxyData>): Promise<Response | undefined> => {
    // Log hanya pathname: query berisi access_token.
    const path = new URL(req.url).pathname;
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      let data: ProxyData;
      try {
        data = await openUpstream(upstreamUrl(req.url, livekitUrl, "ws"), forwardedHeaders(req.headers), timeoutMs);
      } catch (cause) {
        console.warn(`livekit.proxy: upstream WS gagal ${path}: ${(cause as Error).message}`);
        return new Response("livekit upstream unavailable", { status: HTTP_BAD_GATEWAY });
      }
      if (server.upgrade(req, { data })) return undefined;
      data.upstream.close();
      return new Response("websocket upgrade failed", { status: HTTP_BAD_GATEWAY });
    }
    if (!ALLOWED_METHODS.has(req.method)) return new Response(null, { status: HTTP_METHOD_NOT_ALLOWED });
    try {
      const res = await fetch(upstreamUrl(req.url, livekitUrl, "http"), {
        method: req.method,
        headers: forwardedHeaders(req.headers),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // fetch Bun sudah men-decompress body → header encoding/length upstream tak lagi cocok.
      const headers = new Headers(res.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(res.body, { status: res.status, headers });
    } catch (cause) {
      console.warn(`livekit.proxy: upstream HTTP ${req.method} ${path} gagal: ${(cause as Error).message}`);
      return new Response("livekit upstream unavailable", { status: HTTP_BAD_GATEWAY });
    }
  };
}
