/**
 * Header internal berisi IP peer TCP. Diisi main.ts dari `server.requestIP(req)` (Elysia yang di-mount via `api.fetch`
 * tidak menerima objek server Bun) dan selalu ditimpa di sana, jadi nilai kiriman klien tidak pernah dipercaya.
 */
export const CLIENT_IP_HEADER = "x-zoomin-client-ip";
const UNKNOWN_IP = "unknown";

/**
 * IP klien untuk kunci rate limit. `trustProxy` (TRUST_PROXY=true, mis. di belakang Caddy) → entri paling kanan
 * X-Forwarded-For, yaitu yang ditambahkan proxy terdekat; entri kiri bisa dipalsukan klien. Tanpa itu → peer TCP.
 */
export function clientIp(request: Request, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  return request.headers.get(CLIENT_IP_HEADER) || UNKNOWN_IP;
}

/**
 * Rate limiter fixed-window in-memory per kunci (IP). `retryAfter` → detik sampai boleh lagi (0 = boleh).
 * Entri kedaluwarsa dibersihkan saat `hit`, maksimal sekali per jendela, jadi memori tidak tumbuh tanpa batas.
 * ponytail: state per-proses; multi-instance/restart → hitungan terpisah/hilang. Butuh store bersama (Redis/SQLite) bila scale out.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const entries = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = Date.now();

  const live = (key: string, now: number) => {
    const e = entries.get(key);
    return e && e.resetAt > now ? e : undefined;
  };

  return {
    retryAfter(key: string): number {
      const now = Date.now();
      const e = live(key, now);
      return e && e.count >= max ? Math.ceil((e.resetAt - now) / 1000) : 0;
    },
    hit(key: string): void {
      const now = Date.now();
      if (now - lastSweep >= windowMs) {
        for (const [k, e] of entries) if (e.resetAt <= now) entries.delete(k);
        lastSweep = now;
      }
      const e = live(key, now);
      if (e) e.count++;
      else entries.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key: string): void {
      entries.delete(key);
    },
    /** Jumlah kunci tersimpan (untuk test pembersihan). */
    get size(): number {
      return entries.size;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
