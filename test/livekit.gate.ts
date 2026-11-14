/**
 * ZOOMIN_SKIP_LIVEKIT_TESTS=1 → lewati test yang butuh LiveKit dev nyata (ws://127.0.0.1:7880). Hanya untuk CI tanpa
 * LiveKit (.github/workflows/docker.yml); bun test tetap melaporkannya sebagai `skip`, lokal default tetap dijalankan.
 */
export const SKIP_LIVEKIT_TESTS = process.env.ZOOMIN_SKIP_LIVEKIT_TESTS === "1";
