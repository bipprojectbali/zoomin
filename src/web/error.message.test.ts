import { describe, expect, test } from "bun:test";
import type { ApiErrorCode } from "../shared/api.types";
import { ApiRequestError, parseRetryAfter } from "./api.client";
import { authErrorMessage, errorMessage, mediaErrorMessage, rateLimitedText } from "./error.message";

const apiErr = (status: number, code?: ApiErrorCode, path?: string) =>
  new ApiRequestError(status, { error: "raw english text", code, path }, "TEST /api/x");

const mediaErr = (name: string) => new DOMException("raw", name);

describe("errorMessage — API", () => {
  test("setiap kode dipetakan ke pesan English, tidak pernah teks mentah server", () => {
    const codes: ApiErrorCode[] = [
      "unauthorized",
      "forbidden",
      "not_found",
      "room_not_found",
      "room_exists",
      "invalid_input",
      "invite_invalid",
      "rate_limited",
      "layout_conflict",
      "banned",
      "email_domain_not_allowed",
      "cannot_modify_self",
      "insufficient_role",
      "user_not_found",
    ];
    const msgs = codes.map((c) => errorMessage(apiErr(400, c)));
    for (const m of msgs) expect(m).not.toContain("raw english text");
    expect(new Set(msgs).size).toBe(codes.length);
  });

  test("pesan spesifik dengan saran tindakan", () => {
    expect(errorMessage(apiErr(403, "banned"))).toContain("banned");
    expect(errorMessage(apiErr(403, "insufficient_role"))).toContain("account role");
    expect(errorMessage(apiErr(409, "room_exists"))).toContain("room ID is already taken");
    expect(errorMessage(apiErr(400, "invite_invalid"))).toContain("Ask the room host for a new one");
  });

  test("invalid_input dengan path menyebut field", () => {
    expect(errorMessage(apiErr(400, "invalid_input", "/id"))).toContain("Room ID");
    expect(errorMessage(apiErr(400, "invalid_input", "title"))).toContain("Room title");
    expect(errorMessage(apiErr(400, "invalid_input", "unknownField"))).toBe(errorMessage(apiErr(400, "invalid_input")));
  });

  test("tanpa kode: fallback per status", () => {
    expect(errorMessage(apiErr(401))).toContain("Your session has ended");
    expect(errorMessage(apiErr(403))).toContain("don't have access");
    expect(errorMessage(apiErr(404))).toContain("Not found");
    expect(errorMessage(apiErr(429))).toContain("Too many attempts");
    expect(errorMessage(apiErr(502))).toContain("server is having trouble");
    expect(errorMessage(apiErr(418))).toContain("Something went wrong");
  });
});

describe("rate limit + Retry-After", () => {
  const limited = (retryAfter: number | null, code: ApiErrorCode | undefined = "rate_limited") =>
    new ApiRequestError(429, { error: "raw english text", code }, "TEST /api/x", retryAfter);

  test("menit dibulatkan ke atas, <60 dtk dalam detik", () => {
    expect(errorMessage(limited(898))).toBe("Too many attempts. Try again in 15 minutes.");
    expect(errorMessage(limited(60))).toBe("Too many attempts. Try again in 1 minute.");
    expect(errorMessage(limited(61))).toBe("Too many attempts. Try again in 2 minutes.");
    expect(errorMessage(limited(59))).toBe("Too many attempts. Try again in 59 seconds.");
    expect(rateLimitedText(0)).toBe("Too many attempts. Try again in 1 second.");
  });
  test("429 tanpa kode tetap memakai Retry-After; tanpa header → teks umum", () => {
    expect(errorMessage(limited(120, undefined))).toContain("2 minutes");
    expect(errorMessage(limited(null))).toBe("Too many attempts. Wait a moment and try again.");
  });
  test("parseRetryAfter: detik saja", () => {
    expect(parseRetryAfter("898")).toBe(898);
    expect(parseRetryAfter(" 5 ")).toBe(5);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(parseRetryAfter("-3")).toBeNull();
  });
});

describe("errorMessage — non-API", () => {
  test("TypeError fetch = jaringan", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toContain("Check your internet connection");
  });
  test("AbortError", () => {
    expect(errorMessage(mediaErr("AbortError"))).toContain("canceled");
  });
  test("Error biasa memakai message; nilai lain teks umum", () => {
    expect(errorMessage(new Error("Pesan khusus"))).toBe("Pesan khusus");
    expect(errorMessage("x")).toContain("Something went wrong");
    expect(errorMessage(null)).toContain("Something went wrong");
  });
  test("error media tanpa jenis memakai kata 'device'", () => {
    expect(errorMessage(mediaErr("NotAllowedError"))).toContain("Device access was denied");
  });
});

describe("mediaErrorMessage", () => {
  test("izin ditolak kamera/mik menyebut ikon gembok", () => {
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "camera")).toContain("Camera access was denied");
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "mic")).toContain("Microphone access was denied");
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "camera")).toContain("lock icon");
  });
  test("perangkat tidak ada / sedang dipakai / constraint", () => {
    expect(mediaErrorMessage(mediaErr("NotFoundError"), "mic")).toStartWith("No microphone found");
    expect(mediaErrorMessage(mediaErr("NotReadableError"), "camera")).toContain("in use by another app");
    // OverconstrainedError di Chrome bukan DOMException, cukup cocok di `name`.
    expect(mediaErrorMessage({ name: "OverconstrainedError", constraint: "deviceId" }, "camera")).toContain("Choose another camera");
  });
  test("layar: batal picker dan izin rekam layar OS", () => {
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "screen")).toContain("Screen sharing was canceled");
    expect(mediaErrorMessage(mediaErr("NotReadableError"), "screen")).toContain("screen recording permission");
    expect(mediaErrorMessage(mediaErr("NotSupportedError"), "screen")).toContain("doesn't support screen sharing");
  });
  test("nama tak dikenal: fallback umum", () => {
    expect(mediaErrorMessage(new Error("boom"), "camera")).toBe("The camera can't be used. Reload the page and try again.");
  });
});

describe("authErrorMessage — ?error= login Better Auth", () => {
  test("domain & ban (case-insensitive)", () => {
    expect(authErrorMessage("email_domain_not_allowed")).toContain("email domain");
    expect(authErrorMessage("BANNED_USER")).toContain("banned");
    expect(authErrorMessage("banned")).toBe(authErrorMessage("BANNED_USER"));
  });
  test("provider Google belum dikonfigurasi", () => {
    expect(authErrorMessage("PROVIDER_NOT_FOUND")).toBe("Google sign-in hasn't been configured by the server admin.");
  });
  test("kode tak dikenal tetap pesan English + kodenya", () => {
    expect(authErrorMessage("weird_code")).toBe("Sign-in failed (weird_code). Try again, or contact your zoomin admin.");
  });
});
