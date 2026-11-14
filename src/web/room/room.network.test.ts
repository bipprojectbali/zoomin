import { describe, expect, spyOn, test } from "bun:test";
import { ConnectionQuality } from "livekit-client";
import { ApiRequestError } from "../api.client";
import { logJoinFailure, logMediaFailure } from "./room.connection";
import { RECONNECT_GIVE_UP_MS, cappedReconnectPolicy, elapsedLabel, networkBannerFor } from "./room.network";

const Q = ConnectionQuality;

describe("networkBannerFor", () => {
  test("offline / quality lost saat masih connected → 'lost' (sebelum LiveKit Reconnecting)", () => {
    expect(networkBannerFor({ status: "connected", online: false, quality: Q.Good })).toBe("lost");
    expect(networkBannerFor({ status: "connected", online: true, quality: Q.Lost })).toBe("lost");
    expect(networkBannerFor({ status: "reconnecting", online: true, quality: Q.Excellent })).toBe("lost");
  });

  test("poor → 'weak'; sehat → tidak ada banner", () => {
    expect(networkBannerFor({ status: "connected", online: true, quality: Q.Poor })).toBe("weak");
    expect(networkBannerFor({ status: "connected", online: true, quality: Q.Good })).toBeNull();
    expect(networkBannerFor({ status: "connected", online: true, quality: Q.Unknown })).toBeNull();
  });

  test("di luar connected/reconnecting tidak ada banner (layar status yang tampil)", () => {
    expect(networkBannerFor({ status: "disconnected", online: false, quality: Q.Lost })).toBeNull();
    expect(networkBannerFor({ status: "left", online: false, quality: Q.Lost })).toBeNull();
  });
});

test("elapsedLabel: detik lalu menit", () => {
  expect(elapsedLabel(0)).toBe("0 s");
  expect(elapsedLabel(12_400)).toBe("12 s");
  expect(elapsedLabel(65_000)).toBe("1 min 5 s");
  expect(elapsedLabel(-500)).toBe("0 s");
});

describe("cappedReconnectPolicy", () => {
  const base = { nextRetryDelayInMs: () => 1234 };
  test("di bawah batas → jeda dari kebijakan dasar", () => {
    expect(cappedReconnectPolicy(RECONNECT_GIVE_UP_MS, base).nextRetryDelayInMs({ retryCount: 3, elapsedMs: 10_000 })).toBe(1234);
  });
  test("melewati batas → null (berhenti, layar terputus)", () => {
    expect(cappedReconnectPolicy(RECONNECT_GIVE_UP_MS, base).nextRetryDelayInMs({ retryCount: 3, elapsedMs: RECONNECT_GIVE_UP_MS })).toBeNull();
  });
  test("default LiveKit tetap menyerah sendiri saat percobaan habis", () => {
    expect(cappedReconnectPolicy().nextRetryDelayInMs({ retryCount: 99, elapsedMs: 0 })).toBeNull();
  });
});

describe("log level (QA-10)", () => {
  test("4xx wajar → warn tanpa stack; 5xx → error", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    expect(logJoinFailure("join", new ApiRequestError(401, { error: "x" }, "GET /x")).kind).toBe("unauthorized");
    expect(warn).toHaveBeenLastCalledWith("join: unauthorized");
    expect(error).not.toHaveBeenCalled();
    expect(logJoinFailure("join", new ApiRequestError(503, { error: "x" }, "GET /x")).kind).toBe("server");
    expect(error).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    error.mockRestore();
  });

  test("izin media ditolak → warn; error lain → error", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    logMediaFailure("cam", Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    expect(warn).toHaveBeenLastCalledWith("cam: NotAllowedError");
    logMediaFailure("cam", new Error("boom"));
    expect(error).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    error.mockRestore();
  });
});
