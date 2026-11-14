import { describe, expect, test } from "bun:test";
import { ConnectionError, ConnectionState, DisconnectReason } from "livekit-client";
import { ApiRequestError } from "../api.client";
import { errorMessage } from "../error.message";
import { canPublishFor, connectionErrorMessage, disconnectMessage, statusFromConnectionState } from "./room.connection";

const apiError = (status: number, error = "pesan server") => new ApiRequestError(status, { error }, "POST /x");

describe("canPublishFor", () => {
  test("admin & participant boleh publish, viewer & null tidak", () => {
    expect(canPublishFor("admin")).toBe(true);
    expect(canPublishFor("participant")).toBe(true);
    expect(canPublishFor("viewer")).toBe(false);
    expect(canPublishFor(null)).toBe(false);
  });
});

describe("connectionErrorMessage", () => {
  test("status API dikenal → teks khusus", () => {
    expect(connectionErrorMessage(apiError(401))).toBe("Sesi berakhir, silakan masuk lagi");
    expect(connectionErrorMessage(apiError(403))).toBe("Anda bukan anggota room ini");
    expect(connectionErrorMessage(apiError(404))).toBe("Room tidak ditemukan");
  });

  test("status API lain → body.error dari server", () => {
    expect(connectionErrorMessage(apiError(500, "db mati"))).toBe("db mati");
  });

  test("ConnectionError LiveKit → teks server media", () => {
    expect(connectionErrorMessage(ConnectionError.timeout("ws timeout"))).toBe("Gagal terhubung ke server media");
  });

  test("Error biasa → message", () => {
    expect(connectionErrorMessage(new Error("boom"))).toBe("boom");
  });
});

describe("statusFromConnectionState", () => {
  test("reconnecting dipetakan ke connecting", () => {
    expect(statusFromConnectionState(ConnectionState.Connected)).toBe("connected");
    expect(statusFromConnectionState(ConnectionState.Disconnected)).toBe("disconnected");
    expect(statusFromConnectionState(ConnectionState.Connecting)).toBe("connecting");
    expect(statusFromConnectionState(ConnectionState.Reconnecting)).toBe("connecting");
    expect(statusFromConnectionState(ConnectionState.SignalReconnecting)).toBe("connecting");
  });
});

describe("disconnectMessage", () => {
  test("keluar sendiri → null (tanpa error)", () => {
    expect(disconnectMessage(DisconnectReason.CLIENT_INITIATED)).toBeNull();
  });

  test("alasan dikenal → teks khusus, lainnya → terputus umum", () => {
    expect(disconnectMessage(DisconnectReason.DUPLICATE_IDENTITY)).toBe("Akun ini masuk dari tab atau perangkat lain");
    expect(disconnectMessage(DisconnectReason.PARTICIPANT_REMOVED)).toBe("Anda dikeluarkan dari room");
    expect(disconnectMessage(DisconnectReason.ROOM_DELETED)).toBe("Room sudah dihapus");
    expect(disconnectMessage(undefined)).toBe("Koneksi ke room terputus");
  });
});

describe("errorMessage", () => {
  test("ApiRequestError → body.error; TypeError fetch → teks jaringan; non-Error → teks umum", () => {
    expect(errorMessage(apiError(400, "id tidak valid"))).toBe("id tidak valid");
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe("Tidak dapat menghubungi server, periksa koneksi");
    expect(errorMessage("x")).toBe("Terjadi kesalahan tak terduga");
  });
});
