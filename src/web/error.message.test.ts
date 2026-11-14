import { describe, expect, test } from "bun:test";
import type { ApiErrorCode } from "../shared/api.types";
import { ApiRequestError, parseRetryAfter } from "./api.client";
import { authErrorMessage, errorMessage, mediaErrorMessage, rateLimitedText } from "./error.message";

const apiErr = (status: number, code?: ApiErrorCode, path?: string) =>
  new ApiRequestError(status, { error: "raw english text", code, path }, "TEST /api/x");

const mediaErr = (name: string) => new DOMException("raw", name);

describe("errorMessage — API", () => {
  test("setiap kode dipetakan ke pesan Indonesia, tidak pernah teks mentah server", () => {
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
    expect(errorMessage(apiErr(403, "banned"))).toContain("diblokir");
    expect(errorMessage(apiErr(403, "insufficient_role"))).toContain("Peran akun");
    expect(errorMessage(apiErr(409, "room_exists"))).toContain("ID room sudah dipakai");
    expect(errorMessage(apiErr(400, "invite_invalid"))).toContain("Minta link baru ke admin room");
  });

  test("invalid_input dengan path menyebut field", () => {
    expect(errorMessage(apiErr(400, "invalid_input", "/id"))).toContain("ID room");
    expect(errorMessage(apiErr(400, "invalid_input", "title"))).toContain("Judul room");
    expect(errorMessage(apiErr(400, "invalid_input", "unknownField"))).toBe(errorMessage(apiErr(400, "invalid_input")));
  });

  test("tanpa kode: fallback per status", () => {
    expect(errorMessage(apiErr(401))).toContain("Sesi Anda sudah berakhir");
    expect(errorMessage(apiErr(403))).toContain("tidak punya akses");
    expect(errorMessage(apiErr(404))).toContain("tidak ditemukan");
    expect(errorMessage(apiErr(429))).toContain("Terlalu banyak percobaan");
    expect(errorMessage(apiErr(502))).toContain("Server sedang bermasalah");
    expect(errorMessage(apiErr(418))).toContain("kesalahan tak terduga");
  });
});

describe("rate limit + Retry-After", () => {
  const limited = (retryAfter: number | null, code: ApiErrorCode | undefined = "rate_limited") =>
    new ApiRequestError(429, { error: "raw english text", code }, "TEST /api/x", retryAfter);

  test("menit dibulatkan ke atas, <60 dtk dalam detik", () => {
    expect(errorMessage(limited(898))).toBe("Terlalu banyak percobaan. Coba lagi dalam 15 menit.");
    expect(errorMessage(limited(60))).toBe("Terlalu banyak percobaan. Coba lagi dalam 1 menit.");
    expect(errorMessage(limited(61))).toBe("Terlalu banyak percobaan. Coba lagi dalam 2 menit.");
    expect(errorMessage(limited(59))).toBe("Terlalu banyak percobaan. Coba lagi dalam 59 detik.");
    expect(rateLimitedText(0)).toBe("Terlalu banyak percobaan. Coba lagi dalam 1 detik.");
  });
  test("429 tanpa kode tetap memakai Retry-After; tanpa header → teks umum", () => {
    expect(errorMessage(limited(120, undefined))).toContain("2 menit");
    expect(errorMessage(limited(null))).toBe("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
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
    expect(errorMessage(new TypeError("Failed to fetch"))).toContain("Periksa koneksi internet");
  });
  test("AbortError", () => {
    expect(errorMessage(mediaErr("AbortError"))).toContain("dibatalkan");
  });
  test("Error biasa memakai message; nilai lain teks umum", () => {
    expect(errorMessage(new Error("Pesan khusus"))).toBe("Pesan khusus");
    expect(errorMessage("x")).toContain("kesalahan tak terduga");
    expect(errorMessage(null)).toContain("kesalahan tak terduga");
  });
  test("error media tanpa jenis memakai kata 'perangkat'", () => {
    expect(errorMessage(mediaErr("NotAllowedError"))).toContain("Akses perangkat ditolak");
  });
});

describe("mediaErrorMessage", () => {
  test("izin ditolak kamera/mik menyebut ikon gembok", () => {
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "camera")).toContain("Akses kamera ditolak");
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "mic")).toContain("Akses mikrofon ditolak");
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "camera")).toContain("ikon gembok");
  });
  test("perangkat tidak ada / sedang dipakai / constraint", () => {
    expect(mediaErrorMessage(mediaErr("NotFoundError"), "mic")).toStartWith("Mikrofon tidak ditemukan");
    expect(mediaErrorMessage(mediaErr("NotReadableError"), "camera")).toContain("dipakai aplikasi lain");
    // OverconstrainedError di Chrome bukan DOMException, cukup cocok di `name`.
    expect(mediaErrorMessage({ name: "OverconstrainedError", constraint: "deviceId" }, "camera")).toContain("Pilih kamera lain");
  });
  test("layar: batal picker dan izin rekam layar OS", () => {
    expect(mediaErrorMessage(mediaErr("NotAllowedError"), "screen")).toContain("Berbagi layar dibatalkan");
    expect(mediaErrorMessage(mediaErr("NotReadableError"), "screen")).toContain("izin rekam layar");
    expect(mediaErrorMessage(mediaErr("NotSupportedError"), "screen")).toContain("tidak mendukung berbagi layar");
  });
  test("nama tak dikenal: fallback umum", () => {
    expect(mediaErrorMessage(new Error("boom"), "camera")).toBe("Kamera tidak bisa dipakai. Muat ulang halaman lalu coba lagi.");
  });
});

describe("authErrorMessage — ?error= login Better Auth", () => {
  test("domain & ban (case-insensitive)", () => {
    expect(authErrorMessage("email_domain_not_allowed")).toContain("Domain email");
    expect(authErrorMessage("BANNED_USER")).toContain("diblokir");
    expect(authErrorMessage("banned")).toBe(authErrorMessage("BANNED_USER"));
  });
  test("provider Google belum dikonfigurasi", () => {
    expect(authErrorMessage("PROVIDER_NOT_FOUND")).toBe("Login Google belum dikonfigurasi admin server.");
  });
  test("kode tak dikenal tetap pesan Indonesia + kodenya", () => {
    expect(authErrorMessage("weird_code")).toBe("Login gagal (weird_code). Coba lagi, atau hubungi admin zoomin.");
  });
});
