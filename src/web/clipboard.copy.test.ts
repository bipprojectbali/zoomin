import { describe, expect, mock, test } from "bun:test";
import { type ClipboardEnv, copyText } from "./clipboard.copy";

/** Dokumen palsu: cukup untuk jalur textarea + execCommand. */
function fakeDocument(execResult: boolean) {
  const appended: { value: string }[] = [];
  const doc = {
    activeElement: null,
    body: { appendChild: (el: { value: string }) => appended.push(el) },
    createElement: () => ({ value: "", style: {}, setAttribute() {}, select() {}, remove() {} }),
    execCommand: mock(() => execResult),
  };
  return { doc: doc as unknown as ClipboardEnv["document"], execCommand: doc.execCommand, appended };
}

describe("copyText", () => {
  test("secure context + Clipboard API → writeText, tanpa execCommand", async () => {
    const writeText = mock(async () => {});
    const { doc, execCommand } = fakeDocument(true);
    await copyText("http://x/invite/1", { isSecureContext: true, clipboard: { writeText }, document: doc });
    expect(writeText).toHaveBeenCalledWith("http://x/invite/1");
    expect(execCommand).not.toHaveBeenCalled();
  });

  test("bukan secure context (mis. http://0.0.0.0) → textarea + execCommand('copy')", async () => {
    const { doc, execCommand, appended } = fakeDocument(true);
    await copyText("http://0.0.0.0:3000/invite/1", { isSecureContext: false, clipboard: undefined, document: doc });
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appended[0]?.value).toBe("http://0.0.0.0:3000/invite/1");
  });

  test("writeText ditolak NotAllowedError → fallback execCommand", async () => {
    const writeText = mock(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { doc, execCommand } = fakeDocument(true);
    await copyText("t", { isSecureContext: true, clipboard: { writeText }, document: doc });
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  test("execCommand mengembalikan false → throw bercontext", async () => {
    const { doc } = fakeDocument(false);
    await expect(copyText("t", { isSecureContext: false, document: doc })).rejects.toThrow(/clipboard: salin gagal \(secure=false/);
  });
});
