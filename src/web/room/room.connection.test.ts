import { describe, expect, test } from "bun:test";
import { ConnectionError, ConnectionState, DisconnectReason } from "livekit-client";
import { ApiRequestError } from "../api.client";
import { errorMessage } from "../error.message";
import {
  canPublishFor,
  canRetry,
  controlsEnabled,
  disconnectErrorFor,
  joinErrorFor,
  statusFromConnectionState,
  type ConnectionStatus,
} from "./room.connection";

const apiError = (status: number, error = "pesan server") => new ApiRequestError(status, { error }, "POST /x");

describe("canPublishFor", () => {
  test("host & participant boleh publish, viewer & null tidak", () => {
    expect(canPublishFor("host")).toBe(true);
    expect(canPublishFor("participant")).toBe(true);
    expect(canPublishFor("viewer")).toBe(false);
    expect(canPublishFor(null)).toBe(false);
  });
});

describe("controlsEnabled", () => {
  test("hanya connected yang mengaktifkan kontrol (BUG-03)", () => {
    const all: ConnectionStatus[] = ["idle", "connecting", "connected", "reconnecting", "disconnected", "left", "error"];
    expect(all.filter(controlsEnabled)).toEqual(["connected"]);
  });
});

describe("joinErrorFor", () => {
  test("401/403/404 → kind khusus", () => {
    expect(joinErrorFor(apiError(401)).kind).toBe("unauthorized");
    expect(joinErrorFor(apiError(403)).kind).toBe("forbidden");
    expect(joinErrorFor(apiError(404))).toEqual({ kind: "room_not_found", message: "Room tidak ditemukan atau sudah dihapus" });
  });

  test("5xx → server; 4xx lain → unknown dengan errorMessage()", () => {
    expect(joinErrorFor(apiError(503)).kind).toBe("server");
    const bad = apiError(400, "id tidak valid");
    expect(joinErrorFor(bad)).toEqual({ kind: "unknown", message: errorMessage(bad) });
  });

  test("fetch gagal & ConnectionError LiveKit → network", () => {
    expect(joinErrorFor(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(joinErrorFor(ConnectionError.timeout("ws timeout"))).toEqual({
      kind: "network",
      message: "Gagal terhubung ke server media",
    });
  });
});

describe("canRetry", () => {
  test("room_not_found/forbidden/unauthorized tidak bisa retry (UX-24)", () => {
    expect(canRetry(joinErrorFor(apiError(404)))).toBe(false);
    expect(canRetry(joinErrorFor(apiError(403)))).toBe(false);
    expect(canRetry(joinErrorFor(apiError(401)))).toBe(false);
  });

  test("network/server/duplicate/null bisa retry", () => {
    expect(canRetry(joinErrorFor(new TypeError("x")))).toBe(true);
    expect(canRetry(joinErrorFor(apiError(500)))).toBe(true);
    expect(canRetry(disconnectErrorFor(DisconnectReason.DUPLICATE_IDENTITY))).toBe(true);
    expect(canRetry(null)).toBe(true);
  });
});

describe("statusFromConnectionState", () => {
  test("reconnecting dibedakan dari connecting", () => {
    expect(statusFromConnectionState(ConnectionState.Connected)).toBe("connected");
    expect(statusFromConnectionState(ConnectionState.Disconnected)).toBe("disconnected");
    expect(statusFromConnectionState(ConnectionState.Connecting)).toBe("connecting");
    expect(statusFromConnectionState(ConnectionState.Reconnecting)).toBe("reconnecting");
    expect(statusFromConnectionState(ConnectionState.SignalReconnecting)).toBe("reconnecting");
  });
});

describe("disconnectErrorFor", () => {
  test("keluar sendiri → null", () => {
    expect(disconnectErrorFor(DisconnectReason.CLIENT_INITIATED)).toBeNull();
  });

  test("alasan dikenal → kind + teks khusus", () => {
    expect(disconnectErrorFor(DisconnectReason.DUPLICATE_IDENTITY)).toEqual({
      kind: "duplicate_session",
      message: "Anda bergabung dari tab atau perangkat lain dengan akun yang sama. Hanya satu sesi yang bisa aktif.",
    });
    expect(disconnectErrorFor(DisconnectReason.PARTICIPANT_REMOVED)?.kind).toBe("forbidden");
    expect(disconnectErrorFor(DisconnectReason.ROOM_DELETED)?.kind).toBe("room_not_found");
    expect(disconnectErrorFor(DisconnectReason.SERVER_SHUTDOWN)?.kind).toBe("server");
  });

  test("lainnya → network (terputus umum)", () => {
    expect(disconnectErrorFor(undefined)).toEqual({ kind: "network", message: "Koneksi ke room terputus" });
    expect(disconnectErrorFor(DisconnectReason.SIGNAL_CLOSE)?.kind).toBe("network");
  });
});
