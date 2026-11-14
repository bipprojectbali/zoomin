import type { ApiError, ApiErrorCode } from "../shared/api.types";

/** Body error standar API: `code` stabil untuk diterjemahkan web, `error` teks teknis singkat, `path` field yang gagal. */
export const apiError = (code: ApiErrorCode, error: string, path?: string): ApiError =>
  path ? { error, code, path } : { error, code };
