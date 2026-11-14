import { describe, expect, test } from "bun:test";
import { parseCliArgs, userArgs } from "./cli.args";

describe("parseCliArgs", () => {
  test("tanpa argumen → serve tanpa override", () => {
    expect(parseCliArgs([])).toEqual({ kind: "serve", overrides: {} });
  });

  test("semua flag override, bentuk panjang dan alias", () => {
    const expected = { port: 8080, host: "127.0.0.1", dbPath: "/tmp/z.sqlite", envFile: "/etc/z.env" };
    expect(parseCliArgs(["serve", "--port", "8080", "--host", "127.0.0.1", "--db", "/tmp/z.sqlite", "--env-file", "/etc/z.env"]))
      .toEqual({ kind: "serve", overrides: expected });
    expect(parseCliArgs(["-p", "8080", "-H", "127.0.0.1", "--db=/tmp/z.sqlite", "--env-file=/etc/z.env"]))
      .toEqual({ kind: "serve", overrides: expected });
    expect(parseCliArgs(["migrate", "--db", "x.sqlite"])).toEqual({ kind: "migrate", overrides: { dbPath: "x.sqlite" } });
    expect(parseCliArgs(["check", "-p", "1"])).toEqual({ kind: "check", overrides: { port: 1 } });
  });

  test.each(["0", "65536", "-1", "abc", "80.5", "", "1e3"])("port tidak valid %p → error exit 2", (port) => {
    const result = parseCliArgs(["--port", port]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.exitCode).toBe(2);
  });

  test("port batas 1 dan 65535 valid", () => {
    expect(parseCliArgs(["-p", "65535"])).toEqual({ kind: "serve", overrides: { port: 65535 } });
  });

  test("flag/perintah tak dikenal → error berbahasa Indonesia + saran --help", () => {
    for (const argv of [["--bogus"], ["-x"], ["wat"], ["serve", "extra"], ["--port"]]) {
      const result = parseCliArgs(argv);
      expect(result).toMatchObject({ kind: "error", exitCode: 2 });
      if (result.kind === "error") expect(result.message).toContain("zoomin --help");
    }
    expect(parseCliArgs(["--bogus"])).toMatchObject({ message: expect.stringContaining("Opsi tidak dikenal: --bogus") });
    expect(parseCliArgs(["--port"])).toMatchObject({ message: expect.stringContaining("butuh nilai") });
  });

  test("version menang atas help, docs, dan perintah", () => {
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
    expect(parseCliArgs(["migrate", "--version", "--help", "-d"])).toEqual({ kind: "version" });
  });

  test("help global, per perintah, dan perintah help", () => {
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help", topic: undefined });
    expect(parseCliArgs(["check", "--help"])).toEqual({ kind: "help", topic: "check" });
    expect(parseCliArgs(["help"])).toEqual({ kind: "help", topic: undefined });
    expect(parseCliArgs(["help", "--help"])).toEqual({ kind: "help", topic: "help" });
    expect(parseCliArgs(["help", "migrate"])).toEqual({ kind: "help", topic: "migrate" });
  });

  test("docs dengan dan tanpa topik", () => {
    expect(parseCliArgs(["--docs"])).toEqual({ kind: "docs", topic: undefined });
    expect(parseCliArgs(["-d", "env"])).toEqual({ kind: "docs", topic: "env" });
    expect(parseCliArgs(["docs", "api"])).toEqual({ kind: "docs", topic: "api" });
  });

  test("env → env-example, menolak flag override", () => {
    expect(parseCliArgs(["env"])).toEqual({ kind: "env-example" });
    expect(parseCliArgs(["env", "-p", "1"]).kind).toBe("error");
  });
});

test("userArgs membuang runtime + script (dev dan binary compile)", () => {
  expect(userArgs(["/usr/bin/bun", "/app/src/server/main.ts", "-p", "1"])).toEqual(["-p", "1"]);
  expect(userArgs(["bun", "/$bunfs/root/zoomin", "check"])).toEqual(["check"]);
});
