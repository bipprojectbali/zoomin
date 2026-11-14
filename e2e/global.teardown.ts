import { rmSync } from "node:fs";

/** Hapus folder DB sementara server e2e (dibuat di playwright.config.ts). */
export default function globalTeardown() {
  const dir = process.env.E2E_DB_DIR;
  if (dir) rmSync(dir, { recursive: true, force: true });
}
