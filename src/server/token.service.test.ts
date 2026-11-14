import { describe, expect, test } from "bun:test";
import { TokenVerifier } from "livekit-server-sdk";
import type { Role } from "../shared/api.types";
import { loadConfig } from "./config";
import { createJoinToken, grantsForRole, JOIN_TOKEN_TTL_SECONDS } from "./token.service";

const config = loadConfig({});
const verifier = new TokenVerifier(config.livekitApiKey, config.livekitApiSecret);
const PUBLISH_SOURCES = ["camera", "microphone", "screen_share", "screen_share_audio"];
const ROOM = "unit-room"; // test-only

const decode = async (role: Role) =>
  verifier.verify(await createJoinToken({ room: ROOM, identity: `u-${role}`, name: "Nama", role }, config));

describe("createJoinToken grants", () => {
  test.each(["admin", "participant"] as const)("%s: publish 4 sources + subscribe, tanpa roomAdmin", async (role) => {
    const c = await decode(role);
    expect(c.sub).toBe(`u-${role}`);
    expect(c.name).toBe("Nama");
    expect(c.video?.room).toBe(ROOM);
    expect(c.video?.roomJoin).toBe(true);
    expect(c.video?.canSubscribe).toBe(true);
    expect(c.video?.canPublish).toBe(true);
    expect(c.video?.canPublishData).toBe(false);
    expect(c.video?.canPublishSources as unknown as string[]).toEqual(PUBLISH_SOURCES);
    expect(c.video?.roomAdmin).toBeUndefined();
    expect(c.video?.canUpdateOwnMetadata).toBeUndefined();
  });

  test("admin: roomAdmin eksplisit undefined (token & grantsForRole)", async () => {
    expect((await decode("admin")).video?.roomAdmin).toBeUndefined();
    expect("roomAdmin" in grantsForRole("admin")).toBe(false);
  });

  test("viewer: hanya subscribe", async () => {
    const c = await decode("viewer");
    expect(c.video?.roomJoin).toBe(true);
    expect(c.video?.canSubscribe).toBe(true);
    expect(c.video?.canPublish).toBe(false);
    expect(c.video?.canPublishData).toBe(false);
    expect(c.video?.canPublishSources).toBeUndefined();
    expect(c.video?.roomAdmin).toBeUndefined();
  });

  test.each(["admin", "participant", "viewer"] as const)("metadata role %s", async (role) => {
    expect(JSON.parse((await decode(role)).metadata ?? "{}")).toEqual({ role });
  });

  test("TTL sesuai konstanta (2 jam)", async () => {
    const c = await decode("viewer");
    expect(JOIN_TOKEN_TTL_SECONDS).toBe(7200);
    expect(c.exp! - c.nbf!).toBe(JOIN_TOKEN_TTL_SECONDS);
  });

  test.each([
    { room: "", identity: "a", role: "viewer" },
    { room: "r", identity: "", role: "viewer" },
    { room: "../etc", identity: "a", role: "viewer" },
    { room: "r", identity: "a b", role: "viewer" },
    { room: "r".repeat(65), identity: "a", role: "viewer" },
    { room: "r", identity: "a", role: "superuser" },
  ])("input invalid ditolak: %o", async (input) => {
    await expect(createJoinToken({ ...input, role: input.role as Role }, config)).rejects.toThrow("createJoinToken");
  });
});
