import { expect, test } from "bun:test";

test("default dev bila env kosong", async () => {
  const env = { ...process.env };
  delete env.LIVEKIT_URL;
  delete env.LIVEKIT_API_KEY;
  delete env.LIVEKIT_API_SECRET;
  // subprocess agar env bersih & modul dievaluasi ulang
  const out = Bun.spawnSync(
    ["bun", "-e", "import { livekitConfig } from './src/config.ts'; console.log(JSON.stringify(livekitConfig))"],
    { env, cwd: import.meta.dir + "/.." },
  );
  expect(JSON.parse(out.stdout.toString())).toEqual({
    url: "ws://127.0.0.1:7880",
    apiKey: "devkey",
    apiSecret: "secret",
  });
});

test("env override default", () => {
  const out = Bun.spawnSync(
    ["bun", "-e", "import { livekitConfig } from './src/config.ts'; console.log(livekitConfig.url, livekitConfig.apiKey)"],
    { env: { ...process.env, LIVEKIT_URL: "wss://x.example", LIVEKIT_API_KEY: "k1" }, cwd: import.meta.dir + "/.." },
  );
  expect(out.stdout.toString().trim()).toBe("wss://x.example k1");
});
