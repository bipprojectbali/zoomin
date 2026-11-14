import { describe, expect, test } from "bun:test";
import { SKIP_LIVEKIT_TESTS } from "../../test/livekit.gate";
import { createTestDeps } from "../../test/auth.helpers";
import { APP_VERSION } from "../cli/cli.run";
import { getSystemHealth } from "./dev.health";

/** Port TCP lokal yang dipastikan kosong (listen lalu tutup). */
function deadPort(): number {
  const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port } = server;
  server.stop(true);
  return port;
}

describe("getSystemHealth", () => {
  test.skipIf(SKIP_LIVEKIT_TESTS)("LiveKit dev lokal hidup → ok true + latency; info dasar & hitungan DB", async () => {
    const deps = createTestDeps();
    const health = await getSystemHealth(deps);
    expect(health.livekit).toMatchObject({ url: "ws://127.0.0.1:7880", ok: true, error: null });
    expect(health.livekit.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health).toMatchObject({ version: APP_VERSION, bun: Bun.version, nodeEnv: "development", superAdminEmailsConfigured: 1 });
    expect(health.db).toMatchObject({ users: 0, rooms: 0, sizeBytes: null });
    expect(health.db.activeRooms).toBeGreaterThanOrEqual(0);
  });

  test("LiveKit mati (port kosong) → ok false + error, tanpa throw, < 4 dtk", async () => {
    const deps = createTestDeps({ LIVEKIT_URL: `ws://127.0.0.1:${deadPort()}` });
    const started = performance.now();
    const health = await getSystemHealth(deps);
    expect(performance.now() - started).toBeLessThan(4000);
    expect(health.livekit.ok).toBe(false);
    expect(health.livekit.latencyMs).toBeNull();
    expect(health.livekit.error).toBeString();
    expect(health.livekit.error?.length).toBeGreaterThan(0);
    expect(health.db.activeRooms).toBe(0);
  });

  test("LiveKit hang (TCP diam) → timeout jadi ok false", async () => {
    const silent = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    try {
      const deps = createTestDeps({ LIVEKIT_URL: `ws://127.0.0.1:${silent.port}` });
      const health = await getSystemHealth(deps, 200);
      expect(health.livekit).toMatchObject({ ok: false, error: "timeout 200ms" });
    } finally {
      silent.stop(true);
    }
  });

  test("DB file → ukuran file dalam byte", async () => {
    const dbPath = `${process.env.TMPDIR ?? "/tmp"}/zoomin-health-${crypto.randomUUID()}.sqlite`;
    const deps = createTestDeps({ DB_PATH: dbPath });
    try {
      const health = await getSystemHealth(deps);
      expect(health.db.sizeBytes).toBeGreaterThan(0);
    } finally {
      deps.db.close();
      for (const suffix of ["", "-wal", "-shm"]) await Bun.file(dbPath + suffix).delete().catch(() => undefined); // file -wal/-shm bisa tidak ada
    }
  });
});
