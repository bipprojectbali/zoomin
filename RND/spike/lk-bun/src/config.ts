/** Konfigurasi koneksi LiveKit, dibaca dari env. */
export const livekitConfig = {
  url: process.env.LIVEKIT_URL ?? "ws://127.0.0.1:7880", // test-only dev default
  apiKey: process.env.LIVEKIT_API_KEY ?? "devkey", // test-only dev default
  apiSecret: process.env.LIVEKIT_API_SECRET ?? "secret", // test-only dev default
} as const;
