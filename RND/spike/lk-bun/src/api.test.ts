import { describe, expect, test } from "bun:test";
import { TokenVerifier } from "livekit-server-sdk";
import { app } from "./api";
import { livekitConfig } from "./config";

const post = (body: unknown) =>
  app.handle(
    new Request("http://localhost/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /token", () => {
  test("200 + token valid", async () => {
    const res = await post({ room: "r1", identity: "alice", name: "Alice", role: "admin" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; url: string };
    expect(json.url).toBe(livekitConfig.url);
    const claims = await new TokenVerifier(livekitConfig.apiKey, livekitConfig.apiSecret).verify(json.token);
    expect(claims.sub).toBe("alice");
    expect(claims.video?.roomAdmin).toBe(true);
  });

  test.each([
    { room: "", identity: "a", role: "viewer" },
    { room: "r", identity: "a b", role: "viewer" },
    { room: "r", identity: "a", role: "superuser" },
    { room: "r", role: "viewer" },
  ])("400 untuk body invalid: %o", async (body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
  });
});
