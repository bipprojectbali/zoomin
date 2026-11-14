import { describe, expect, test } from "bun:test";
import { TokenVerifier } from "livekit-server-sdk";
import type { RoomRole } from "../shared/api.types";
import { loadConfig } from "./config";
import { AVATAR_URL_MAX, avatarUrlOrNull, createJoinToken, grantsForRole, JOIN_TOKEN_TTL_SECONDS } from "./token.service";

const config = loadConfig({});
const verifier = new TokenVerifier(config.livekitApiKey, config.livekitApiSecret);
const PUBLISH_SOURCES = ["camera", "microphone", "screen_share", "screen_share_audio"];
const ROOM = "unit-room"; // test-only

const decode = async (role: RoomRole) =>
  verifier.verify(await createJoinToken({ room: ROOM, identity: `u-${role}`, name: "Nama", role }, config));

describe("createJoinToken grants", () => {
  test.each(["host", "participant"] as const)("%s: publish 4 sources + subscribe, tanpa roomAdmin", async (role) => {
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

  test("host: roomAdmin eksplisit undefined (token & grantsForRole)", async () => {
    expect((await decode("host")).video?.roomAdmin).toBeUndefined();
    expect("roomAdmin" in grantsForRole("host")).toBe(false);
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

  test.each(["host", "participant", "viewer"] as const)("metadata role %s", async (role) => {
    expect(JSON.parse((await decode(role)).metadata ?? "{}")).toEqual({ role, image: null });
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
    { room: "r", identity: "a", role: "admin" }, // peran room lama, kini host
  ])("input invalid ditolak: %o", async (input) => {
    await expect(createJoinToken({ ...input, role: input.role as RoomRole }, config)).rejects.toThrow("createJoinToken");
  });
});

describe("metadata image", () => {
  const meta = async (image: string | null | undefined) =>
    JSON.parse((await verifier.verify(await createJoinToken({ room: ROOM, identity: "u-img", role: "participant", image }, config))).metadata ?? "{}");

  test("https valid ikut di metadata", async () => {
    const url = "https://lh3.googleusercontent.com/a/abc=s96-c"; // test-only
    expect(await meta(url)).toEqual({ role: "participant", image: url });
  });

  test.each([null, undefined, "", "http://x.test/a.png", "javascript:alert(1)", "data:image/png;base64,AA", "bukan url"])(
    "%p → null",
    async (image) => {
      expect(await meta(image)).toEqual({ role: "participant", image: null });
    },
  );

  test("lebih dari batas panjang → null", () => {
    const long = `https://x.test/${"a".repeat(AVATAR_URL_MAX)}`;
    expect(avatarUrlOrNull(long)).toBeNull();
    expect(avatarUrlOrNull(long.slice(0, AVATAR_URL_MAX))).toBe(long.slice(0, AVATAR_URL_MAX));
  });
});
