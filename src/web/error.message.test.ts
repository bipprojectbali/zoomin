import { describe, expect, test } from "bun:test";
import type { ApiErrorCode } from "../shared/api.types";
import { ApiRequestError } from "./api.client";
import { errorMessage, mediaErrorMessage } from "./error.message";

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
      "invalid_credentials",
      "rate_limited",
      "layout_conflict",
    ];
    const msgs = codes.map((c) => errorMessage(apiErr(400, c)));
    for (const m of msgs) expect(m).not.toContain("raw english text");
    expect(new Set(msgs).size).toBe(codes.length);
  });

  test("pesan spesifik dengan saran tindakan", () => {
    expect(errorMessage(apiErr(401, "invalid_credentials"))).toBe("Password salah. Periksa lalu coba lagi.");
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
