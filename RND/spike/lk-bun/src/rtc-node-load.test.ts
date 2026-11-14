import { expect, test } from "bun:test";
import { AudioSource, Room } from "@livekit/rtc-node";

// Risiko spike: native binding rtc-node (napi) belum terbukti jalan di Bun.
test("rtc-node: new Room() di Bun", () => {
  const room = new Room();
  expect(room).toBeInstanceOf(Room);
  expect(room.isConnected).toBe(false);
});

// new Room() belum memanggil FFI; AudioSource mengirim request FFI sinkron
// sehingga benar-benar memuat & memakai native binding.
test("rtc-node: request FFI native via AudioSource", async () => {
  const source = new AudioSource(48000, 1);
  expect(source.closed).toBe(false);
  await source.close();
  expect(source.closed).toBe(true);
});
